from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import CartItemCreate, CartItemUpdate, CartOut
from app.services import cart as cart_service

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("", response_model=CartOut)
def get_cart(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartOut:
    return cart_service.get_cart(db, current_user.id)


@router.post("/items", response_model=CartOut, status_code=status.HTTP_201_CREATED)
def add_cart_item(
    payload: CartItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartOut:
    return cart_service.add_item(db, current_user.id, payload)


@router.put("/items/{item_id}", response_model=CartOut)
def update_cart_item(
    item_id: int,
    payload: CartItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartOut:
    return cart_service.update_item(db, current_user.id, item_id, payload)


@router.delete("/items/{item_id}", response_model=CartOut)
def delete_cart_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartOut:
    return cart_service.delete_item(db, current_user.id, item_id)
