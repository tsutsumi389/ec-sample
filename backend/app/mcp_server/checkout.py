"""preview_checkout → place_order。購入の安全弁。

**place_order の引数は confirm_token ただ 1 つ。** 金額も住所IDもクーポンも受け取らない。
LLM が「渡す値を書き換える」経路そのものを消すのが安全弁の本体で、署名はそれを成立させる
手段にすぎない。

**この安全弁が守るのは「整合性」だけで、「ユーザーの同意」ではない。** トークンを受け取る
のは LLM 自身なので、モデルは preview_checkout → place_order を人間を介さず 1 ターンで
続けて呼べる。実際に人間を挟んでいるのは MCP ホスト（Claude Code など）のツール承認 UI
であって、サーバー側の保証ではない——ユーザーが place_order を許可リストに入れた時点で
その関門は消える。トークンが保証するのは「下見で組んだ姿と確定する姿が同一であること」
（カート・金額・配送先・クーポンが下見の時点から動いていないこと）に限られる。
「MCP からの購入は安全弁があるから承認不要」と読み替えないこと。

金額は cart._get_cart（= effective_price）と coupons.evaluate_coupon にだけ作らせる。
**ここで価格・割引の式を書かないこと。** トークンに載る合計は照合値であって指示値では
ないので、確定する金額は create_order が effective_price から計算した値そのものになる。

visitor_id は常に None を渡す（MCP 経由の購入は analytics_events に載らない）。理由は
tools.py の docstring に書いたとおりで、合成 ID がファネルを汚すのを避けるため。A/B の
CV から MCP 経由の購入が抜けることは意図的な欠測。
"""

import logging
import time
from dataclasses import dataclass
from typing import Annotated

from mcp.server.mcpserver import Context, MCPServer
from pydantic import Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import SECRET_KEY
from app.mcp_server import confirm, views
from app.mcp_server.errors import MSG_ADDRESS_NOT_FOUND, MSG_EMPTY_CART, MSG_NO_ADDRESS
from app.mcp_server.identity import require_user
from app.mcp_server.session import tool_session
from app.mcp_server.tools import hints
from app.models import Address, Order, User
from app.routers import addresses as addresses_router
from app.routers import cart as cart_router
from app.routers import orders as orders_router
from app.routers.coupons import evaluate_coupon, get_coupon_by_code
from app.services.shipping import format_shipping_address
from app.schemas import OrderCreate, OrderDetailOut

logger = logging.getLogger(__name__)

# 確認トークン専用の鍵。app.auth を import した時点で SECRET_KEY の fail closed 検査
# （未設定・短すぎ・既知の弱い値なら起動を止める）は済んでいる。ここで既定値や
# フォールバックを持たせないこと。
_KEY = confirm.signing_key(SECRET_KEY)

# LLM への次の指示。**静的文字列にする**（商品名など未信頼のテキストを混ぜない）。
NEXT_STEP = (
    "この内容をユーザーに提示し、明確な同意を得てから place_order(confirm_token=...) を"
    "呼んでください。confirm_token は編集せずそのまま渡してください。"
)
NEXT_STEP_BLOCKED = (
    "このままでは注文できません。blockers の内容をユーザーに伝えて解消し、"
    "preview_checkout をやり直してください。"
)


@dataclass(frozen=True)
class Quote:
    """いまの買い物の姿。preview_checkout と place_order が同じものを見る。

    **導出できる値をフィールドにしないこと。** 小計は cart.total_amount、割引は
    coupon.discount_amount、請求予定額は state.total_amount が持つ。同じ数字を別名で
    持たせると、送料や手数料が入った日に「どれを直せば整合するか」が選択問題になる。
    """

    cart: views.CartView
    state: confirm.CartState
    shipping_address: str | None
    coupon: views.CouponView | None

    @property
    def discount(self) -> int:
        return self.coupon.discount_amount if self.coupon is not None else 0

    @property
    def blockers(self) -> list[views.CheckoutBlocker]:
        """買えない明細＝トークンを出さない理由。

        判定は CartLine が services/cart.py から引いた結果をそのまま読むだけ
        （ここに if を書かない）。
        """
        return [
            views.CheckoutBlocker(
                kind="item",
                product_id=line.product_id,
                message=f"{line.name}: {line.availability}",
            )
            for line in self.cart.items
            if not line.purchasable
        ]


# 配送先が決まらなかったことを表す唯一の値。この組み合わせ（登録済みでも自由入力でも
# ない）は AddressRef としては不正で _parse が弾くが、この経路ではトークンを発行しない
# ので外へ出ない。同じダミーを複数箇所で組み立てないためだけの定数。
_NO_ADDRESS = confirm.AddressRef(address_id=0)


def _owned_addresses(db: Session, user: User) -> dict[int, Address]:
    """本人の配送先を id 引きできる形で返す（is_default desc, id desc の順を保つ）。

    Address を直接クエリしないのは、所有チェック（user_id 絞り込み）を再実装しないため。
    存在しない住所と他人の住所は、どちらも「見つからない」として同じ文言で返る。
    """
    rows = addresses_router.list_addresses(current_user=user, db=db)
    return {row.id: row for row in rows}


def _resolve_address(
    owned: dict[int, Address],
    address_id: int | None,
    shipping_address: str | None,
) -> tuple[confirm.AddressRef, str | None, views.CheckoutBlocker | None]:
    """配送先を決める。→ (トークンに焼く参照, 由来, 進めない理由)

    自由入力を受けるのは、シードのテストアカウントに配送先が 1 件も無く、登録済みだけに
    絞ると一度も購入できないため。インジェクションに対する防御の本体は「preview が自由
    文字列を拒むこと」ではなく「**place_order が住所引数を持たないこと**」で、preview の
    出す住所はユーザーに提示され確認トークンに焼き込まれる。差し替えるには preview から
    やり直す必要があり、そのとき新しい住所がユーザーの目に触れる。

    address_id と shipping_address が両方来たら登録済みを優先する（登録済みのほうが
    ユーザー自身が過去に入力した確かな値なので）。

    owned は呼び出し側が 1 回だけ引いて渡す（_quote にも同じものを渡すこと。ツール 1 回で
    同じクエリを 2 度打たないための約束で、_categories と同じ流儀）。
    """
    if address_id is not None:
        if address_id not in owned:
            return (
                _NO_ADDRESS,
                None,
                views.CheckoutBlocker(kind="address", message=MSG_ADDRESS_NOT_FOUND),
            )
        return confirm.AddressRef(address_id=address_id), "address_id", None

    if shipping_address and shipping_address.strip():
        text = shipping_address.strip()
        return confirm.AddressRef(address_id=0, text=text), "shipping_address", None

    if owned:
        # list_addresses は is_default desc, id desc 順なので先頭が既定の配送先。
        return confirm.AddressRef(address_id=next(iter(owned))), "default", None

    return _NO_ADDRESS, None, views.CheckoutBlocker(kind="address", message=MSG_NO_ADDRESS)


def _quote(
    db: Session,
    user: User,
    owned: dict[int, Address],
    address: confirm.AddressRef,
    coupon_code: str | None,
) -> Quote:
    """現在の DB から「いまの買い物の姿」を組む。

    preview_checkout が発行に使い、place_order が照合に使う。同じ関数で組むからこそ、
    ユーザーに見せた数字とトークンの数字が同じオブジェクト由来であることが保証される。
    """
    cart_out = cart_router._get_cart(db, user)  # effective_price はここが持つ
    cart_view = views.to_cart_view(cart_out)
    lines = [
        (item.id, item.product.id, item.quantity, item.product.effective_price)
        for item in cart_out.items
    ]

    # 保存される住所文字列。登録済みは services/shipping.py の組み立てを必ず通す
    # （下見で見せる文字列と Order.shipping_address に残る文字列を一致させるため）。
    shipping_text: str | None = None
    if address.address_id:
        found = owned.get(address.address_id)
        if found is not None:
            shipping_text = format_shipping_address(found)
    else:
        shipping_text = address.text

    subtotal = cart_out.total_amount  # create_order の再計算結果と一致する
    discount = 0
    coupon_view: views.CouponView | None = None
    if coupon_code:
        coupon = get_coupon_by_code(db, coupon_code)
        valid, amount, message = evaluate_coupon(coupon, subtotal)
        discount = amount if valid else 0
        coupon_view = views.CouponView(
            code=coupon_code, applied=valid, discount_amount=discount, message=message
        )

    last_order_id = (
        db.query(func.coalesce(func.max(Order.id), 0)).filter(Order.user_id == user.id).scalar()
    )
    state = confirm.CartState(
        cart_hash=confirm.cart_fingerprint(lines),
        address=address,
        # 住所が引けなければ空文字の指紋になり、照合で必ず落ちる。
        address_hash=confirm.address_fingerprint(shipping_text or ""),
        # 無効なクーポンは焼かない（焼くと place_order が create_order に渡して 400 になる）。
        coupon_code=coupon_code if (coupon_view is not None and coupon_view.applied) else None,
        total_amount=subtotal - discount,
        last_order_id=last_order_id or 0,
    )
    return Quote(
        cart=cart_view, state=state, shipping_address=shipping_text, coupon=coupon_view
    )


def preview_checkout(
    address_id: Annotated[int, Field(ge=1)] | None = None,
    # 200 文字は「宛名 / 郵便番号 / 住所 / 電話番号」に十分で、確認トークンの長さ上限
    # （confirm._MAX_TOKEN_CHARS）にも収まる値。上げるときは両方を見ること。
    shipping_address: Annotated[str, Field(max_length=200)] | None = None,
    coupon_code: Annotated[str, Field(max_length=64)] | None = None,
    *,
    ctx: Context,
) -> views.CheckoutPreview:
    """注文内容の下見と confirm_token の発行。

    **DB に一切書かない。** readOnlyHint=true を宣言している以上、注釈と実挙動が食い違って
    はならない。特に begin_checkout の計測をここでしないこと（LLM が下見するたびにファネルが
    膨らむ）。

    進めない事情は例外ではなく blockers で返す。下見の存在意義は「確定前に失敗を潰す」ことで、
    ここで例外にすると LLM が preview をやり直すループに入るだけになる。
    """
    with tool_session() as db:
        user = require_user(ctx, db)
        # 配送先はここで 1 回だけ引き、_resolve_address と _quote で使い回す。
        owned = _owned_addresses(db, user)
        address, source, address_blocker = _resolve_address(owned, address_id, shipping_address)
        quote = _quote(db, user, owned, address, coupon_code)

        blockers = quote.blockers
        if address_blocker is not None:
            blockers.append(address_blocker)
        if not quote.cart.items:
            blockers.append(views.CheckoutBlocker(kind="cart", message=MSG_EMPTY_CART))
        if quote.coupon is not None and not quote.coupon.applied:
            # クーポンが無効でも注文自体は割引 0 で通す。「適用されなかった」ことを
            # 明示するためだけの一件なので、can_place_order は下げない。
            blockers.append(
                views.CheckoutBlocker(
                    kind="coupon",
                    message=f"クーポン {quote.coupon.code} は適用されません: {quote.coupon.message}",
                )
            )

        can = not any(b.kind != "coupon" for b in blockers)
        token = (
            confirm.issue(_KEY, user_id=user.id, state=quote.state, now=int(time.time()))
            if can
            else None
        )

        return views.CheckoutPreview(
            items=quote.cart.items,
            subtotal=quote.cart.total_amount,
            discount_amount=quote.discount,
            # _quote が組んだ額をそのまま出す。ここで subtotal - discount を書き直すと、
            # 「ユーザーに見せる額」と「トークンに焼く額」が別の式から出ることになる。
            payable_amount=quote.state.total_amount,
            coupon=quote.coupon,
            # 電話番号は伏せる（会話ログに残るため）。指紋は伏せる前の全文で作ってある。
            shipping_address=(
                views.mask_shipping_address(quote.shipping_address)
                if quote.shipping_address is not None
                else None
            ),
            address_source=source,
            can_place_order=can,
            blockers=blockers,
            confirm_token=token,
            expires_in_seconds=confirm.TTL_SECONDS if token else None,
            next_step=NEXT_STEP if can else NEXT_STEP_BLOCKED,
        )


def place_order(confirm_token: str, *, ctx: Context) -> views.OrderDetail:
    """確認トークンと引き換えに注文を確定する。引数はトークン 1 つだけ。

    金額・配送先・クーポンをここで受け取らないのが安全弁の本体。トークンに書かれた金額を
    Order に入れる実装にした瞬間に防御が崩壊するので、create_order には照合済みの
    「どの住所・どのクーポン」だけを渡し、請求額は create_order が effective_price から
    計算した値をそのまま使う。
    """
    with tool_session() as db:
        user = require_user(ctx, db)
        # 同一ユーザーの place_order を直列化する。create_order はカート明細を
        # ロックせずに読むため、同時に 2 回叩かれると両方が同じ明細を見て二重注文に
        # なり得る。負けた側は起床後に _quote が空カート（と進んだ last_order_id）を
        # 見るので、指紋が一致せず create_order まで到達しない。
        #
        # **ロックするのは users の自分の行**であって、カート行でも商品行でもない。
        # 既存の書き手はどちらも「商品行 → カート行」の順で掴む（orders.create_order は
        # 商品を FOR UPDATE してから cart_item を delete し、services/cart.merge_lines も
        # 商品が先）。ここでカート行を先に掴むと順序が交差し、ブラウザの注文・再注文と
        # 同時に走ったときにデッドロックする。users の行はそのロック階層に一切参加して
        # いない（商品行を持ったまま users を更新する経路が無い）ので、per-user の
        # ミューテックスとして安全に使える。
        # （申し送り: ブラウザのダブルサブミットは未対策のまま。直し方は orders.py の
        #  create_order 側に書いてある。直すときはここの users ロックも一緒に外すこと。）
        db.query(User).filter(User.id == user.id).with_for_update().one()

        # 配送先はロック取得後に 1 回だけ引き、照合用の _quote で使い回す。
        owned = _owned_addresses(db, user)
        claims = confirm.verify(
            _KEY,
            confirm_token,
            user_id=user.id,
            now=int(time.time()),
            load_current=lambda addr, coupon: _quote(db, user, owned, addr, coupon).state,
        )
        order = orders_router.create_order(
            payload=OrderCreate(
                address_id=claims.state.address.address_id or None,
                shipping_address=claims.state.address.text,
                coupon_code=claims.state.coupon_code,
            ),
            current_user=user,
            visitor_id=None,  # 省略禁止（モジュール docstring 参照）
            db=db,
        )
        # セッションを抜ける前に変換する（Order.items は遅延ロード）。
        detail = OrderDetailOut.model_validate(order)
        if detail.total_amount != claims.state.total_amount:
            # ユーザーが下見で確認した額と、create_order が実際に請求した額がずれた。
            # トークンの照合は「トークンの額 vs いまの _quote の額」しか見ておらず
            # （どちらも同じ式から出るので必ず一致する）、確定額との突き合わせは
            # ここが唯一の場所になる。将来 create_order に送料や手数料が入ると、
            # 下見は旧式の額を提示したまま別の額で注文が確定する——安全弁が素通しに
            # なった証拠なので、必ず気づける形で残す。注文は確定済みなので取り消さない。
            logger.error(
                "mcp place_order 金額不一致 user=%s order=%s confirmed=%s charged=%s nonce=%s",
                user.id,
                detail.id,
                claims.state.total_amount,
                detail.total_amount,
                claims.nonce,
            )
        # トークン本体はログに出さない。突き合わせに要るのは nonce だけ。
        logger.info(
            "mcp place_order ok user=%s order=%s total=%s nonce=%s",
            user.id,
            detail.id,
            detail.total_amount,
            claims.nonce,
        )
        return views.to_order_detail(detail)


def register(mcp: MCPServer) -> None:
    mcp.add_tool(
        preview_checkout,
        description=(
            "注文内容（明細・合計・配送先・割引）を確定前に確認し、confirm_token を発行します。"
            "配送先は address_id（list_addresses の id）か shipping_address（宛名・郵便番号・"
            "住所・電話番号を含む文字列）で指定します。どちらも省略すると既定の配送先を使います。"
            "注文へ進めない事情は blockers に入ります。"
        ),
        annotations=hints("注文内容を確認する"),
    )
    mcp.add_tool(
        place_order,
        description=(
            "preview_checkout が発行した confirm_token と引き換えに注文を確定します。"
            "必ず preview_checkout の内容をユーザーに提示し、明確な同意を得てから呼んでください。"
            "confirm_token は編集せずそのまま渡してください（10分で失効し、一度使うと無効に"
            "なります）。"
        ),
        annotations=hints(
            "注文を確定する",
            readOnlyHint=False,
            destructiveHint=True,
            idempotentHint=False,
        ),
    )
