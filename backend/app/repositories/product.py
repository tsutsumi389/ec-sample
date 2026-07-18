"""Product 系（Product / ProductEmbedding / ProductView）のデータアクセス。

一覧検索のハイブリッドクエリ（キーワード + セマンティック）もここに集約する。
「クエリを埋め込むか」「相対カットオフをどう決めるか」といった業務判断は
product_service 側が持ち、ここは決まったパラメータからクエリを組んで実行するだけに徹する。
"""

from sqlalchemy import case, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import (
    LISTED_STATUSES,
    Order,
    OrderItem,
    Product,
    ProductEmbedding,
    ProductView,
    Review,
)


def get(db: Session, product_id: int) -> Product | None:
    return db.get(Product, product_id)


def get_embedding(db: Session, product_id: int) -> ProductEmbedding | None:
    return db.get(ProductEmbedding, product_id)


def list_all(db: Session) -> list[Product]:
    """管理画面用（全状態を ID 順）。"""
    return db.query(Product).order_by(Product.id).all()


def list_by_ids(db: Session, product_ids: list[int]) -> list[Product]:
    """指定 ID の商品をまとめて取得する（順序は保証しない）。"""
    return db.query(Product).filter(Product.id.in_(product_ids)).all()


def add(db: Session, product: Product) -> Product:
    db.add(product)
    return product


def lock_by_ids(db: Session, product_ids: list[int]) -> list[Product]:
    """指定商品行を FOR UPDATE でロックして取得する（在庫の同時更新競合を防ぐ）。"""
    return (
        db.query(Product)
        .filter(Product.id.in_(product_ids))
        .order_by(Product.id)
        .with_for_update()
        .all()
    )


def related_by_category(
    db: Session, category_id: int, exclude_id: int, limit: int
) -> list[Product]:
    """同カテゴリの出品中商品を（自身を除いて）ID 順に返す。"""
    return (
        db.query(Product)
        .filter(
            Product.category_id == category_id,
            Product.id != exclude_id,
            Product.status.in_(LISTED_STATUSES),
        )
        .order_by(Product.id)
        .limit(limit)
        .all()
    )


def neighbors_by_embedding(
    db: Session, target_embedding, exclude_id: int, limit: int
) -> list[Product]:
    """埋め込みのコサイン近傍で、出品中の類似商品を（自身を除いて）返す。"""
    stmt = (
        select(Product)
        .join(ProductEmbedding, ProductEmbedding.product_id == Product.id)
        .where(
            Product.status.in_(LISTED_STATUSES),
            Product.id != exclude_id,
        )
        .order_by(ProductEmbedding.embedding.cosine_distance(target_embedding))
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def upsert_view(db: Session, user_id: int, product_id: int) -> None:
    """商品閲覧を upsert する（初回は挿入、再閲覧は viewed_at 更新 + view_count +1）。"""
    stmt = (
        pg_insert(ProductView)
        .values(user_id=user_id, product_id=product_id)
        .on_conflict_do_update(
            constraint="uq_product_view_user_product",
            set_={
                "viewed_at": func.now(),
                "view_count": ProductView.view_count + 1,
            },
        )
    )
    db.execute(stmt)


# ---------- ハイブリッド検索（一覧） ----------


def min_semantic_distance(db: Session, query_vec) -> float | None:
    """クエリベクトルに対する全商品埋め込みの最近傍コサイン距離を返す。"""
    return db.scalar(
        select(func.min(ProductEmbedding.embedding.cosine_distance(query_vec)))
    )


def semantic_candidate_ids(
    db: Session, query_vec, cutoff: float, limit: int
) -> list[int]:
    """相対カットオフ以内かつ距離が近い上位 N 商品の ID を返す（意味的候補）。"""
    distance = ProductEmbedding.embedding.cosine_distance(query_vec)
    rows = db.execute(
        select(ProductEmbedding.product_id)
        .where(distance <= cutoff)
        .order_by(distance)
        .limit(limit)
    ).scalars()
    return list(rows)


def suggest_names(db: Session, query: str, limit: int) -> list[str]:
    """検索サジェスト。出品中商品名への ILIKE 部分一致で候補語を関連度順に返す。

    埋め込み等は使わず軽量に保つ（入力中の高頻度呼び出しに耐えるため）。
    ILIKE のワイルドカード（% _ \\）はエスケープしてリテラル一致にする。
    関連度: ①マッチ位置が早いほど上位（前方一致は pos=1 で最上位）②同着なら名前が短い順
    ③最後に名前で安定化。同名は 1 件に畳む。
    """
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    # strpos はワイルドカードを特殊扱いしないので生クエリを使う。
    match_pos = func.strpos(func.lower(Product.name), query.lower())
    rows = (
        db.execute(
            select(Product.name)
            .where(
                Product.status.in_(LISTED_STATUSES),
                Product.name.ilike(f"%{escaped}%", escape="\\"),
            )
            .group_by(Product.name)
            .order_by(
                match_pos.asc(),
                func.char_length(Product.name).asc(),
                Product.name.asc(),
            )
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return list(rows)


def search_listing(
    db: Session,
    *,
    search: str | None,
    category_id: int | None,
    min_price: int | None,
    max_price: int | None,
    sort: str | None,
    page: int,
    limit: int,
    semantic_ids: list[int] | None,
    query_vec,
    profile_vec,
) -> tuple[list[tuple[Product, float | None, int]], int]:
    """一覧検索。(rows, total) を返す。rows は (Product, avg_rating, review_count) の列。

    semantic_ids が None なら純キーワード（ILIKE のみ）、非 None なら「名前一致 or 意味的候補」。
    profile_vec は recommended ソートで使い、None のときは人気順にフォールバックする。
    query_vec は sort 未指定 × 意味的候補ありのときの関連度並べ替えに使う。
    """
    conditions = [Product.status.in_(LISTED_STATUSES)]
    if search:
        if semantic_ids is not None:
            conditions.append(
                or_(
                    Product.name.ilike(f"%{search}%"),
                    Product.id.in_(semantic_ids),
                )
            )
        else:
            conditions.append(Product.name.ilike(f"%{search}%"))
    if category_id is not None:
        conditions.append(Product.category_id == category_id)
    if min_price is not None:
        conditions.append(Product.price >= min_price)
    if max_price is not None:
        conditions.append(Product.price <= max_price)

    total = db.scalar(select(func.count()).select_from(Product).where(*conditions)) or 0

    rating_subq = (
        select(
            Review.product_id.label("product_id"),
            func.avg(Review.rating).label("avg_rating"),
            func.count(Review.id).label("review_count"),
        )
        .group_by(Review.product_id)
        .subquery()
    )

    stmt = (
        select(Product, rating_subq.c.avg_rating, rating_subq.c.review_count)
        .outerjoin(rating_subq, rating_subq.c.product_id == Product.id)
        .where(*conditions)
    )

    if sort == "newest":
        stmt = stmt.order_by(Product.created_at.desc(), Product.id.desc())
    elif sort == "price_asc":
        stmt = stmt.order_by(Product.price.asc(), Product.id)
    elif sort == "price_desc":
        stmt = stmt.order_by(Product.price.desc(), Product.id)
    elif sort == "rating":
        stmt = stmt.order_by(rating_subq.c.avg_rating.desc().nullslast(), Product.id)
    elif sort == "recommended":
        # プロフィールベクトルが作れればコサイン近傍で並べ替え、作れなければ人気順に落とす。
        if profile_vec is not None:
            stmt = stmt.outerjoin(
                ProductEmbedding, ProductEmbedding.product_id == Product.id
            ).order_by(
                ProductEmbedding.embedding.cosine_distance(profile_vec).nullslast(),
                Product.id,
            )
        else:
            popularity_subq = (
                select(
                    OrderItem.product_id.label("product_id"),
                    func.coalesce(func.sum(OrderItem.quantity), 0).label("purchased"),
                )
                .join(Order, OrderItem.order_id == Order.id)
                .where(Order.status != "cancelled")
                .group_by(OrderItem.product_id)
                .subquery()
            )
            stmt = stmt.outerjoin(
                popularity_subq, popularity_subq.c.product_id == Product.id
            ).order_by(
                func.coalesce(popularity_subq.c.purchased, 0).desc(),
                rating_subq.c.avg_rating.desc().nullslast(),
                Product.created_at.desc(),
                Product.id.desc(),
            )
    elif semantic_ids is not None:
        # sort 未指定 かつ 意味的候補を実際に使ったとき: 名前一致(0)を優先し、
        # 次にコサイン距離が近い順、最後に id で安定化する（関連度順）。
        relevance_rank = case((Product.name.ilike(f"%{search}%"), 0), else_=1)
        stmt = stmt.outerjoin(
            ProductEmbedding, ProductEmbedding.product_id == Product.id
        ).order_by(
            relevance_rank.asc(),
            ProductEmbedding.embedding.cosine_distance(query_vec).nullslast(),
            Product.id,
        )
    else:
        stmt = stmt.order_by(Product.id)

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    rows = db.execute(stmt).all()
    return [
        (product, float(avg) if avg is not None else None, count or 0)
        for product, avg, count in rows
    ], total
