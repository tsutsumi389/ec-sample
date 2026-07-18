"""配送先住所のアプリケーションサービス。

既定住所は 1 件だけになるよう、保存時に他の既定フラグを下ろす整合を担う。
"""

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models import Address
from app.repositories import address as address_repo
from app.schemas import AddressCreate, AddressUpdate


def list_for_user(db: Session, user_id: int) -> list[Address]:
    return address_repo.list_for_user(db, user_id)


def create(db: Session, user_id: int, payload: AddressCreate) -> Address:
    address = Address(user_id=user_id, **payload.model_dump())
    address_repo.add(db, address)
    # id 採番のため flush してから、自分を除く既定フラグを下ろす。
    db.flush()
    if address.is_default:
        address_repo.unset_other_defaults(db, user_id, exclude_id=address.id)

    db.commit()
    db.refresh(address)
    return address


def update(
    db: Session, user_id: int, address_id: int, payload: AddressUpdate
) -> Address:
    address = address_repo.get_for_user(db, address_id, user_id)
    if address is None:
        raise NotFoundError("Address not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(address, field, value)

    if address.is_default:
        address_repo.unset_other_defaults(db, user_id, exclude_id=address.id)

    db.commit()
    db.refresh(address)
    return address


def delete(db: Session, user_id: int, address_id: int) -> None:
    address = address_repo.get_for_user(db, address_id, user_id)
    if address is None:
        raise NotFoundError("Address not found")

    address_repo.delete(db, address)
    db.commit()
