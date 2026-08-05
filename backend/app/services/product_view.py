"""商品カードの組み立て（ProductOut / RecommendationItemOut）。

一覧・商品ページ・レコメンド・ホームのレーン・アシスタントの提案カードは、どれも同じ形の
カードを返す。組み立てはここ 1 箇所に置き、ルーターには置かない——ルーターに置くと他の
ルーターやサービスが `app.routers.*` を import する羽目になり、services → routers →
services の逆流を招く（実際、置き場所が products ルーターだったあいだ、ホームだけが
呼べずに同じ組み立てを手書きしていた）。

評価（平均・件数）はカードに載るが商品テーブルには無い。並べる件数が先に確定している
場所では rating_map() で 1 クエリにまとめて引くこと。1 件ずつ rating_stats() を呼ぶと
「おすすめ 50 件で 50 クエリ」の往復になる。
"""

from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Product, Review
from app.schemas import ProductOut, RecommendationItemOut

# 商品ごとの (平均評価, レビュー数)。
RatingStats = tuple[float | None, int]
# レビューが 1 件も無い商品の値。表現を変えるならここ 1 箇所で足りる。
NO_REVIEWS: RatingStats = (None, 0)


def rating_stats(db: Session, product_id: int) -> RatingStats:
    """1 商品ぶんの (平均評価, レビュー数)。商品ページのように 1 件しか要らない場所用。"""
    avg_rating, review_count = db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(
            Review.product_id == product_id
        )
    ).one()
    return (float(avg_rating) if avg_rating is not None else None, review_count or 0)


def rating_map(db: Session, product_ids: set[int]) -> dict[int, RatingStats]:
    """商品IDごとの (平均評価, レビュー数) を 1 クエリでまとめて引く。"""
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


def to_product_out(
    product: Product, avg_rating: float | None = None, review_count: int = 0
) -> ProductOut:
    out = ProductOut.model_validate(product)
    return out.model_copy(update={"avg_rating": avg_rating, "review_count": review_count})


def to_item_out(
    product: Product, reason: str | None, ratings: dict[int, RatingStats]
) -> RecommendationItemOut:
    """引き当て済みの評価表からカードを 1 枚組む（クエリを発行しない）。

    ホームのように複数レーンを跨いで評価を 1 回だけ引きたい場所は、rating_map() を
    自分で呼んでからこれを使う。1 つの集合で済むなら to_item_outs() のほうが短い。
    """
    return RecommendationItemOut(
        product=to_product_out(product, *ratings.get(product.id, NO_REVIEWS)),
        reason=reason,
    )


def to_product_outs(db: Session, products: Sequence[Product]) -> list[ProductOut]:
    """商品の並びを ProductOut の並びへ整形する（評価は 1 クエリまとめ引き）。"""
    ratings = rating_map(db, {p.id for p in products})
    return [to_product_out(p, *ratings.get(p.id, NO_REVIEWS)) for p in products]


def to_item_outs(
    db: Session, pairs: Sequence[tuple[Product, str | None]]
) -> list[RecommendationItemOut]:
    """(Product, reason) の並びを RecommendationItemOut へ整形する（評価は 1 クエリ）。"""
    ratings = rating_map(db, {p.id for p, _ in pairs})
    return [to_item_out(product, reason, ratings) for product, reason in pairs]
