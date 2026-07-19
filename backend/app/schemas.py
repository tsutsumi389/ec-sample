from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ---------- Auth / User ----------


class UserRegister(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    name: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    role: str


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    role: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserUpdate(BaseModel):
    name: str = Field(min_length=1)


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


# ---------- Category ----------


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    created_at: datetime


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1)


class CategoryUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None


# ---------- Product ----------

ProductStatus = Literal[
    "draft", "coming_soon", "on_sale", "suspended", "discontinued", "archived"
]


class ProductImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_url: str
    sort_order: int


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sku: str | None = None
    description: str | None = None
    price: int
    sale_price: int | None = None
    # 実売価格（sale_price があればそれ、なければ price）。表示・計算の基準。
    effective_price: int
    stock: int
    status: str
    # 購入可能か（status==on_sale かつ在庫あり）。フロントの表示分岐用。
    purchasable: bool
    image_url: str | None = None
    images: list[ProductImageOut] = []
    category_id: int | None = None
    avg_rating: float | None = None
    review_count: int = 0
    created_at: datetime


class ProductListOut(BaseModel):
    items: list[ProductOut]
    total: int


class SuggestOut(BaseModel):
    # 検索サジェスト候補。出品中商品の名前にマッチした検索語（文字列）の配列。
    # クリックでそのままフル検索（GET /products?search=）に渡す想定。
    suggestions: list[str]


class ProductCreate(BaseModel):
    name: str
    sku: str | None = None
    description: str | None = None
    price: int = Field(ge=0)
    sale_price: int | None = Field(default=None, ge=0)
    stock: int = Field(ge=0)
    status: ProductStatus = "draft"
    image_url: str | None = None
    # 追加画像URL（メイン image_url とは別のギャラリー用）。表示順は配列順。
    image_urls: list[str] = []
    category_id: int | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    description: str | None = None
    price: int | None = Field(default=None, ge=0)
    sale_price: int | None = Field(default=None, ge=0)
    stock: int | None = Field(default=None, ge=0)
    status: ProductStatus | None = None
    image_url: str | None = None
    # None は「変更しない」、[] は「全画像を削除」を意味する。
    image_urls: list[str] | None = None
    category_id: int | None = None


# ---------- Review ----------


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


class ReviewOut(BaseModel):
    id: int
    product_id: int
    user_id: int
    user_name: str
    rating: int
    comment: str | None = None
    created_at: datetime


# ---------- 商品Q&A ----------


class ProductQuestionCreate(BaseModel):
    # 購入前の質問。1〜300 文字（空送信・コンテキスト溢れの防止）。
    question: str = Field(min_length=1, max_length=300)


class ProductQuestionOut(BaseModel):
    id: str
    question: str
    answer: str
    # "llm"（AI 回答）か "fallback"（自動回答不可の定型文）か。
    source: str
    # AI が商品情報・レビューを根拠に答えられたか（false は「情報不足」）。
    answerable: bool
    # 質問者の表示名。
    asker_name: str
    created_at: datetime


# ---------- Wishlist ----------


class WishlistItemCreate(BaseModel):
    product_id: int


class WishlistItemOut(BaseModel):
    id: int
    product: ProductOut
    created_at: datetime


# ---------- Address ----------


class AddressBase(BaseModel):
    recipient_name: str = Field(min_length=1)
    postal_code: str = Field(min_length=1)
    prefecture: str = Field(min_length=1)
    city: str = Field(min_length=1)
    address_line: str = Field(min_length=1)
    phone: str = Field(min_length=1)
    is_default: bool = False


class AddressCreate(AddressBase):
    pass


class AddressUpdate(BaseModel):
    recipient_name: str | None = None
    postal_code: str | None = None
    prefecture: str | None = None
    city: str | None = None
    address_line: str | None = None
    phone: str | None = None
    is_default: bool | None = None


class AddressOut(AddressBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


# ---------- Coupon ----------


class CouponCreate(BaseModel):
    code: str = Field(min_length=1)
    discount_type: Literal["percent", "fixed"]
    discount_value: int = Field(ge=0)
    min_order_amount: int = Field(default=0, ge=0)
    is_active: bool = True
    expires_at: datetime | None = None


class CouponUpdate(BaseModel):
    code: str | None = None
    discount_type: Literal["percent", "fixed"] | None = None
    discount_value: int | None = Field(default=None, ge=0)
    min_order_amount: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    expires_at: datetime | None = None


class CouponOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    discount_type: str
    discount_value: int
    min_order_amount: int
    is_active: bool
    expires_at: datetime | None = None
    created_at: datetime


class CouponValidateRequest(BaseModel):
    code: str = Field(min_length=1)
    subtotal: int = Field(ge=0)


class CouponValidateResponse(BaseModel):
    valid: bool
    discount_amount: int = 0
    message: str


# ---------- Cart ----------


class CartItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(default=1, ge=1)


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=1)


class CartItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product: ProductOut
    quantity: int
    subtotal: int


class CartOut(BaseModel):
    items: list[CartItemOut]
    total_amount: int


# ---------- Orders ----------


class OrderCreate(BaseModel):
    shipping_address: str | None = None
    address_id: int | None = None
    coupon_code: str | None = None


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_name: str
    price: int
    quantity: int


class OrderSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    total_amount: int
    discount_amount: int
    coupon_code: str | None = None
    status: str
    shipping_address: str
    created_at: datetime


class OrderDetailOut(OrderSummaryOut):
    items: list[OrderItemOut]


class OrderStatusUpdate(BaseModel):
    status: str


class AdminOrderOut(OrderDetailOut):
    user: UserOut


# ---------- Recommendations ----------


class RecommendationItemOut(BaseModel):
    # 商品は既存 ProductOut を再利用する（独自の商品スキーマは作らない）。
    product: ProductOut
    # LLM が付けたおすすめ理由。フォールバック時は None。
    reason: str | None = None


class RecommendationListOut(BaseModel):
    # "llm"（キャッシュ利用）か "fallback"（人気順）か。
    source: str
    items: list[RecommendationItemOut]


# ---------- ホーム（レーン構成） ----------

# フロントの描画形式。この3つ以外は返さない（契約）。
HomeLayout = Literal["hero", "ranked", "lane"]


class HomeSectionOut(BaseModel):
    """ホームの 1 レーン。1 レーン = 1 アルゴリズムの出力。"""

    # レーンの安定識別子（React の key）。同一レスポンス内で一意であることを保証する。
    # 例: "billboard" / "top10" / "byw:42" / "category:3"
    key: str
    # 見出し。layout="hero" のときのみ None になり得る。
    title: str | None = None
    # 補足文（例:「あと3点で送料無料」）。Phase 1 では常に None。
    subtitle: str | None = None
    layout: HomeLayout
    # 商品は既存 RecommendationItemOut を再利用する（product + reason）。
    items: list[RecommendationItemOut]


class HomeOut(BaseModel):
    # "personalized"（パーソナライズされたレーンが1本以上入った）か
    # "popular"（非パーソナライズのみ = コールドスタート）か。
    source: str
    # 商品が1件も無ければ空配列（フロントは EmptyState を出す）。
    sections: list[HomeSectionOut]


# ---------- AIショッピングアシスタント ----------


class AssistantChatIn(BaseModel):
    # null なら新規会話を作成。既存 UUID なら所有チェックのうえ継続する。
    conversation_id: str | None = None
    # ユーザーの相談文。1〜500 文字（コンテキスト溢れ・空送信の防止）。
    message: str = Field(min_length=1, max_length=500)


class AssistantChatOut(BaseModel):
    conversation_id: str
    # "llm"（LLM 応答）か "fallback"（キーワード検索）か。
    source: str
    # チャット本文。
    reply: str
    # 提案商品（既存 RecommendationItemOut と同型: product + reason）。
    products: list[RecommendationItemOut]


class AssistantMessageOut(BaseModel):
    # 履歴復元用の 1 メッセージ。role="assistant" の行のみ products を持つ。
    role: str
    content: str
    source: str | None = None
    products: list[RecommendationItemOut] = []
    created_at: datetime
