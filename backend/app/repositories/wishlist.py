"""WishlistItem のデータアクセス。"""

from sqlalchemy.orm import Session

from app.models import WishlistItem


def list_for_user(db: Session, user_id: int) -> list[WishlistItem]:
    return (
        db.query(WishlistItem)
        .filter(WishlistItem.user_id == user_id)
        .order_by(WishlistItem.created_at.desc(), WishlistItem.id.desc())
        .all()
    )


def get(db: Session, user_id: int, product_id: int) -> WishlistItem | None:
    return (
        db.query(WishlistItem)
        .filter(
            WishlistItem.user_id == user_id,
            WishlistItem.product_id == product_id,
        )
        .first()
    )


def add(db: Session, item: WishlistItem) -> WishlistItem:
    db.add(item)
    return item


def delete(db: Session, item: WishlistItem) -> None:
    db.delete(item)
