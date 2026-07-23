"""行動イベントの受信 API（公開）。

フロントはイベントを都度送らずキューに溜め、一定件数・一定間隔・離脱時にまとめて
ここへ POST する。1 クリックごとにリクエストを飛ばすと通信が増えて描画を邪魔するため。
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional, get_visitor_id
from app.database import get_db
from app.models import User
from app.schemas import AnalyticsEventBatchIn
from app.services import analytics

router = APIRouter(prefix="/events", tags=["analytics"])


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
def collect_events(
    payload: AnalyticsEventBatchIn,
    visitor_id: str | None = Depends(get_visitor_id),
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> None:
    """イベントをまとめて記録する。

    visitor_id が無い（ヘッダ未送信・形式不正）リクエストは、誰の行動か特定できず
    分析にも実験にも使えないため黙って捨てる。計測の失敗で画面を止めたくないので
    エラーにはしない。
    """
    if visitor_id is None:
        return None
    analytics.record_events(
        db,
        visitor_id=visitor_id,
        user_id=current_user.id if current_user else None,
        events=payload.events,
    )
    return None
