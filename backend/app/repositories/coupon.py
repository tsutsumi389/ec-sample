"""Coupon のデータアクセス。"""

from sqlalchemy.orm import Session

from app.models import Coupon


def get(db: Session, coupon_id: int) -> Coupon | None:
    return db.get(Coupon, coupon_id)


def get_by_code(db: Session, code: str) -> Coupon | None:
    return db.query(Coupon).filter(Coupon.code == code).first()


def list_all(db: Session) -> list[Coupon]:
    return db.query(Coupon).order_by(Coupon.id).all()


def code_exists(db: Session, code: str, exclude_id: int | None = None) -> bool:
    query = db.query(Coupon).filter(Coupon.code == code)
    if exclude_id is not None:
        query = query.filter(Coupon.id != exclude_id)
    return query.first() is not None


def add(db: Session, coupon: Coupon) -> Coupon:
    db.add(coupon)
    return coupon


def delete(db: Session, coupon: Coupon) -> None:
    db.delete(coupon)
