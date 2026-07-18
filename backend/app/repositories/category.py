"""Category のデータアクセス。"""

from sqlalchemy.orm import Session

from app.models import Category, Product


def list_ordered_by_name(db: Session) -> list[Category]:
    """公開一覧用（名前順）。"""
    return db.query(Category).order_by(Category.name).all()


def list_ordered_by_id(db: Session) -> list[Category]:
    """管理画面用（ID 順）。"""
    return db.query(Category).order_by(Category.id).all()


def get(db: Session, category_id: int) -> Category | None:
    return db.get(Category, category_id)


def get_by_slug(db: Session, slug: str) -> Category | None:
    return db.query(Category).filter(Category.slug == slug).first()


def slug_exists(db: Session, slug: str, exclude_id: int | None = None) -> bool:
    query = db.query(Category).filter(Category.slug == slug)
    if exclude_id is not None:
        query = query.filter(Category.id != exclude_id)
    return query.first() is not None


def add(db: Session, category: Category) -> Category:
    db.add(category)
    return category


def delete(db: Session, category: Category) -> None:
    db.delete(category)


def detach_products(db: Session, category_id: int) -> None:
    """このカテゴリに属する商品の category_id を NULL にする（商品は削除しない）。"""
    db.query(Product).filter(Product.category_id == category_id).update(
        {Product.category_id: None}
    )
