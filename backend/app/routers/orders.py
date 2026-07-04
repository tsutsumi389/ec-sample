from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import CartItem, Order, OrderItem, Product, User
from app.schemas import OrderCreate, OrderDetailOut, OrderSummaryOut

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderDetailOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Order:
    cart_items = (
        db.query(CartItem)
        .filter(CartItem.user_id == current_user.id)
        .order_by(CartItem.id)
        .all()
    )
    if not cart_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="カートが空です")

    try:
        product_ids = [item.product_id for item in cart_items]
        # Lock the involved product rows for the duration of this transaction so
        # concurrent orders cannot oversell the same stock.
        products = (
            db.query(Product)
            .filter(Product.id.in_(product_ids))
            .order_by(Product.id)
            .with_for_update()
            .all()
        )
        products_by_id = {p.id: p for p in products}

        total_amount = 0
        order_items: list[OrderItem] = []

        for cart_item in cart_items:
            product = products_by_id.get(cart_item.product_id)
            if product is None or not product.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"商品が見つかりません: {cart_item.product_id}",
                )
            if product.stock < cart_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"在庫が不足しています: {product.name}",
                )

            product.stock -= cart_item.quantity
            total_amount += product.price * cart_item.quantity
            order_items.append(
                OrderItem(
                    product_id=product.id,
                    product_name=product.name,
                    price=product.price,
                    quantity=cart_item.quantity,
                )
            )

        order = Order(
            user_id=current_user.id,
            total_amount=total_amount,
            status="pending",
            shipping_address=payload.shipping_address,
            items=order_items,
        )
        db.add(order)

        for cart_item in cart_items:
            db.delete(cart_item)

        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(order)
    return order


@router.get("", response_model=list[OrderSummaryOut])
def list_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Order]:
    return (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .all()
    )


@router.get("/{order_id}", response_model=OrderDetailOut)
def get_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Order:
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == current_user.id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order
