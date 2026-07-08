from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import EMBED_DIM
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # パスワード最終変更時刻。これより前に発行された JWT（iat が古いもの）は失効させる。
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    cart_items: Mapped[list["CartItem"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    orders: Mapped[list["Order"]] = relationship(back_populates="user")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    products: Mapped[list["Product"]] = relationship(back_populates="category")


# 商品の状態機械。可視性・購入可否はすべてこの単一の状態から導出する
# （旧 is_active フラグは廃止し archived に統合）。
PRODUCT_STATUSES = (
    "draft",  # 下書き（未公開）。一覧・商品ページとも非表示、購入不可
    "coming_soon",  # 近日発売。表示するが購入不可
    "on_sale",  # 販売中。表示・購入可（在庫があれば）
    "suspended",  # 一時停止。在庫があっても表示のみで購入不可
    "discontinued",  # 販売終了。一覧からは隠すが商品ページ・履歴は残す
    "archived",  # 論理削除相当。一覧・商品ページとも非表示
)

# 一覧（トップ・検索）に表示する状態。
LISTED_STATUSES = ("coming_soon", "on_sale", "suspended")
# 商品ページを直接開いて閲覧できる状態（一覧非表示でも URL では見られるもの）。
VIEWABLE_STATUSES = ("coming_soon", "on_sale", "suspended", "discontinued")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # 商品コード（SKU）。在庫・注文管理の実務標準。任意だが設定時は一意。
    sku: Mapped[str | None] = mapped_column(String, unique=True, nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    # セール価格。設定時は price を定価（打ち消し表示）、sale_price を実売価格として扱う。
    sale_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 販売状態。可視性・購入可否の唯一の源。新規作成時は draft（誤公開防止）。
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    cart_items: Mapped[list["CartItem"]] = relationship(back_populates="product")
    category: Mapped["Category | None"] = relationship(back_populates="products")
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.sort_order, ProductImage.id",
    )

    @property
    def effective_price(self) -> int:
        """実売価格。セール価格があればそれを、なければ定価を返す。

        カート小計・注文金額・OrderItem スナップショットはすべてこの値を使う。
        """
        return self.sale_price if self.sale_price is not None else self.price

    @property
    def is_listed(self) -> bool:
        """一覧（トップ・検索）に表示してよいか。"""
        return self.status in LISTED_STATUSES

    @property
    def is_viewable(self) -> bool:
        """商品ページを直接開いて閲覧してよいか。"""
        return self.status in VIEWABLE_STATUSES

    @property
    def purchasable(self) -> bool:
        """購入可能か。販売中(on_sale)かつ在庫ありのときだけ True。"""
        return self.status == "on_sale" and self.stock > 0


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    image_url: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    product: Mapped["Product"] = relationship(back_populates="images")


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_review_user_product"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    product: Mapped["Product"] = relationship(back_populates="reviews")
    user: Mapped["User"] = relationship()


class WishlistItem(Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship()
    product: Mapped["Product"] = relationship()


class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String, nullable=False)
    postal_code: Mapped[str] = mapped_column(String, nullable=False)
    prefecture: Mapped[str] = mapped_column(String, nullable=False)
    city: Mapped[str] = mapped_column(String, nullable=False)
    address_line: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship()


class Coupon(Base):
    __tablename__ = "coupons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    discount_type: Mapped[str] = mapped_column(String, nullable=False)
    discount_value: Mapped[int] = mapped_column(Integer, nullable=False)
    min_order_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_cart_user_product"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    user: Mapped["User"] = relationship(back_populates="cart_items")
    product: Mapped["Product"] = relationship(back_populates="cart_items")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    coupon_code: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    shipping_address: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    product_name: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()


# ---------- レコメンド（セマンティックID / 埋め込み / LLM生成キャッシュ）----------
#
# 以下 4 テーブルはレコメンド機能専用。既存テーブルには一切カラムを足さず、
# 商品埋め込みやユーザ推薦結果はここに分離して持つ（マイグレーションツール未導入のため、
# 既存テーブルへの追加はできず新規テーブルの追加のみ許容される運用に合わせる）。


class ProductEmbedding(Base):
    """商品テキストの埋め込みベクトルとセマンティックID。

    product_id を主キー兼 FK にして 1 商品 1 行で持つ。source_hash / embed_model が
    現在の商品テキスト・モデルと一致していれば再埋め込みをスキップする差分同期に使う。
    """

    __tablename__ = "product_embeddings"

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"), primary_key=True
    )
    # 埋め込みベクトル本体（pgvector）。次元は EMBED_DIM に固定。
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM), nullable=False)
    # 残差量子化で割り当てた "a-b-c" 形式のセマンティックID（衝突時はサフィックス付き）。
    semantic_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    # semantic_id を割り当てたコードブックの世代（SemanticIdCodebook.generation）。
    codebook_generation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 埋め込み元テキストの sha256。商品編集で本文が変われば不一致になり再埋め込みされる。
    source_hash: Mapped[str] = mapped_column(String, nullable=False)
    # 生成時に使った埋め込みモデル名。モデル差し替え時の再生成判定に使う。
    embed_model: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    product: Mapped["Product"] = relationship()


class SemanticIdCodebook(Base):
    """残差量子化のセントロイド（コードブック）を世代管理する。

    再構築のたびに generation をインクリメントして新しい行を追加する。
    centroids は 3 階層分のセントロイド配列を JSON で保持する。
    """

    __tablename__ = "semantic_id_codebooks"

    generation: Mapped[int] = mapped_column(Integer, primary_key=True)
    # [階層0のセントロイド配列, 階層1..., 階層2...] の 3 要素。各要素は K×EMBED_DIM。
    centroids: Mapped[list] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class UserRecommendation(Base):
    """LLM が生成したユーザ別のおすすめ商品キャッシュ（rank 順に返す）。

    生成のたびに当該ユーザの行を丸ごと入れ替える。reason は店員ペルソナの一言。
    """

    __tablename__ = "user_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    product: Mapped["Product"] = relationship()


class RecommendationState(Base):
    """ユーザ別のレコメンド生成状態。多重起動防止とキャッシュ陳腐化判定に使う。

    profile_hash が現在の行動ハッシュと一致し status=ready ならキャッシュを返せる。
    status=generating かつ generated_at が新しければ二重生成をスキップする。
    """

    __tablename__ = "recommendation_states"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    # 生成時点のユーザ行動（購入・カート・お気に入り・高評価）から作ったハッシュ。
    profile_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    # generating / ready / failed のいずれか。
    status: Mapped[str] = mapped_column(String, nullable=False, default="generating")
    generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
