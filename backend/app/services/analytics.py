"""行動イベントの記録。

クライアントからのバッチ受信（/api/events）と、サーバー側から直接記録する経路
（注文確定など）の両方をここに集約する。

イベントは実験に紐づけずそのまま貯める。実験の集計は experiment_report.py が
曝露テーブルと JOIN して行う。この分離のおかげで、実験を始める前から貯まっている
ログに対しても、あとから思いついた指標で分析できる。
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import AnalyticsEvent
from app.schemas import AnalyticsEventIn

logger = logging.getLogger(__name__)

# 予約イベント名。フロント・バックエンドの双方から参照する共通の指標名。
# 任意の名前も記録できるが、主要指標はここに定義してブレを防ぐ。
EVENT_PAGE_VIEW = "page_view"
EVENT_CLICK = "click"
EVENT_IMPRESSION = "impression"
EVENT_ADD_TO_CART = "add_to_cart"
EVENT_BEGIN_CHECKOUT = "begin_checkout"
# 購入。value に注文金額を入れるので、CV数と売上をこの 1 種類だけで集計できる。
EVENT_PURCHASE = "purchase"

# 既定のファネル。管理画面の結果表示で各段の到達率を枝ごとに比較する。
DEFAULT_FUNNEL = (
    EVENT_PAGE_VIEW,
    EVENT_ADD_TO_CART,
    EVENT_BEGIN_CHECKOUT,
    EVENT_PURCHASE,
)

# 端末時計のずれの許容範囲。これを超える occurred_at は信用せず受信時刻で置き換える。
# 狂った時計の端末が曝露より前の時刻を送ってくると、成果が集計から丸ごと漏れるため。
MAX_CLOCK_SKEW = timedelta(hours=1)


def _normalize_occurred_at(value: datetime | None, now: datetime) -> datetime:
    """クライアント申告の発生時刻を検証して返す。異常値は受信時刻に丸める。"""
    if value is None:
        return now
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    if abs(value - now) > MAX_CLOCK_SKEW:
        return now
    return value


def record_events(
    db: Session,
    visitor_id: str,
    user_id: int | None,
    events: list[AnalyticsEventIn],
) -> int:
    """クライアントから届いたイベントをまとめて保存する。保存件数を返す。"""
    now = datetime.now(timezone.utc)
    rows = [
        AnalyticsEvent(
            visitor_id=visitor_id,
            user_id=user_id,
            session_id=event.session_id,
            name=event.name,
            path=event.path,
            element_key=event.element_key,
            value=event.value,
            props=event.props,
            occurred_at=_normalize_occurred_at(event.occurred_at, now),
        )
        for event in events
    ]
    db.add_all(rows)
    db.commit()
    return len(rows)


def record_server_event(
    db: Session,
    *,
    visitor_id: str,
    name: str,
    user_id: int | None = None,
    path: str | None = None,
    element_key: str | None = None,
    value: float | None = None,
    props: dict | None = None,
) -> None:
    """サーバー側で確定した事実をイベントとして記録する。

    注文のようにフロントの呼び出しに依存させたくない指標で使う（離脱・通信断・
    計測の付け忘れで成果が欠けると、実験の結論そのものが歪むため）。

    記録の失敗が本体処理（注文など）に波及しないよう、例外は握って警告ログにする。
    呼び出し側は本体のコミットが完了してからこれを呼ぶこと。
    """
    try:
        db.add(
            AnalyticsEvent(
                visitor_id=visitor_id,
                user_id=user_id,
                session_id=None,
                name=name,
                path=path,
                element_key=element_key,
                value=value,
                props=props,
                occurred_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001 - 計測の失敗で本体処理を壊さない
        db.rollback()
        logger.warning("イベント記録に失敗しました (name=%s): %s", name, exc)
