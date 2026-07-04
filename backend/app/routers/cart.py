from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import CartItem, Product, User
from app.schemas import CartItemCreate, CartItemOut, CartItemUpdate, CartOut, ProductOut

router = APIRouter(prefix="/cart", tags=["cart"])


def _to_cart_item_out(item: CartItem) -> CartItemOut:
    return CartItemOut(
        id=item.id,
        product=ProductOut.model_validate(item.product),
        quantity=item.quantity,
        subtotal=item.product.price * item.quantity,
    )


def _get_cart(db: Session, user: User) -> CartOut:
    items = (
        db.query(CartItem)
        .filter(CartItem.user_id == user.id)
        .order_by(CartItem.id)
        .all()
    )
    items_out = [_to_cart_item_out(item) for item in items]
    total_amount = sum(item.subtotal for item in items_out)
    return CartOut(items=items_out, total_amount=total_amount)


@router.get("", response_model=CartOut)
def get_cart(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartOut:
    return _get_cart(db, current_user)


@router.post("/items", response_model=CartOut, status_code=status.HTTP_201_CREATED)
def add_cart_item(
    payload: CartItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartOut:
    product = db.get(Product, payload.product_id)
    if product is None or not product.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    existing = (
        db.query(CartItem)
        .filter(CartItem.user_id == current_user.id, CartItem.product_id == payload.product_id)
        .first()
    )

    new_quantity = payload.quantity + (existing.quantity if existing else 0)
    if new_quantity > product.stock:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="在庫が不足しています")

    if existing:
        existing.quantity = new_quantity
    else:
        db.add(CartItem(user_id=current_user.id, product_id=payload.product_id, quantity=new_quantity))

    db.commit()
    return _get_cart(db, current_user)


@router.put("/items/{item_id}", response_model=CartOut)
def update_cart_item(
    item_id: int,
    payload: CartItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartOut:
    item = (
        db.query(CartItem)
        .filter(CartItem.id == item_id, CartItem.user_id == current_user.id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found")

    if payload.quantity > item.product.stock:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="在庫が不足しています")

    item.quantity = payload.quantity
    db.commit()
    return _get_cart(db, current_user)


@router.delete("/items/{item_id}", response_model=CartOut)
def delete_cart_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartOut:
    item = (
        db.query(CartItem)
        .filter(CartItem.id == item_id, CartItem.user_id == current_user.id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found")

    db.delete(item)
    db.commit()
    return _get_cart(db, current_user)
