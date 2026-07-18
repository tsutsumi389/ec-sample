"""CartItem のデータアクセス。"""

from sqlalchemy.orm import Session

from app.models import CartItem


def list_for_user(db: Session, user_id: int) -> list[CartItem]:
    return (
        db.query(CartItem)
        .filter(CartItem.user_id == user_id)
        .order_by(CartItem.id)
        .all()
    )


def get_item_for_user(db: Session, item_id: int, user_id: int) -> CartItem | None:
    return (
        db.query(CartItem)
        .filter(CartItem.id == item_id, CartItem.user_id == user_id)
        .first()
    )


def get_by_user_product(
    db: Session, user_id: int, product_id: int
) -> CartItem | None:
    return (
        db.query(CartItem)
        .filter(CartItem.user_id == user_id, CartItem.product_id == product_id)
        .first()
    )


def add(db: Session, item: CartItem) -> CartItem:
    db.add(item)
    return item


def delete(db: Session, item: CartItem) -> None:
    db.delete(item)
