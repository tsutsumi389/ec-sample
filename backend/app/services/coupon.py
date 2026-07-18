"""クーポンのアプリケーションサービス（適用判定 + 検証 API + 管理 CRUD）。

evaluate / get_by_code は注文サービス（order）からも再利用される。従来 routers/coupons.py に
あった純粋な判定ロジックをここへ移し、router 間依存（orders → coupons）を解消する。
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models import Coupon
from app.repositories import coupon as coupon_repo
from app.schemas import (
    CouponCreate,
    CouponOut,
    CouponUpdate,
    CouponValidateResponse,
)


def get_by_code(db: Session, code: str) -> Coupon | None:
    return coupon_repo.get_by_code(db, code)


def _compute_discount(coupon: Coupon, subtotal: int) -> int:
    if coupon.discount_type == "percent":
        amount = subtotal * coupon.discount_value // 100
    else:
        amount = coupon.discount_value
    return min(amount, subtotal)


def evaluate(coupon: Coupon | None, subtotal: int) -> tuple[bool, int, str]:
    """(valid, discount_amount, message) を返す純粋関数。"""
    if coupon is None or not coupon.is_active:
        return False, 0, "Invalid coupon code"

    if coupon.expires_at is not None and coupon.expires_at < datetime.now(timezone.utc):
        return False, 0, "Coupon has expired"

    if subtotal < coupon.min_order_amount:
        return False, 0, f"Minimum order amount is {coupon.min_order_amount}"

    return True, _compute_discount(coupon, subtotal), "Coupon applied"


def validate(db: Session, code: str, subtotal: int) -> CouponValidateResponse:
    coupon = get_by_code(db, code)
    valid, discount_amount, message = evaluate(coupon, subtotal)
    return CouponValidateResponse(
        valid=valid, discount_amount=discount_amount, message=message
    )


# ---------- 管理 CRUD ----------


def list_all(db: Session) -> list[Coupon]:
    return coupon_repo.list_all(db)


def create(db: Session, payload: CouponCreate) -> Coupon:
    if coupon_repo.code_exists(db, payload.code):
        raise ConflictError("Coupon code already exists")

    coupon = Coupon(**payload.model_dump())
    coupon_repo.add(db, coupon)
    db.commit()
    db.refresh(coupon)
    return coupon


def update(db: Session, coupon_id: int, payload: CouponUpdate) -> Coupon:
    coupon = coupon_repo.get(db, coupon_id)
    if coupon is None:
        raise NotFoundError("Coupon not found")

    data = payload.model_dump(exclude_unset=True)
    if "code" in data and coupon_repo.code_exists(
        db, data["code"], exclude_id=coupon_id
    ):
        raise ConflictError("Coupon code already exists")

    for field, value in data.items():
        setattr(coupon, field, value)

    db.commit()
    db.refresh(coupon)
    return coupon


def delete(db: Session, coupon_id: int):
    coupon = coupon_repo.get(db, coupon_id)
    if coupon is None:
        raise NotFoundError("Coupon not found")

    # 削除後は ORM が無効化されるため、レスポンス用に削除前のスナップショットを取る。
    result = CouponOut.model_validate(coupon)
    coupon_repo.delete(db, coupon)
    db.commit()
    return result
