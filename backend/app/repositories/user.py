"""User のデータアクセス。

Repository 層はセッションを受け取ってクエリを実行し ORM を返すだけに徹する。
コミット（トランザクション境界）は呼び出し側の Service が握る。
"""

from sqlalchemy.orm import Session

from app.models import User


def get(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def list_all(db: Session) -> list[User]:
    return db.query(User).order_by(User.id).all()


def add(db: Session, user: User) -> User:
    db.add(user)
    return user
