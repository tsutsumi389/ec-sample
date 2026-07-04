from datetime import datetime

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


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: int | None = Field(default=None, ge=0)
    stock: int | None = Field(default=None, ge=0)
    image_url: str | None = None
    is_active: bool | None = None


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
    shipping_address: str = Field(min_length=1)


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
    status: str
    shipping_address: str
    created_at: datetime


class OrderDetailOut(OrderSummaryOut):
    items: list[OrderItemOut]


class OrderStatusUpdate(BaseModel):
    status: str


class AdminOrderOut(OrderDetailOut):
    user: UserOut
