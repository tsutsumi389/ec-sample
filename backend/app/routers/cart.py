from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_visitor_id
from app.database import get_db
from app.models import CartItem, Product, User
from app.schemas import (
    CartItemCreate,
    CartItemOut,
    CartItemUpdate,
    CartMergeResultOut,
    CartOut,
    GuestCartIn,
    GuestCartOut,
    ProductOut,
)
from app.services import analytics
from app.services import cart as cart_service

router = APIRouter(prefix="/cart", tags=["cart"])


def _to_cart_item_out(item: CartItem) -> CartItemOut:
    return CartItemOut(
        id=item.id,
        product=ProductOut.model_validate(item.product),
        quantity=item.quantity,
        subtotal=item.product.effective_price * item.quantity,
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
    visitor_id: str | None = Depends(get_visitor_id),
    db: Session = Depends(get_db),
) -> CartOut:
    product = db.get(Product, payload.product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if product.status != "on_sale":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="この商品は現在購入できません"
        )

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

    # カート投入をサーバー側で記録する（ファネルの中間指標）。
    #
    # ゲスト（未ログイン）のカート投入はこのエンドポイントを通らず端末の localStorage に
    # 入るため、そちらはフロントが同じ名前（add_to_cart）で記録する。ログイン時の
    # マージ（POST /cart/merge）では記録しない——ゲストの時点で 1 件記録済みで、
    # マージでもう 1 件足すと同じ投入が二重に数えられるため。
    if visitor_id:
        analytics.record_server_event(
            db,
            visitor_id=visitor_id,
            name=analytics.EVENT_ADD_TO_CART,
            user_id=current_user.id,
            value=float(product.effective_price * payload.quantity),
            props={"product_id": product.id, "quantity": payload.quantity},
        )

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


@router.post("/preview", response_model=GuestCartOut)
def preview_guest_cart(
    payload: GuestCartIn,
    db: Session = Depends(get_db),
) -> GuestCartOut:
    """ゲストカートの明細を解決して返す（認証不要）。

    在庫の引き当てはしない（ゲストのカートは予約ではない）。金額は effective_price から
    サーバーが計算する。ゲストカートを描くのに必要な情報がこの 1 リクエストで揃うので、
    フロントは商品を 1 件ずつ引き直さない。
    """
    return cart_service.resolve_guest_lines(
        db,
        [
            cart_service.CartLineRequest(product_id=item.product_id, quantity=item.quantity)
            for item in payload.items
        ],
    )


@router.post("/merge", response_model=CartMergeResultOut)
def merge_guest_cart(
    payload: GuestCartIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartMergeResultOut:
    """端末が持っていたゲストカートをサーバーのカートへ合算する（ログイン直後に呼ぶ）。

    買えない明細はエラーにせず理由とともに見送る（再注文と同じ流儀）。カート投入の計測は
    ゲストの時点でフロントが済ませているので、ここでは記録しない（add_cart_item の
    コメント参照）。
    """
    lines = [
        cart_service.CartLineRequest(product_id=item.product_id, quantity=item.quantity)
        for item in payload.items
    ]
    try:
        added, skipped = cart_service.merge_lines(db, current_user.id, lines)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return CartMergeResultOut(
        cart=_get_cart(db, current_user), added=added, skipped=skipped
    )


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
