from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import PasswordUpdate, Token, UserLogin, UserOut, UserRegister, UserUpdate
from app.services import account as account_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> User:
    return account_service.register(db, payload)


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> Token:
    return account_service.login(db, payload)


@router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    return account_service.update_profile(db, current_user, payload)


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def update_password(
    payload: PasswordUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    account_service.change_password(db, current_user, payload)
    return None
