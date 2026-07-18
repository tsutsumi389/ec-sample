"""アカウント（登録・ログイン・プロフィール・パスワード）のアプリケーションサービス。

パスワードハッシュ・JWT 発行の低レベル処理は app.auth のユーティリティに委譲し、
ここは業務フロー（重複チェック・資格情報照合・全セッション失効）を組み立てる。
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.auth import create_access_token, hash_password, verify_password
from app.core.exceptions import BusinessRuleError, ConflictError, UnauthorizedError
from app.models import User
from app.repositories import user as user_repo
from app.schemas import PasswordUpdate, Token, UserLogin, UserRegister, UserUpdate


def register(db: Session, payload: UserRegister) -> User:
    if user_repo.get_by_email(db, payload.email) is not None:
        raise ConflictError("Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        name=payload.name,
        role="user",
    )
    user_repo.add(db, user)
    db.commit()
    db.refresh(user)
    return user


def login(db: Session, payload: UserLogin) -> Token:
    user = user_repo.get_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise UnauthorizedError("Incorrect email or password")

    access_token = create_access_token(user.id)
    return Token(access_token=access_token, token_type="bearer")


def update_profile(db: Session, user: User, payload: UserUpdate) -> User:
    user.name = payload.name
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, payload: PasswordUpdate) -> None:
    if not verify_password(payload.current_password, user.hashed_password):
        raise BusinessRuleError("Current password is incorrect")

    user.hashed_password = hash_password(payload.new_password)
    # 変更以前に発行済みの JWT を失効させる（get_current_user が iat と照合する）。
    # JWT の iat は秒精度のため、変更時刻も秒に丸めて、変更直後の再ログインで得た
    # 新トークン（同一秒の iat）が失効扱いになるのを防ぐ。
    user.password_changed_at = datetime.now(timezone.utc).replace(microsecond=0)
    db.commit()
