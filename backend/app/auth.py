import os
import re
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# HS256 は対称鍵。検証鍵と署名鍵が同一なので、鍵を知ることは「管理者トークンを発行できる」
# ことと同義になる。既定値へのフォールバックを置くと、リポジトリを見た誰でも sub=1（シードの
# 管理者）のトークンを偽造でき、しかもパスワード変更では締め出せない——失効判定
# (_resolve_user_from_token) は iat と password_changed_at の比較であり、iat は発行側が
# 選べるため。よって未設定・弱い鍵では **起動させない**（fail closed）。
_MIN_SECRET_LENGTH = 32
# 過去に配布された既定値と、ありがちな仮置き。前方一致で弾く。
_WEAK_SECRET_PREFIXES = ("dev-secret", "changeme", "change-me", "secret", "test", "password")
_SECRET_KEY_HELP = "`make secret` で .env に生成できます（起動時は make up が自動で作ります）"


def _load_secret_key() -> str:
    secret = os.environ.get("SECRET_KEY", "").strip()
    if not secret:
        raise RuntimeError(f"SECRET_KEY が未設定です。{_SECRET_KEY_HELP}")
    if len(secret) < _MIN_SECRET_LENGTH:
        raise RuntimeError(
            f"SECRET_KEY が短すぎます（{len(secret)} 文字 / 最低 {_MIN_SECRET_LENGTH} 文字）。"
            f"{_SECRET_KEY_HELP}"
        )
    if secret.lower().startswith(_WEAK_SECRET_PREFIXES):
        raise RuntimeError(f"SECRET_KEY が既知の弱い値です。{_SECRET_KEY_HELP}")
    return secret


SECRET_KEY = _load_secret_key()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()
# 任意認証用。Authorization ヘッダが無くても 401 を投げずに None を返させる。
optional_bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        # create_access_token は3つとも必ず載せる。require で必須化しておくと、
        # クレームを削ったトークンが下流の None チェック頼みにならずここで落ちる。
        return jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def _resolve_user_from_token(token: str, db: Session) -> User:
    """JWT を検証して対応する User を返す。無効なら 401 を投げる共通ロジック。"""
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.get(User, int(user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # パスワード変更後に発行された（＝変更時刻以降の iat を持つ）トークンのみ有効とする。
    # 変更以前のトークンは失効させ、パスワード変更で全セッションを無効化できるようにする。
    if user.password_changed_at is not None:
        iat = payload.get("iat")
        if iat is None or datetime.fromtimestamp(iat, tz=timezone.utc) < user.password_changed_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    return _resolve_user_from_token(credentials.credentials, db)


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """任意認証。Authorization ヘッダが無ければ None、あっても無効/期限切れなら None（匿名扱い）。"""
    if credentials is None:
        return None
    try:
        return _resolve_user_from_token(credentials.credentials, db)
    except HTTPException:
        # 期限切れ・失効・削除済みトークンでも 401 を投げず匿名として扱う。
        # 任意認証エンドポイント（/recommendations/home 等）がフォールバック応答を
        # 返し続けられるようにするため（暗黙ログアウトやセクション消失を防ぐ）。
        return None


# 端末ごとの匿名識別子を運ぶヘッダ。フロントが localStorage の UUID を全リクエストに付ける。
VISITOR_ID_HEADER = "X-Visitor-Id"
# 想定するのは UUID。任意文字列を通すと分析データを汚染されるため文字種と長さを絞る。
_VISITOR_ID_PATTERN = re.compile(r"^[0-9a-zA-Z-]{8,64}$")


def get_visitor_id(
    x_visitor_id: str | None = Header(default=None, alias=VISITOR_ID_HEADER),
) -> str | None:
    """A/Bテストの割り当て単位・行動ログの識別子。無効／未指定なら None。

    ログイン前でも一貫した識別が必要なため user_id ではなくこちらを単位にする
    （EC ではカート投入までの大半が未ログインで、user_id 単位にするとその区間の
    効果が丸ごと測れなくなる）。認証には一切使わない、あくまで計測用の識別子。
    """
    if x_visitor_id is None:
        return None
    candidate = x_visitor_id.strip()
    if not _VISITOR_ID_PATTERN.match(candidate):
        return None
    return candidate


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user
