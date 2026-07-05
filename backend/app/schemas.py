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


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    price: int
    stock: int
    image_url: str | None = None
    is_active: bool
    category_id: int | None = None
    avg_rating: float | None = None
    review_count: int = 0
    created_at: datetime


class ProductListOut(BaseModel):
    items: list[ProductOut]
    total: int


class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    price: int = Field(ge=0)
    stock: int = Field(ge=0)
    image_url: str | None = None
    is_active: bool = True
    category_id: int | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: int | None = Field(default=None, ge=0)
    stock: int | None = Field(default=None, ge=0)
    image_url: str | None = None
    is_active: bool | None = None
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
