from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_current_user_optional
from app.database import get_db
from app.models import User
from app.schemas import ProductListOut, ProductOut, ReviewCreate, ReviewOut, SuggestOut
from app.services import product as product_service

router = APIRouter(prefix="/products", tags=["products"])


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
    return product_service.list_products(
        db,
        search=search,
        category_id=category_id,
        sort=sort,
        min_price=min_price,
        max_price=max_price,
        page=page,
        limit=limit,
        current_user=current_user,
    )


@router.get("/suggest", response_model=SuggestOut)
def suggest_products(
    q: str = Query(default=""),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
) -> SuggestOut:
    """検索サジェスト（キーワード候補）。

    ルート順の都合で /{product_id} より前に定義する（"suggest" が int パスに
    マッチして 422 になるのを避けるため）。
    """
    return product_service.suggest(db, q, limit)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)) -> ProductOut:
    return product_service.get_product(db, product_id)


@router.post("/{product_id}/view", status_code=status.HTTP_204_NO_CONTENT)
def record_product_view(
    product_id: int,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> None:
    product_service.record_view(db, current_user, product_id)
    return None


@router.get("/{product_id}/related", response_model=list[ProductOut])
def list_related_products(
    product_id: int, db: Session = Depends(get_db)
) -> list[ProductOut]:
    return product_service.list_related(db, product_id)


@router.get("/{product_id}/recommendations", response_model=list[ProductOut])
def list_product_recommendations(
    product_id: int,
    limit: int = Query(default=4, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[ProductOut]:
    return product_service.list_recommendations(db, product_id, limit)


@router.get("/{product_id}/reviews", response_model=list[ReviewOut])
def list_reviews(product_id: int, db: Session = Depends(get_db)) -> list[ReviewOut]:
    return product_service.list_reviews(db, product_id)


@router.post(
    "/{product_id}/reviews",
    response_model=ReviewOut,
    status_code=status.HTTP_201_CREATED,
)
def create_review(
    product_id: int,
    payload: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReviewOut:
    return product_service.create_review(db, current_user, product_id, payload)
