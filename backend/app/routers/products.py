from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Order, OrderItem, Product, Review, User
from app.schemas import ProductListOut, ProductOut, ReviewCreate, ReviewOut

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
    db: Session = Depends(get_db),
) -> ProductListOut:
    conditions = [Product.is_active.is_(True)]
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
    if product is None or not product.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    avg_rating, review_count = _rating_stats(db, product_id)
    return _to_product_out(product, avg_rating, review_count)


@router.get("/{product_id}/related", response_model=list[ProductOut])
def list_related_products(product_id: int, db: Session = Depends(get_db)) -> list[ProductOut]:
    product = db.get(Product, product_id)
    if product is None or not product.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if product.category_id is None:
        return []

    related = (
        db.query(Product)
        .filter(
            Product.category_id == product.category_id,
            Product.id != product_id,
            Product.is_active.is_(True),
        )
        .order_by(Product.id)
        .limit(4)
        .all()
    )
    return [_to_product_out(p, *_rating_stats(db, p.id)) for p in related]


@router.get("/{product_id}/reviews", response_model=list[ReviewOut])
def list_reviews(product_id: int, db: Session = Depends(get_db)) -> list[ReviewOut]:
    product = db.get(Product, product_id)
    if product is None or not product.is_active:
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
    if product is None or not product.is_active:
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
