from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Address, CartItem, Order, OrderItem, Product, User
from app.routers.coupons import evaluate_coupon, get_coupon_by_code
from app.schemas import OrderCreate, OrderDetailOut, OrderSummaryOut

router = APIRouter(prefix="/orders", tags=["orders"])


def _format_shipping_address(address: Address) -> str:
    return (
        f"{address.recipient_name}\n"
        f"〒{address.postal_code} {address.prefecture}{address.city}{address.address_line}\n"
        f"TEL: {address.phone}"
    )


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

    shipping_address = payload.shipping_address
    if payload.address_id is not None:
        address = (
            db.query(Address)
            .filter(Address.id == payload.address_id, Address.user_id == current_user.id)
            .first()
        )
        if address is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found")
        shipping_address = _format_shipping_address(address)

    if not shipping_address:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Shipping address is required"
        )

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

        discount_amount = 0
        coupon_code: str | None = None
        if payload.coupon_code:
            coupon = get_coupon_by_code(db, payload.coupon_code)
            valid, discount_amount, message = evaluate_coupon(coupon, total_amount)
            if not valid:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
            coupon_code = payload.coupon_code

        order = Order(
            user_id=current_user.id,
            total_amount=total_amount - discount_amount,
            discount_amount=discount_amount,
            coupon_code=coupon_code,
            status="pending",
            shipping_address=shipping_address,
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


@router.post("/{order_id}/cancel", response_model=OrderDetailOut)
def cancel_order(
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

    if order.status not in ("pending", "paid"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel this order"
        )

    try:
        product_ids = [item.product_id for item in order.items]
        products = (
            db.query(Product)
            .filter(Product.id.in_(product_ids))
            .order_by(Product.id)
            .with_for_update()
            .all()
        )
        products_by_id = {p.id: p for p in products}

        for item in order.items:
            product = products_by_id.get(item.product_id)
            if product is not None:
                product.stock += item.quantity

        order.status = "cancelled"
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(order)
    return order
