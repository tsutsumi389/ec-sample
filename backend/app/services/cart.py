"""カートのアプリケーションサービス。

在庫・販売状態のチェック（業務ルール）とトランザクション境界を担う。
小計・合計は実売価格（effective_price）ベースで presenter が算出する。
"""

from sqlalchemy.orm import Session

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.presenters import to_cart_item_out
from app.models import CartItem
from app.repositories import cart as cart_repo
from app.repositories import product as product_repo
from app.schemas import CartItemCreate, CartItemUpdate, CartOut


def _cart_out(db: Session, user_id: int) -> CartOut:
    items = cart_repo.list_for_user(db, user_id)
    items_out = [to_cart_item_out(item) for item in items]
    total_amount = sum(item.subtotal for item in items_out)
    return CartOut(items=items_out, total_amount=total_amount)


def get_cart(db: Session, user_id: int) -> CartOut:
    return _cart_out(db, user_id)


def add_item(db: Session, user_id: int, payload: CartItemCreate) -> CartOut:
    product = product_repo.get(db, payload.product_id)
    if product is None or not product.is_viewable:
        raise NotFoundError("Product not found")
    if product.status != "on_sale":
        raise BusinessRuleError("この商品は現在購入できません")

    existing = cart_repo.get_by_user_product(db, user_id, payload.product_id)
    new_quantity = payload.quantity + (existing.quantity if existing else 0)
    if new_quantity > product.stock:
        raise BusinessRuleError("在庫が不足しています")

    if existing:
        existing.quantity = new_quantity
    else:
        cart_repo.add(
            db,
            CartItem(
                user_id=user_id,
                product_id=payload.product_id,
                quantity=new_quantity,
            ),
        )

    db.commit()
    return _cart_out(db, user_id)


def update_item(
    db: Session, user_id: int, item_id: int, payload: CartItemUpdate
) -> CartOut:
    item = cart_repo.get_item_for_user(db, item_id, user_id)
    if item is None:
        raise NotFoundError("Cart item not found")

    if payload.quantity > item.product.stock:
        raise BusinessRuleError("在庫が不足しています")

    item.quantity = payload.quantity
    db.commit()
    return _cart_out(db, user_id)


def delete_item(db: Session, user_id: int, item_id: int) -> CartOut:
    item = cart_repo.get_item_for_user(db, item_id, user_id)
    if item is None:
        raise NotFoundError("Cart item not found")

    cart_repo.delete(db, item)
    db.commit()
    return _cart_out(db, user_id)
