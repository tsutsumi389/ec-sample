"""管理（admin）のアプリケーションサービス。

商品・注文・ユーザーの管理操作を担う。カテゴリ／クーポンの管理 CRUD は
category / coupon サービスに委譲するため、ここには持たない。

埋め込みの更新は本体処理と切り離して非同期実行する（失敗しても商品操作は成立済み）。
非同期タスクは自前セッションを開閉し、embedding 側で例外を握って警告ログ化する。
実際の起動（BackgroundTasks への登録）はレスポンス後実行という HTTP の関心なので router が行う。
"""

from sqlalchemy.orm import Session

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.database import SessionLocal
from app.models import Order, Product, ProductImage
from app.repositories import order as order_repo
from app.repositories import product as product_repo
from app.repositories import user as user_repo
from app.schemas import ProductCreate, ProductUpdate
from app.services import embedding

VALID_ORDER_STATUSES = {"pending", "paid", "shipped", "delivered", "cancelled"}


# ---------- 埋め込み非同期タスク ----------


def refresh_embedding_task(product_id: int) -> None:
    """商品作成/更新後に単一商品の埋め込みを更新する（自前セッションで開閉）。"""
    db = SessionLocal()
    try:
        embedding.refresh_product_embedding(db, product_id)
    finally:
        db.close()


def rebuild_embeddings_task() -> None:
    """全商品の埋め込み + セマンティックID を強制再構築する。"""
    db = SessionLocal()
    try:
        embedding.sync_embeddings(db, force=True)
    finally:
        db.close()


# ---------- Products ----------


def list_all_products(db: Session) -> list[Product]:
    return product_repo.list_all(db)


def _sync_images(product: Product, image_urls: list[str]) -> None:
    """商品のギャラリー画像を与えられた URL 列で丸ごと置き換える（表示順は配列順）。"""
    product.images = [
        ProductImage(image_url=url, sort_order=index)
        for index, url in enumerate(image_urls)
        if url.strip()
    ]


def create_product(db: Session, payload: ProductCreate) -> Product:
    data = payload.model_dump()
    image_urls = data.pop("image_urls", [])
    product = Product(**data)
    _sync_images(product, image_urls)
    product_repo.add(db, product)
    db.commit()
    db.refresh(product)
    return product


def update_product(db: Session, product_id: int, payload: ProductUpdate) -> Product:
    product = product_repo.get(db, product_id)
    if product is None:
        raise NotFoundError("Product not found")

    data = payload.model_dump(exclude_unset=True)
    # image_urls は None=変更しない / [] や配列=その内容で丸ごと置換、として扱う。
    image_urls = data.pop("image_urls", None)
    for field, value in data.items():
        setattr(product, field, value)
    if image_urls is not None:
        _sync_images(product, image_urls)

    db.commit()
    db.refresh(product)
    return product


def delete_product(db: Session, product_id: int) -> Product:
    product = product_repo.get(db, product_id)
    if product is None:
        raise NotFoundError("Product not found")

    # 物理削除はせず archived に落とす（論理削除。過去注文のスナップショットは不変）。
    product.status = "archived"
    db.commit()
    db.refresh(product)
    return product


# ---------- Orders ----------


def list_all_orders(db: Session) -> list[Order]:
    return order_repo.list_all(db)


def update_order_status(db: Session, order_id: int, new_status: str) -> Order:
    if new_status not in VALID_ORDER_STATUSES:
        raise BusinessRuleError("Invalid status")

    order = order_repo.get(db, order_id)
    if order is None:
        raise NotFoundError("Order not found")

    order.status = new_status
    db.commit()
    db.refresh(order)
    return order


# ---------- Users ----------


def list_users(db: Session):
    return user_repo.list_all(db)
