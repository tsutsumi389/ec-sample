from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_current_user_optional
from app.database import get_db
from app.models import (
    LISTED_STATUSES,
    Order,
    OrderItem,
    Product,
    ProductEmbedding,
    ProductView,
    Review,
    User,
)
from app.schemas import ProductListOut, ProductOut, ReviewCreate, ReviewOut
from app.services import recommendation

router = APIRouter(prefix="/products", tags=["products"])


def _to_product_out(
    product: Product, avg_rating: float | None = None, review_count: int = 0
) -> ProductOut:
    out = ProductOut.model_validate(product)
    return out.model_copy(update={"avg_rating": avg_rating, "review_count": review_count})


def _rating_stats(db: Session, product_id: int) -> tuple[float | None, int]:
    avg_rating, review_count = db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(
            Review.product_id == product_id
        )
    ).one()
    return (float(avg_rating) if avg_rating is not None else None, review_count or 0)


@router.get("", response_model=ProductListOut)
def list_products(
    search: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    sort: str | None = Query(default=None),
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=100),
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ProductListOut:
    conditions = [Product.status.in_(LISTED_STATUSES)]
    if search:
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
        # おすすめ順。ログインユーザーはプロフィールベクトルとのコサイン近傍で並べ替え、
        # プロフィールが作れない場合（未ログイン・行動ゼロ・埋め込み欠損）は人気順に落とす。
        # 一覧なので購入済み商品も除外せず、並び順だけを変える（レコメンド枠の候補抽出とは
        # 目的が違い、ここでは「品揃え全体を好みに寄せて見せる」ため除外しない）。
        # 既知の制約: プロフィールはリクエスト毎に再計算され、時間減衰でベクトルが
        # わずかに動くため、ページ間で近接タイの商品が重複/欠落し得る。厳密な整合には
        # プロフィールの短期キャッシュが要るが、サンプル規模では許容する。
        profile = (
            recommendation.build_profile(db, current_user.id) if current_user else None
        )
        if profile is not None:
            stmt = stmt.outerjoin(
                ProductEmbedding, ProductEmbedding.product_id == Product.id
            ).order_by(
                ProductEmbedding.embedding.cosine_distance(
                    profile.profile_vec.tolist()
                ).nullslast(),
                Product.id,
            )
        else:
            # 人気順フォールバック（get_popular_products と同じ思想）。購入数 subquery は
            # この分岐でしか使わないためここで組む。注文数 desc → 平均評価 desc → 新着 desc。
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
    else:
        stmt = stmt.order_by(Product.id)

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    rows = db.execute(stmt).all()

    items = [
        _to_product_out(
            product,
            float(avg_rating) if avg_rating is not None else None,
            review_count or 0,
        )
        for product, avg_rating, review_count in rows
    ]

    return ProductListOut(items=items, total=total)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)) -> ProductOut:
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    avg_rating, review_count = _rating_stats(db, product_id)
    return _to_product_out(product, avg_rating, review_count)


@router.post("/{product_id}/view", status_code=status.HTTP_204_NO_CONTENT)
def record_product_view(
    product_id: int,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> None:
    """商品閲覧を記録する（パーソナライズのシグナル収集）。

    ゲスト（未ログイン）は履歴を持たないので何もせず 204 を返す。閲覧記録は
    ProductView に 1 ユーザー × 1 商品で 1 行だけ持ち、再閲覧時は viewed_at 更新 +
    view_count インクリメントで upsert する。並行初回閲覧で発生する一意制約違反は
    on_conflict_do_update で素直に吸収する（IntegrityError を握りつぶすより明快）。
    """
    if current_user is None:
        return None

    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    stmt = (
        pg_insert(ProductView)
        .values(user_id=current_user.id, product_id=product_id)
        .on_conflict_do_update(
            constraint="uq_product_view_user_product",
            set_={
                "viewed_at": func.now(),
                "view_count": ProductView.view_count + 1,
            },
        )
    )
    db.execute(stmt)
    db.commit()
    return None


@router.get("/{product_id}/related", response_model=list[ProductOut])
def list_related_products(product_id: int, db: Session = Depends(get_db)) -> list[ProductOut]:
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if product.category_id is None:
        return []

    related = (
        db.query(Product)
        .filter(
            Product.category_id == product.category_id,
            Product.id != product_id,
            Product.status.in_(LISTED_STATUSES),
        )
        .order_by(Product.id)
        .limit(4)
        .all()
    )
    return [_to_product_out(p, *_rating_stats(db, p.id)) for p in related]


@router.get("/{product_id}/recommendations", response_model=list[ProductOut])
def list_product_recommendations(
    product_id: int,
    limit: int = Query(default=4, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[ProductOut]:
    """商品ページ用の関連おすすめ（LLM 不使用・同期）。

    対象商品の埋め込みの pgvector コサイン近傍を返す（自分自身除外・LISTED のみ）。
    埋め込み未生成なら既存 /related と同じ同カテゴリフォールバックに落とす。
    """
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    target_emb = db.get(ProductEmbedding, product_id)
    if target_emb is not None:
        stmt = (
            select(Product)
            .join(ProductEmbedding, ProductEmbedding.product_id == Product.id)
            .where(
                Product.status.in_(LISTED_STATUSES),
                Product.id != product_id,
            )
            .order_by(ProductEmbedding.embedding.cosine_distance(target_emb.embedding))
            .limit(limit)
        )
        neighbors = list(db.execute(stmt).scalars().all())
        if neighbors:
            return [_to_product_out(p, *_rating_stats(db, p.id)) for p in neighbors]

    # 埋め込みが無い（または近傍ゼロ）→ /related と同じ同カテゴリフォールバック。
    if product.category_id is None:
        return []
    related = (
        db.query(Product)
        .filter(
            Product.category_id == product.category_id,
            Product.id != product_id,
            Product.status.in_(LISTED_STATUSES),
        )
        .order_by(Product.id)
        .limit(limit)
        .all()
    )
    return [_to_product_out(p, *_rating_stats(db, p.id)) for p in related]


@router.get("/{product_id}/reviews", response_model=list[ReviewOut])
def list_reviews(product_id: int, db: Session = Depends(get_db)) -> list[ReviewOut]:
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    rows = (
        db.query(Review, User.name)
        .join(User, Review.user_id == User.id)
        .filter(Review.product_id == product_id)
        .order_by(Review.created_at.desc(), Review.id.desc())
        .all()
    )
    return [
        ReviewOut(
            id=review.id,
            product_id=review.product_id,
            user_id=review.user_id,
            user_name=user_name,
            rating=review.rating,
            comment=review.comment,
            created_at=review.created_at,
        )
        for review, user_name in rows
    ]


@router.post("/{product_id}/reviews", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
def create_review(
    product_id: int,
    payload: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReviewOut:
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    purchased = (
        db.query(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .filter(
            Order.user_id == current_user.id,
            Order.status != "cancelled",
            OrderItem.product_id == product_id,
        )
        .first()
    )
    if purchased is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Purchase required to review"
        )

    existing = (
        db.query(Review)
        .filter(Review.user_id == current_user.id, Review.product_id == product_id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already reviewed")

    review = Review(
        product_id=product_id,
        user_id=current_user.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    return ReviewOut(
        id=review.id,
        product_id=review.product_id,
        user_id=review.user_id,
        user_name=current_user.name,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )
