"""商品・カート・配送先・注文のツール。

**MCP 層で `db.get(Product, id)` のような素のクエリを書かないこと**——外から任意の商品ID
を渡せる入り口なので、status を添え忘れると未公開商品の名前が外へ出る。判定は既存ルーターと
services/cart.py が唯一の源で、ここは呼んだ結果を views.py の形に移すだけ。

既存ルーター関数は**全引数をキーワードで明示的に渡す**。省略すると既定値の Query/Depends
オブジェクトがそのまま流れ込む。特に visitor_id を省略すると Depends オブジェクトが
truthy になり、record_server_event() が壊れた行を書きにいく（analytics は例外を握って
警告ログにするだけなので、無言で計測が壊れる）。

**visitor_id は常に None を渡す（MCP 経由の操作は計測しない）。** 合成 ID を作ると、曝露が
1 件も無い訪問者の purchase / add_to_cart が analytics_events に混ざり、ファネルの到達率と
CV 総数を歪める。計測を汚す方が欠測より悪い。

ツールは素の `def` で書く（`async def` にすると、SDK が同期関数をワーカースレッドへ逃がす
保護が外れ、psycopg2 のブロッキング I/O がイベントループを塞ぐ）。
"""

from typing import Annotated, Literal

from mcp.server.mcpserver import Context, MCPServer
from mcp.types import ToolAnnotations
from pydantic import Field
from sqlalchemy.orm import Session

from app.mcp_server import views
from app.mcp_server.errors import MSG_NO_ADDRESS, McpToolError
from app.mcp_server.identity import optional_user, require_user
from app.mcp_server.session import tool_session
from app.routers import addresses as addresses_router
from app.routers import cart as cart_router
from app.routers import categories as categories_router
from app.routers import orders as orders_router
from app.routers import products as products_router
from app.schemas import (
    AddressOut,
    CartItemCreate,
    CartItemUpdate,
    CategoryOut,
    OrderDetailOut,
    OrderSummaryOut,
    ProductOut,
)
from app.services import cart as cart_service

SortKey = Literal["newest", "price_asc", "price_desc", "rating", "recommended"]

# 既存挙動の申し送り。REST 側の絞り込みは定価（Product.price）で評価しており、MCP 側で
# effective_price による第二の絞り込みを足すと、同じ検索が経路によって違う結果を返す。
# 直さずに明記するのが正しい（直すなら REST 側を直す別 PR）。
PRICE_BASIS_NOTE = (
    "min_price / max_price と sort=price_asc / price_desc は定価で評価します。"
    "セール中の商品は実売価格が範囲外でも一致することがあります。"
)


def _categories(db: Session) -> list[CategoryOut]:
    """カテゴリ一覧（既存ルーター経由。一覧の定義は 1 か所）。

    名前の引き当てと ID→名前の変換で 2 回引かないよう、呼び出し側は 1 回だけ呼んで
    使い回すこと。件数の少ないマスタなので全件で問題ない。
    """
    return [CategoryOut.model_validate(row) for row in categories_router.list_categories(db=db)]


def _find_category_id(rows: list[CategoryOut], name: str) -> int | None:
    """カテゴリ名（またはスラグ）から category_id を引く。見つからなければ None。

    LLM は category_id を知らないので名前で受ける。合わない名前を黙って無視すると
    「カテゴリで絞ったつもりが全件」という最悪の失敗になるので、呼び出し側は外れたことを
    必ず結果に書いて呼び直させる。
    """
    wanted = name.strip().casefold()
    for row in rows:
        if row.name.casefold() == wanted or row.slug.casefold() == wanted:
            return row.id
    return None


def _resolve_item_id(db: Session, user_id: int, product_id: int) -> int:
    """ツールの product_id を、既存ルーターが要求する明細 id に変換する。

    ツールの引数は product_id に統一する（LLM に 2 種類の ID を持たせない）。引き当ては
    services/cart.py に置いてある（所有の絞り込みを MCP 層で書かないため）。
    """
    item_id = cart_service.find_cart_item_id(db, user_id, product_id)
    if item_id is None:
        raise McpToolError(
            f"カートにその商品はありません（product_id={product_id}）。"
            "get_cart で現在の中身を確認してください。"
        )
    return item_id


def search_products_with_raw_items(
    query: Annotated[str, Field(max_length=100)] | None = None,
    category: Annotated[str, Field(max_length=64)] | None = None,
    min_price: Annotated[int, Field(ge=0)] | None = None,
    max_price: Annotated[int, Field(ge=0)] | None = None,
    sort: SortKey | None = None,
    page: Annotated[int, Field(ge=1)] = 1,
    limit: Annotated[int, Field(ge=1, le=30)] = 10,
    *,
    ctx: Context,
) -> tuple[views.ProductSearchResult, list[ProductOut]]:
    """search_products の本体。戻り値は (LLM に返す結果, 変換前の商品列) のタプル。

    分けてあるのは、apps_ui.py の UI 付き登録が商品カードの画像 URL を組み立てるのに同じ
    商品列を要るため。list_products を呼び直して賄うと embed_query（Ollama への同期 HTTP、
    最大 60 秒）を二重に払うので、検索 1 回につき list_products は必ず 1 回に保つこと。

    引数リストの唯一の源は search_products 側（apps_ui.py の UI 付き版は functools.wraps で
    その signature をそのまま借りる）。
    """
    with tool_session() as db:
        # トークンがあれば sort="recommended" がその人向けの並びになるので任意認証で読む
        # （未ログイン・無効トークンは匿名に落とす）。
        user = optional_user(ctx, db)

        # **list_products より前に DB を引かないこと。** 手前でクエリを打つと、list_products
        # が踏む embed_query（Ollama への同期 HTTP、最大 60 秒）を待つ間ずっとプール枠を
        # 占有する（未認証で叩けるので並べられると /api 側まで巻き込む。session.py 参照）。
        # カテゴリ名の引き当ては絞り込みに要るときだけ先に引く。
        categories: list[CategoryOut] | None = None
        category_id: int | None = None
        if category:
            categories = _categories(db)
            category_id = _find_category_id(categories, category)
            if category_id is None:
                available = "、".join(row.name for row in categories)
                return (
                    views.ProductSearchResult(
                        items=[],
                        total=0,
                        page=page,
                        limit=limit,
                        note=(
                            f"カテゴリ「{category}」は存在しません。"
                            f"利用できるカテゴリ: {available or 'なし'}"
                        ),
                    ),
                    [],
                )

        result = products_router.list_products(
            search=query,
            category_id=category_id,
            sort=sort,
            min_price=min_price,
            max_price=max_price,
            page=page,
            limit=limit,
            current_user=user,
            db=db,
        )
        if categories is None:
            categories = _categories(db)
        names = {row.id: row.name for row in categories}
        uses_list_price = (
            min_price is not None or max_price is not None or sort in ("price_asc", "price_desc")
        )
        return (
            views.ProductSearchResult(
                items=[
                    views.to_product_brief(item, names.get(item.category_id))
                    for item in result.items
                ],
                total=result.total,
                page=page,
                limit=limit,
                note=PRICE_BASIS_NOTE if uses_list_price else None,
            ),
            result.items,
        )


def search_products(
    query: Annotated[str, Field(max_length=100)] | None = None,
    category: Annotated[str, Field(max_length=64)] | None = None,
    min_price: Annotated[int, Field(ge=0)] | None = None,
    max_price: Annotated[int, Field(ge=0)] | None = None,
    sort: SortKey | None = None,
    page: Annotated[int, Field(ge=1)] = 1,
    limit: Annotated[int, Field(ge=1, le=30)] = 10,
    *,
    ctx: Context,
) -> views.ProductSearchResult:
    result, _raw_items = search_products_with_raw_items(
        query=query,
        category=category,
        min_price=min_price,
        max_price=max_price,
        sort=sort,
        page=page,
        limit=limit,
        ctx=ctx,
    )
    return result


def get_product(product_id: Annotated[int, Field(ge=1)]) -> views.ProductDetail:
    with tool_session() as db:
        product = products_router.get_product(product_id=product_id, db=db)
        names = {row.id: row.name for row in _categories(db)}
        return views.to_product_detail(product, names.get(product.category_id))


def get_cart(*, ctx: Context) -> views.CartView:
    with tool_session() as db:
        user = require_user(ctx, db)
        return views.to_cart_view(cart_router.get_cart(current_user=user, db=db))


def add_to_cart(
    product_id: Annotated[int, Field(ge=1)],
    quantity: Annotated[int, Field(ge=1, le=99)] = 1,
    *,
    ctx: Context,
) -> views.CartView:
    with tool_session() as db:
        user = require_user(ctx, db)
        cart = cart_router.add_cart_item(
            payload=CartItemCreate(product_id=product_id, quantity=quantity),
            current_user=user,
            visitor_id=None,  # 省略禁止（モジュール docstring 参照）
            db=db,
        )
        return views.to_cart_view(cart)


def update_cart_item(
    product_id: Annotated[int, Field(ge=1)],
    quantity: Annotated[int, Field(ge=1, le=99)],
    *,
    ctx: Context,
) -> views.CartView:
    with tool_session() as db:
        user = require_user(ctx, db)
        cart = cart_router.update_cart_item(
            item_id=_resolve_item_id(db, user.id, product_id),
            payload=CartItemUpdate(quantity=quantity),
            current_user=user,
            db=db,
        )
        return views.to_cart_view(cart)


def remove_cart_item(
    product_id: Annotated[int, Field(ge=1)],
    *,
    ctx: Context,
) -> views.CartView:
    with tool_session() as db:
        user = require_user(ctx, db)
        cart = cart_router.delete_cart_item(
            item_id=_resolve_item_id(db, user.id, product_id),
            current_user=user,
            db=db,
        )
        return views.to_cart_view(cart)


def list_addresses(*, ctx: Context) -> views.AddressListResult:
    with tool_session() as db:
        user = require_user(ctx, db)
        rows = addresses_router.list_addresses(current_user=user, db=db)
        # ORM のままセッションを抜けない（DetachedInstanceError の予防）。
        items = [views.to_address_brief(AddressOut.model_validate(row)) for row in rows]
        return views.AddressListResult(items=items, note=None if items else MSG_NO_ADDRESS)


def list_orders(
    limit: Annotated[int, Field(ge=1, le=50)] = 10,
    *,
    ctx: Context,
) -> views.OrderListResult:
    with tool_session() as db:
        user = require_user(ctx, db)
        # 既存の一覧はページングを持たない（新しい順に全件返す）。ここで切るだけに
        # とどめ、REST 側にページングを足す判断は持ち込まない。
        rows = orders_router.list_orders(current_user=user, db=db)[:limit]
        # OrderDetailOut にすると注文件数ぶんの N+1（items の遅延ロード）になる。
        return views.OrderListResult(
            items=[views.to_order_summary(OrderSummaryOut.model_validate(row)) for row in rows]
        )


def get_order(
    order_id: Annotated[int, Field(ge=1)],
    *,
    ctx: Context,
) -> views.OrderDetail:
    with tool_session() as db:
        user = require_user(ctx, db)
        order = orders_router.get_order(order_id=order_id, current_user=user, db=db)
        return views.to_order_detail(OrderDetailOut.model_validate(order))


# description は静的文字列にする（商品名など未信頼のテキストを混ぜない）。annotations は
# UX のヒントであって安全装置ではない（SDK の docstring 自身が "hints" と明記）。実際の
# 安全弁は confirm_token とサーバー側の再検査。


def hints(title: str, **overrides) -> ToolAnnotations:
    """ツールのヒント。checkout.py の 2 ツールもこれを通す。

    既定は「読み取り専用・閉じた世界」。openWorldHint はこのサーバーでは常に False
    （対象はこの店のカタログと自分の注文だけ）。書き込むツールだけが readOnlyHint=False と
    destructive/idempotent を明示する形にすると、何が書き込むのかが一覧で目に見える。
    """
    defaults = {"readOnlyHint": True, "openWorldHint": False}
    return ToolAnnotations(title=title, **{**defaults, **overrides})


# search_products / get_product の登録メタ。UI 付き登録（apps_ui.py）と素登録
# （apps_ui.register_fallback）が同じ文言を共有するための定数——写しを 2 箇所に持つと、
# UI が付くかどうかで tools/list の説明文が変わる。
SEARCH_PRODUCTS_DESCRIPTION = (
    "ひびの商店の商品を検索します。キーワード（商品名の部分一致と意味的な近さの"
    "両方で探します）・カテゴリ名・価格帯・並び順で絞り込めます。ログイン不要。\n"
    + PRICE_BASIS_NOTE
)
SEARCH_PRODUCTS_ANNOTATIONS = hints("商品を検索する")

GET_PRODUCT_DESCRIPTION = (
    "商品 1 件の詳細（説明・仕様・実売価格・在庫・購入可否）を返します。"
    "product_id は search_products の結果に含まれます。ログイン不要。"
)
GET_PRODUCT_ANNOTATIONS = hints("商品の詳細を見る")


def register(mcp: MCPServer) -> None:
    # search_products と get_product はここでは登録しない（apps_ui.py が UI 付きで、
    # 読めなければ register_fallback() が素で登録する）。ここで add_tool すると
    # ToolManager.add_tool() が同名の再登録を「先勝ち＋警告ログのみ」で処理し、後から来る
    # apps_ui.py の UI 付き登録が黙って捨てられて UI が一生付かない（例外もログも出ない）。
    mcp.add_tool(
        get_cart,
        description="ログイン中のユーザーのカートの中身と合計金額を返します。",
        annotations=hints("カートを見る"),
    )
    mcp.add_tool(
        add_to_cart,
        description=(
            "商品をカートに追加します。既にカートにある商品なら数量を足します。"
            "在庫が足りない場合はエラーになります（数量を減らして呼び直してください）。"
        ),
        annotations=hints(
            "カートに追加する",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
        ),
    )
    mcp.add_tool(
        update_cart_item,
        description=(
            "カートに入っている商品の数量を指定した数に置き換えます（足し算ではありません）。"
        ),
        annotations=hints(
            "カートの数量を変更する",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=True,
        ),
    )
    mcp.add_tool(
        remove_cart_item,
        description="カートから商品を取り除きます。",
        annotations=hints(
            "カートから削除する",
            readOnlyHint=False,
            destructiveHint=True,
            idempotentHint=True,
        ),
    )
    mcp.add_tool(
        list_addresses,
        description=(
            "登録済みの配送先を返します。preview_checkout に address_id を渡すために使います。"
            "このツール群から配送先を新規登録することはできません。"
        ),
        annotations=hints("配送先の一覧"),
    )
    mcp.add_tool(
        list_orders,
        description="ログイン中のユーザーの注文履歴を新しい順に返します。",
        annotations=hints("注文履歴を見る"),
    )
    mcp.add_tool(
        get_order,
        description="注文 1 件の詳細（明細・配送先・金額）を返します。",
        annotations=hints("注文の詳細を見る"),
    )
