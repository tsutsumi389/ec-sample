from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product
from app.schemas import ProductListOut, ProductOut

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=ProductListOut)
def list_products(
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=100),
    db: Session = Depends(get_db),
) -> ProductListOut:
    conditions = [Product.is_active.is_(True)]
    if search:
        conditions.append(Product.name.ilike(f"%{search}%"))

    total = db.scalar(select(func.count()).select_from(Product).where(*conditions)) or 0

    stmt = (
        select(Product)
        .where(*conditions)
        .order_by(Product.id)
        .offset((page - 1) * limit)
        .limit(limit)
    )
    items = db.execute(stmt).scalars().all()

    return ProductListOut(items=[ProductOut.model_validate(p) for p in items], total=total)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)) -> Product:
    product = db.get(Product, product_id)
    if product is None or not product.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product
