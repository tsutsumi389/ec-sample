from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Coupon, User
from app.schemas import CouponValidateRequest, CouponValidateResponse

router = APIRouter(prefix="/coupons", tags=["coupons"])


def get_coupon_by_code(db: Session, code: str) -> Coupon | None:
    return db.query(Coupon).filter(Coupon.code == code).first()


def _compute_discount(coupon: Coupon, subtotal: int) -> int:
    if coupon.discount_type == "percent":
        amount = subtotal * coupon.discount_value // 100
    else:
        amount = coupon.discount_value
    return min(amount, subtotal)


def evaluate_coupon(coupon: Coupon | None, subtotal: int) -> tuple[bool, int, str]:
    """Return (valid, discount_amount, message) for the given coupon and subtotal."""
    if coupon is None or not coupon.is_active:
        return False, 0, "Invalid coupon code"

    if coupon.expires_at is not None and coupon.expires_at < datetime.now(timezone.utc):
        return False, 0, "Coupon has expired"

    if subtotal < coupon.min_order_amount:
        return False, 0, f"Minimum order amount is {coupon.min_order_amount}"

    return True, _compute_discount(coupon, subtotal), "Coupon applied"


@router.post("/validate", response_model=CouponValidateResponse)
def validate_coupon(
    payload: CouponValidateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CouponValidateResponse:
    coupon = get_coupon_by_code(db, payload.code)
    valid, discount_amount, message = evaluate_coupon(coupon, payload.subtotal)
    return CouponValidateResponse(valid=valid, discount_amount=discount_amount, message=message)
