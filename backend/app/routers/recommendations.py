"""レコメンド API（ホームのおすすめ一覧）。

キャッシュ利用可否の判定・生成起動・人気順フォールバックはすべて
services.recommendation.get_home_recommendations に集約し、ここは HTTP 境界だけを持つ。
生成起動の多重防止（advisory ロック + state 判定）も /home（routers/home.py）と共有する。
"""

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional
from app.database import SessionLocal, get_db
from app.models import User
from app.schemas import RecommendationListOut
from app.services import recommendation

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("/home", response_model=RecommendationListOut)
def home_recommendations(
    background_tasks: BackgroundTasks,
    limit: int = Query(default=8, ge=1, le=50),
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> RecommendationListOut:
    return recommendation.get_home_recommendations(
        db, background_tasks, SessionLocal, current_user, limit
    )
