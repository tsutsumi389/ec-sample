from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_admin
from app.database import get_db
from app.models import Category, Coupon, Order, Product, User
from app.schemas import (
    AdminOrderOut,
    AdminUserOut,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    CouponCreate,
    CouponOut,
    CouponUpdate,
    OrderStatusUpdate,
    ProductCreate,
    ProductOut,
    ProductUpdate,
)
from app.services import admin as admin_service
from app.services import category as category_service
from app.services import coupon as coupon_service

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


# ---------- Products ----------


@router.get("/products", response_model=list[ProductOut])
def list_all_products(db: Session = Depends(get_db)) -> list[Product]:
    return admin_service.list_all_products(db)


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Product:
    product = admin_service.create_product(db, payload)
    # 埋め込み更新は本体処理と切り離して非同期実行（失敗しても作成は成立済み）。
    background_tasks.add_task(admin_service.refresh_embedding_task, product.id)
    return product


@router.put("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Product:
    product = admin_service.update_product(db, product_id, payload)
    # 商品テキストが変わった可能性があるので埋め込みを非同期で更新する。
    background_tasks.add_task(admin_service.refresh_embedding_task, product.id)
    return product


@router.delete("/products/{product_id}", response_model=ProductOut)
def delete_product(product_id: int, db: Session = Depends(get_db)) -> Product:
    return admin_service.delete_product(db, product_id)


# ---------- Recommendations ----------


@router.post("/recommendations/rebuild", status_code=202)
def rebuild_recommendations(background_tasks: BackgroundTasks) -> dict[str, str]:
    """全商品の埋め込み + セマンティックID を再構築する（重い処理なので即 202 を返す）。"""
    background_tasks.add_task(admin_service.rebuild_embeddings_task)
    return {"status": "started"}


# ---------- Orders ----------


@router.get("/orders", response_model=list[AdminOrderOut])
def list_all_orders(db: Session = Depends(get_db)) -> list[Order]:
    return admin_service.list_all_orders(db)


@router.put("/orders/{order_id}/status", response_model=AdminOrderOut)
def update_order_status(
    order_id: int, payload: OrderStatusUpdate, db: Session = Depends(get_db)
) -> Order:
    return admin_service.update_order_status(db, order_id, payload.status)


# ---------- Users ----------


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return admin_service.list_users(db)


# ---------- Categories ----------


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)) -> list[Category]:
    return category_service.list_all(db)


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)) -> Category:
    return category_service.create(db, payload)


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db)
) -> Category:
    return category_service.update(db, category_id, payload)


@router.delete("/categories/{category_id}", response_model=CategoryOut)
def delete_category(category_id: int, db: Session = Depends(get_db)) -> CategoryOut:
    return category_service.delete(db, category_id)


# ---------- Coupons ----------


@router.get("/coupons", response_model=list[CouponOut])
def list_coupons(db: Session = Depends(get_db)) -> list[Coupon]:
    return coupon_service.list_all(db)


@router.post("/coupons", response_model=CouponOut, status_code=201)
def create_coupon(payload: CouponCreate, db: Session = Depends(get_db)) -> Coupon:
    return coupon_service.create(db, payload)


@router.put("/coupons/{coupon_id}", response_model=CouponOut)
def update_coupon(coupon_id: int, payload: CouponUpdate, db: Session = Depends(get_db)) -> Coupon:
    return coupon_service.update(db, coupon_id, payload)


@router.delete("/coupons/{coupon_id}", response_model=CouponOut)
def delete_coupon(coupon_id: int, db: Session = Depends(get_db)) -> CouponOut:
    return coupon_service.delete(db, coupon_id)
