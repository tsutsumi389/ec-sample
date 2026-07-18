from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import WishlistItemCreate, WishlistItemOut
from app.services import wishlist as wishlist_service

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


@router.get("", response_model=list[WishlistItemOut])
def list_wishlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WishlistItemOut]:
    return wishlist_service.list_for_user(db, current_user.id)


@router.post("/items", response_model=WishlistItemOut, status_code=status.HTTP_201_CREATED)
def add_wishlist_item(
    payload: WishlistItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WishlistItemOut:
    return wishlist_service.add(db, current_user.id, payload.product_id)


@router.delete("/items/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_wishlist_item(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    wishlist_service.remove(db, current_user.id, product_id)
    return None
