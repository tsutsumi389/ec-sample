"""Order / OrderItem のデータアクセス。"""

from sqlalchemy.orm import Session

from app.models import Order, OrderItem


def list_for_user(db: Session, user_id: int) -> list[Order]:
    return (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .all()
    )


def get_for_user(db: Session, order_id: int, user_id: int) -> Order | None:
    return (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == user_id)
        .first()
    )


def get(db: Session, order_id: int) -> Order | None:
    return db.get(Order, order_id)


def list_all(db: Session) -> list[Order]:
    return db.query(Order).order_by(Order.created_at.desc(), Order.id.desc()).all()


def has_user_purchased_product(db: Session, user_id: int, product_id: int) -> bool:
    """ユーザーがその商品を（キャンセル以外で）購入済みか。レビュー投稿権の判定に使う。"""
    return (
        db.query(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .filter(
            Order.user_id == user_id,
            Order.status != "cancelled",
            OrderItem.product_id == product_id,
        )
        .first()
        is not None
    )


def add(db: Session, order: Order) -> Order:
    db.add(order)
    return order
