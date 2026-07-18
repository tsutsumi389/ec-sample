from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Order, User
from app.schemas import OrderCreate, OrderDetailOut, OrderSummaryOut
from app.services import order as order_service

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderDetailOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Order:
    return order_service.create(db, current_user.id, payload)


@router.get("", response_model=list[OrderSummaryOut])
def list_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Order]:
    return order_service.list_for_user(db, current_user.id)


@router.get("/{order_id}", response_model=OrderDetailOut)
def get_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Order:
    return order_service.get_for_user(db, order_id, current_user.id)


@router.post("/{order_id}/cancel", response_model=OrderDetailOut)
def cancel_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Order:
    return order_service.cancel(db, order_id, current_user.id)
