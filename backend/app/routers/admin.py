from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_admin
from app.database import get_db
from app.models import Order, Product, User
from app.schemas import (
    AdminOrderOut,
    AdminUserOut,
    OrderStatusUpdate,
    ProductCreate,
    ProductOut,
    ProductUpdate,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])

VALID_ORDER_STATUSES = {"pending", "paid", "shipped", "delivered", "cancelled"}


# ---------- Products ----------


@router.get("/products", response_model=list[ProductOut])
def list_all_products(db: Session = Depends(get_db)) -> list[Product]:
    return db.query(Product).order_by(Product.id).all()


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)) -> Product:
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)
) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)
    return product


@router.delete("/products/{product_id}", response_model=ProductOut)
def delete_product(product_id: int, db: Session = Depends(get_db)) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    product.is_active = False
    db.commit()
    db.refresh(product)
    return product


# ---------- Orders ----------


@router.get("/orders", response_model=list[AdminOrderOut])
def list_all_orders(db: Session = Depends(get_db)) -> list[Order]:
    return db.query(Order).order_by(Order.created_at.desc(), Order.id.desc()).all()


@router.put("/orders/{order_id}/status", response_model=AdminOrderOut)
def update_order_status(
    order_id: int, payload: OrderStatusUpdate, db: Session = Depends(get_db)
) -> Order:
    if payload.status not in VALID_ORDER_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")

    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    order.status = payload.status
    db.commit()
    db.refresh(order)
    return order


# ---------- Users ----------


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return db.query(User).order_by(User.id).all()
