"""ツールの出力モデルと、既存スキーマからの変換（純関数のみ。DB を触らない）。

戻り値を素の dict にすると MCP の structuredContent が返らず、モデルは本文の文字列
だけを読むことになる。**全ツールの戻り値にここのモデルを注釈すること。**

原則:
  - **PII を入れない。** 商品系の出力にレビュアー名・氏名・住所は一切載せない。
  - **`price` という名前のフィールドを出さない。** リポジトリ内で price は「定価」であり、
    実売価格は必ず effective_price。例外は注文明細（OrderItem.price は注文時点の
    スナップショットで、その意味で price が正しい）。
  - **重いものは一覧に出さない**（description 全文 / 画像 / 仕様は詳細ツールだけ）。
  - **「なぜ買えないか」を LLM に自作させない。** 文言は services/cart.py から引く。
  - **金額を組み立てない。** ここでの足し算は item_count（数量の合計）だけ。
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas import (
    AddressOut,
    CartItemOut,
    CartOut,
    OrderDetailOut,
    OrderSummaryOut,
    ProductOut,
)
from app.services import cart as cart_service
from app.services.shipping import mask_shipping_address

# 商品説明はこの長さで切る。全文を流すとコンテキストを食うだけでなく、商品説明に仕込まれた
# 指示文（プロンプトインジェクション）の面積がそのまま広がる。
DESCRIPTION_MAX_CHARS = 300

_AVAILABLE = "購入できます"

def _availability_text(reason: str | None) -> str:
    """買えない理由を表示用の文へ。買えるなら「購入できます」。

    「理由が無い＝購入できます」の変換をここ 1 か所に置く。写すと、片方だけ文言を
    変えたときに同じ画面で 2 通りの言い方が出る。
    """
    return reason if reason is not None else _AVAILABLE


def availability_text(product: ProductOut) -> str:
    """買えない理由。買えるなら「購入できます」。

    ProductOut は ORM ではないので status 文字列しか持たない。可否の判定は
    services/cart.py へ status ごと渡す。**`status in VIEWABLE_STATUSES` のような
    status の直接比較も、文言も、ここに書き写さないこと**——どちらも唯一の源は
    models.py と services/cart.py にある。
    """
    return _availability_text(
        cart_service.availability_reason_for_status(product.status, product.stock)
    )


def _truncate(text: str | None) -> str | None:
    if text is None:
        return None
    if len(text) <= DESCRIPTION_MAX_CHARS:
        return text
    return text[:DESCRIPTION_MAX_CHARS] + "…"


class ProductBrief(BaseModel):
    """検索結果 1 件。LLM が読む前提で軽くする。"""

    id: int
    name: str
    # カテゴリ名。LLM は category_id を読めないので名前で返す。
    category: str | None = None
    # 実売価格。金額の基準はこれ 1 本。
    effective_price: int
    # セール中のときだけ元値（= Product.price）。打ち消し表示の材料。
    list_price: int | None = None
    stock: int
    status: str
    purchasable: bool
    availability: str
    avg_rating: float | None = None
    review_count: int = 0


class ProductSearchResult(BaseModel):
    items: list[ProductBrief]
    total: int
    page: int
    limit: int
    # 既存挙動の申し送り（価格帯は定価で評価する 等）。無ければ None。
    note: str | None = None


class ProductDetail(ProductBrief):
    sku: str | None = None
    description: str | None = None
    # "重量: 320g" の形に潰す（label/value の 2 キーを増やさない）。
    specs: list[str] = []
    image_url: str | None = None


class CartLine(BaseModel):
    # 更新・削除もこの ID で行う（cart_item_id は外に出さない）。
    product_id: int
    name: str
    effective_price: int  # 単価
    quantity: int
    subtotal: int  # CartOut の値をそのまま（再計算しない）
    # この明細を「この数量のまま」注文できるか。数量まで見るのは、get_cart が
    # 「購入できます」と言った直後に preview_checkout が在庫不足で止める食い違いを
    # 作らないため。判定は services/cart.py と共有する。
    purchasable: bool
    availability: str


class CartView(BaseModel):
    items: list[CartLine]
    total_amount: int  # CartOut.total_amount をそのまま
    item_count: int  # 数量の合計（表示用。金額ではない）


class AddressBrief(BaseModel):
    """一覧では選択に必要な最小限だけ。

    認証済み本人のデータではあるが、MCP の戻り値は LLM の会話ログに残る。どの住所へ送るかを
    選ぶのに番地は要らない。番地が出るのは「そこへ送ってよいか」を確認する
    preview_checkout / get_order だけで、**電話番号はどの経路でも出さない**
    （mask_shipping_address が伏せる）。
    """

    id: int
    recipient_name: str
    is_default: bool
    summary: str  # "〒150-0001 東京都渋谷区"（番地・電話は載せない）


class AddressListResult(BaseModel):
    items: list[AddressBrief]
    note: str | None = None  # 0 件のときの案内


class CouponView(BaseModel):
    code: str
    applied: bool
    discount_amount: int
    message: str


class CheckoutBlocker(BaseModel):
    """注文へ進めない理由 1 件。preview_checkout は例外を投げずにこれを返す。

    readOnlyHint=true と整合させるためであり、同時に「下見が失敗する」形にすると LLM が
    preview をやり直すループに入るのを避けるため。
    """

    kind: Literal["cart", "item", "address", "coupon"]
    product_id: int | None = None
    message: str


class CheckoutPreview(BaseModel):
    items: list[CartLine]
    subtotal: int
    discount_amount: int
    payable_amount: int
    coupon: CouponView | None = None
    # format_shipping_address の結果を mask_shipping_address に通したもの（電話番号だけ伏字）。
    # 保存される文字列と確認トークンの指紋は伏せる前の全文で作る。
    shipping_address: str | None = None
    address_source: Literal["address_id", "shipping_address", "default"] | None = None
    can_place_order: bool
    blockers: list[CheckoutBlocker] = []
    confirm_token: str | None = None  # can_place_order のときだけ発行
    expires_in_seconds: int | None = None
    next_step: str  # LLM への次の指示（静的文字列）


class OrderLine(BaseModel):
    product_id: int
    # 注文時点のスナップショット。商品マスタを引き直さない。
    product_name: str
    price: int  # 同上（ここだけ price が正しい語）
    quantity: int


class OrderSummary(BaseModel):
    id: int
    status: str
    total_amount: int  # 割引適用後（Order.total_amount の定義そのまま）
    discount_amount: int
    coupon_code: str | None = None
    created_at: datetime


class OrderDetail(OrderSummary):
    # 注文時点のスナップショット。ここも電話番号は伏せる（会話ログに残るため）。
    shipping_address: str
    items: list[OrderLine]


class OrderListResult(BaseModel):
    items: list[OrderSummary]


def to_product_brief(product: ProductOut, category_name: str | None) -> ProductBrief:
    return ProductBrief(
        id=product.id,
        name=product.name,
        category=category_name,
        effective_price=product.effective_price,
        # 元値は「セールで下がっている」ときだけ意味を持つ。常に出すと定価と実売の
        # 2 つの数字が並び、LLM がどちらを請求額として読むか揺れる。
        list_price=product.price if product.sale_price is not None else None,
        stock=product.stock,
        status=product.status,
        purchasable=product.purchasable,
        availability=availability_text(product),
        avg_rating=product.avg_rating,
        review_count=product.review_count,
    )


def to_product_detail(product: ProductOut, category_name: str | None) -> ProductDetail:
    brief = to_product_brief(product, category_name)
    return ProductDetail(
        **brief.model_dump(),
        sku=product.sku,
        description=_truncate(product.description),
        specs=[f"{spec.label}: {spec.value}" for spec in product.specs],
        image_url=product.image_url,
    )


def to_cart_line(item: CartItemOut) -> CartLine:
    blocker = cart_service.order_blocker_for_status(
        item.product.status, item.product.stock, item.quantity
    )
    return CartLine(
        product_id=item.product.id,
        name=item.product.name,
        effective_price=item.product.effective_price,
        quantity=item.quantity,
        subtotal=item.subtotal,
        purchasable=blocker is None,
        availability=_availability_text(blocker),
    )


def to_cart_view(cart: CartOut) -> CartView:
    lines = [to_cart_line(item) for item in cart.items]
    return CartView(
        items=lines,
        total_amount=cart.total_amount,
        item_count=sum(line.quantity for line in lines),
    )


def to_address_brief(address: AddressOut) -> AddressBrief:
    return AddressBrief(
        id=address.id,
        recipient_name=address.recipient_name,
        is_default=address.is_default,
        summary=f"〒{address.postal_code} {address.prefecture}{address.city}",
    )


def to_order_summary(order: OrderSummaryOut) -> OrderSummary:
    return OrderSummary(
        id=order.id,
        status=order.status,
        total_amount=order.total_amount,
        discount_amount=order.discount_amount,
        coupon_code=order.coupon_code,
        created_at=order.created_at,
    )


def to_order_detail(order: OrderDetailOut) -> OrderDetail:
    return OrderDetail(
        **to_order_summary(order).model_dump(),
        shipping_address=mask_shipping_address(order.shipping_address),
        items=[
            OrderLine(
                product_id=item.product_id,
                product_name=item.product_name,
                price=item.price,
                quantity=item.quantity,
            )
            for item in order.items
        ],
    )
