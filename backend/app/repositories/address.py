"""Address のデータアクセス。"""

from sqlalchemy.orm import Session

from app.models import Address


def list_for_user(db: Session, user_id: int) -> list[Address]:
    return (
        db.query(Address)
        .filter(Address.user_id == user_id)
        .order_by(Address.is_default.desc(), Address.id.desc())
        .all()
    )


def get_for_user(db: Session, address_id: int, user_id: int) -> Address | None:
    return (
        db.query(Address)
        .filter(Address.id == address_id, Address.user_id == user_id)
        .first()
    )


def add(db: Session, address: Address) -> Address:
    db.add(address)
    return address


def delete(db: Session, address: Address) -> None:
    db.delete(address)


def unset_other_defaults(
    db: Session, user_id: int, exclude_id: int | None = None
) -> None:
    """指定ユーザーの既定住所フラグを（exclude_id を除いて）すべて下ろす。"""
    query = db.query(Address).filter(
        Address.user_id == user_id, Address.is_default.is_(True)
    )
    if exclude_id is not None:
        query = query.filter(Address.id != exclude_id)
    for address in query.all():
        address.is_default = False
