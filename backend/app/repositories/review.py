"""Review のデータアクセス（評価集計を含む）。"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Review, User


def rating_stats(db: Session, product_id: int) -> tuple[float | None, int]:
    """1 商品の (平均評価, レビュー数) を返す。"""
    avg_rating, review_count = db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(
            Review.product_id == product_id
        )
    ).one()
    return (float(avg_rating) if avg_rating is not None else None, review_count or 0)


def rating_map(
    db: Session, product_ids: set[int]
) -> dict[int, tuple[float | None, int]]:
    """商品IDごとの (平均評価, レビュー数) を 1 クエリでまとめて返す（N+1 回避）。"""
    if not product_ids:
        return {}
    rows = db.execute(
        select(Review.product_id, func.avg(Review.rating), func.count(Review.id))
        .where(Review.product_id.in_(product_ids))
        .group_by(Review.product_id)
    ).all()
    return {
        pid: (float(avg) if avg is not None else None, count or 0)
        for pid, avg, count in rows
    }


def list_for_product(db: Session, product_id: int) -> list[tuple[Review, str]]:
    """商品のレビュー一覧を (Review, 投稿者名) の列で新しい順に返す。"""
    return (
        db.query(Review, User.name)
        .join(User, Review.user_id == User.id)
        .filter(Review.product_id == product_id)
        .order_by(Review.created_at.desc(), Review.id.desc())
        .all()
    )


def get_user_review(db: Session, user_id: int, product_id: int) -> Review | None:
    return (
        db.query(Review)
        .filter(Review.user_id == user_id, Review.product_id == product_id)
        .first()
    )


def add(db: Session, review: Review) -> Review:
    db.add(review)
    return review
