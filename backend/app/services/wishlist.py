"""お気に入り（ウィッシュリスト）のアプリケーションサービス。"""

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.presenters import to_wishlist_item_out
from app.models import WishlistItem
from app.repositories import product as product_repo
from app.repositories import wishlist as wishlist_repo
from app.schemas import WishlistItemOut


def list_for_user(db: Session, user_id: int) -> list[WishlistItemOut]:
    items = wishlist_repo.list_for_user(db, user_id)
    return [to_wishlist_item_out(item) for item in items]


def add(db: Session, user_id: int, product_id: int) -> WishlistItemOut:
    product = product_repo.get(db, product_id)
    if product is None or not product.is_viewable:
        raise NotFoundError("Product not found")

    # 既に登録済みなら冪等に既存行を返す（重複追加はエラーにしない）。
    item = wishlist_repo.get(db, user_id, product_id)
    if item is None:
        item = WishlistItem(user_id=user_id, product_id=product_id)
        wishlist_repo.add(db, item)
        db.commit()
        db.refresh(item)

    return to_wishlist_item_out(item)


def remove(db: Session, user_id: int, product_id: int) -> None:
    item = wishlist_repo.get(db, user_id, product_id)
    if item is not None:
        wishlist_repo.delete(db, item)
        db.commit()
