from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Product, User, WishlistItem
from app.schemas import ProductOut, WishlistItemCreate, WishlistItemOut

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


@router.get("", response_model=list[WishlistItemOut])
def list_wishlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WishlistItemOut]:
    items = (
        db.query(WishlistItem)
        .filter(WishlistItem.user_id == current_user.id)
        .order_by(WishlistItem.created_at.desc(), WishlistItem.id.desc())
        .all()
    )
    return [
        WishlistItemOut(
            id=item.id,
            product=ProductOut.model_validate(item.product),
            created_at=item.created_at,
        )
        for item in items
    ]


@router.post("/items", response_model=WishlistItemOut, status_code=status.HTTP_201_CREATED)
def add_wishlist_item(
    payload: WishlistItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WishlistItemOut:
    product = db.get(Product, payload.product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    existing = (
        db.query(WishlistItem)
        .filter(
            WishlistItem.user_id == current_user.id,
            WishlistItem.product_id == payload.product_id,
        )
        .first()
    )
    if existing is None:
        existing = WishlistItem(user_id=current_user.id, product_id=payload.product_id)
        db.add(existing)
        db.commit()
        db.refresh(existing)

    return WishlistItemOut(
        id=existing.id,
        product=ProductOut.model_validate(product),
        created_at=existing.created_at,
    )


@router.delete("/items/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_wishlist_item(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    item = (
        db.query(WishlistItem)
        .filter(WishlistItem.user_id == current_user.id, WishlistItem.product_id == product_id)
        .first()
    )
    if item is not None:
        db.delete(item)
        db.commit()
    return None
