from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Address, User
from app.schemas import AddressCreate, AddressOut, AddressUpdate
from app.services import address as address_service

router = APIRouter(prefix="/addresses", tags=["addresses"])


@router.get("", response_model=list[AddressOut])
def list_addresses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Address]:
    return address_service.list_for_user(db, current_user.id)


@router.post("", response_model=AddressOut, status_code=status.HTTP_201_CREATED)
def create_address(
    payload: AddressCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Address:
    return address_service.create(db, current_user.id, payload)


@router.put("/{address_id}", response_model=AddressOut)
def update_address(
    address_id: int,
    payload: AddressUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Address:
    return address_service.update(db, current_user.id, address_id, payload)


@router.delete("/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_address(
    address_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    address_service.delete(db, current_user.id, address_id)
    return None
