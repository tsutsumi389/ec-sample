from datetime import datetime

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
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
