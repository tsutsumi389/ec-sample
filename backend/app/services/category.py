"""カテゴリのアプリケーションサービス（公開参照 + 管理 CRUD）。

トランザクション境界（commit）とドメインルール（slug 重複）を担う。
データアクセスは repositories.category に委譲する。
"""

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models import Category
from app.repositories import category as category_repo
from app.schemas import CategoryCreate, CategoryOut, CategoryUpdate


def list_public(db: Session) -> list[Category]:
    """公開一覧（名前順）。"""
    return category_repo.list_ordered_by_name(db)


def list_all(db: Session) -> list[Category]:
    """管理画面用（ID 順）。"""
    return category_repo.list_ordered_by_id(db)


def create(db: Session, payload: CategoryCreate) -> Category:
    if category_repo.slug_exists(db, payload.slug):
        raise ConflictError("Slug already exists")

    category = Category(**payload.model_dump())
    category_repo.add(db, category)
    db.commit()
    db.refresh(category)
    return category


def update(db: Session, category_id: int, payload: CategoryUpdate) -> Category:
    category = category_repo.get(db, category_id)
    if category is None:
        raise NotFoundError("Category not found")

    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and category_repo.slug_exists(
        db, data["slug"], exclude_id=category_id
    ):
        raise ConflictError("Slug already exists")

    for field, value in data.items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)
    return category


def delete(db: Session, category_id: int) -> CategoryOut:
    category = category_repo.get(db, category_id)
    if category is None:
        raise NotFoundError("Category not found")

    # 削除後は ORM が無効化されるため、レスポンス用に削除前のスナップショットを取る。
    result = CategoryOut.model_validate(category)
    # 商品は削除せず、カテゴリからの参照だけ外す（論理削除運用）。
    category_repo.detach_products(db, category_id)
    category_repo.delete(db, category)
    db.commit()
    return result
