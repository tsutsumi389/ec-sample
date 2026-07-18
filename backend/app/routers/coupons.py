from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import CouponValidateRequest, CouponValidateResponse
from app.services import coupon as coupon_service

router = APIRouter(prefix="/coupons", tags=["coupons"])


@router.post("/validate", response_model=CouponValidateResponse)
def validate_coupon(
    payload: CouponValidateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CouponValidateResponse:
    return coupon_service.validate(db, payload.code, payload.subtotal)
