"""注文のアプリケーションサービス。

注文確定は「商品行を FOR UPDATE でロック → 在庫・購入可否を検証 → 実売価格を
スナップショット → クーポン適用 → カートを空にする」を単一トランザクションで行う。
在庫の同時更新競合による売り越しを防ぐのが要。
"""

from sqlalchemy.orm import Session

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.models import Address, Order, OrderItem
from app.repositories import address as address_repo
from app.repositories import cart as cart_repo
from app.repositories import order as order_repo
from app.repositories import product as product_repo
from app.schemas import OrderCreate
from app.services import coupon as coupon_service


def _format_shipping_address(address: Address) -> str:
    return (
        f"{address.recipient_name}\n"
        f"〒{address.postal_code} {address.prefecture}{address.city}{address.address_line}\n"
        f"TEL: {address.phone}"
    )


def list_for_user(db: Session, user_id: int) -> list[Order]:
    return order_repo.list_for_user(db, user_id)


def get_for_user(db: Session, order_id: int, user_id: int) -> Order:
    order = order_repo.get_for_user(db, order_id, user_id)
    if order is None:
        raise NotFoundError("Order not found")
    return order


def create(db: Session, user_id: int, payload: OrderCreate) -> Order:
    cart_items = cart_repo.list_for_user(db, user_id)
    if not cart_items:
        raise BusinessRuleError("カートが空です")

    shipping_address = payload.shipping_address
    if payload.address_id is not None:
        address = address_repo.get_for_user(db, payload.address_id, user_id)
        if address is None:
            raise NotFoundError("Address not found")
        shipping_address = _format_shipping_address(address)

    if not shipping_address:
        raise BusinessRuleError("Shipping address is required")

    try:
        product_ids = [item.product_id for item in cart_items]
        # 対象商品行をトランザクション期間ロックし、同時注文による売り越しを防ぐ。
        products = product_repo.lock_by_ids(db, product_ids)
        products_by_id = {p.id: p for p in products}

        total_amount = 0
        order_items: list[OrderItem] = []

        for cart_item in cart_items:
            product = products_by_id.get(cart_item.product_id)
            if product is None or not product.is_viewable:
                raise BusinessRuleError(f"商品が見つかりません: {cart_item.product_id}")
            if product.status != "on_sale":
                raise BusinessRuleError(f"この商品は現在購入できません: {product.name}")
            if product.stock < cart_item.quantity:
                raise BusinessRuleError(f"在庫が不足しています: {product.name}")

            # 実売価格を注文時点の価格として OrderItem にスナップショットする。
            unit_price = product.effective_price
            product.stock -= cart_item.quantity
            total_amount += unit_price * cart_item.quantity
            order_items.append(
                OrderItem(
                    product_id=product.id,
                    product_name=product.name,
                    price=unit_price,
                    quantity=cart_item.quantity,
                )
            )

        discount_amount = 0
        coupon_code: str | None = None
        if payload.coupon_code:
            coupon = coupon_service.get_by_code(db, payload.coupon_code)
            valid, discount_amount, message = coupon_service.evaluate(
                coupon, total_amount
            )
            if not valid:
                raise BusinessRuleError(message)
            coupon_code = payload.coupon_code

        order = Order(
            user_id=user_id,
            total_amount=total_amount - discount_amount,
            discount_amount=discount_amount,
            coupon_code=coupon_code,
            status="pending",
            shipping_address=shipping_address,
            items=order_items,
        )
        order_repo.add(db, order)

        for cart_item in cart_items:
            cart_repo.delete(db, cart_item)

        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(order)
    return order


def cancel(db: Session, order_id: int, user_id: int) -> Order:
    order = order_repo.get_for_user(db, order_id, user_id)
    if order is None:
        raise NotFoundError("Order not found")

    if order.status not in ("pending", "paid"):
        raise BusinessRuleError("Cannot cancel this order")

    try:
        product_ids = [item.product_id for item in order.items]
        products = product_repo.lock_by_ids(db, product_ids)
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
