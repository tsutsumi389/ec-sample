"""レコメンド API（ホームのおすすめ一覧）。

ログイン時は LLM 生成キャッシュがあれば rank 順で返し、無ければ人気順フォールバックを
即返しつつ BackgroundTasks で LLM 生成を起動する。未ログイン時は人気順のみ。
Ollama が使えない・埋め込みが空でも常にフォールバックで応答する。
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional
from app.database import SessionLocal, get_db
from app.models import (
    LISTED_STATUSES,
    Product,
    RecommendationState,
    User,
    UserRecommendation,
)
from app.routers.products import _rating_stats, _to_product_out
from app.schemas import RecommendationItemOut, RecommendationListOut
from app.services import recommendation

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

# 生成中とみなす猶予。この時間内に generating なら二重起動しない。
_GENERATING_TTL = timedelta(minutes=10)


def _item_out(product: Product, db: Session, reason: str | None) -> RecommendationItemOut:
    avg_rating, review_count = _rating_stats(db, product.id)
    return RecommendationItemOut(
        product=_to_product_out(product, avg_rating, review_count),
        reason=reason,
    )


def _fallback(db: Session, limit: int, exclude_ids: set[int] | None) -> RecommendationListOut:
    products = recommendation.get_popular_products(db, limit, exclude_ids=exclude_ids)
    items = [_item_out(p, db, None) for p in products]
    return RecommendationListOut(source="fallback", items=items)


@router.get("/home", response_model=RecommendationListOut)
def home_recommendations(
    background_tasks: BackgroundTasks,
    limit: int = Query(default=8, ge=1, le=50),
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> RecommendationListOut:
    # 未ログイン: 人気順フォールバックのみ（生成はしない）。
    if current_user is None:
        return _fallback(db, limit, exclude_ids=None)

    user_id = current_user.id
    exclude_ids = recommendation.get_exclude_ids(db, user_id)
    profile = recommendation.build_profile(db, user_id)
    state = db.get(RecommendationState, user_id)

    # キャッシュ利用可否: state=ready かつ profile_hash が現在の行動ハッシュと一致。
    if (
        profile is not None
        and state is not None
        and state.status == "ready"
        and state.profile_hash == profile.profile_hash
    ):
        rows = (
            db.query(UserRecommendation)
            .filter(UserRecommendation.user_id == user_id)
            .order_by(UserRecommendation.rank, UserRecommendation.id)
            .all()
        )
        items: list[RecommendationItemOut] = []
        for row in rows:
            product = row.product
            # 返却時にも可視性を再確認（生成後に status が変わった商品を弾く）。
            if product is None or product.status not in LISTED_STATUSES:
                continue
            items.append(_item_out(product, db, row.reason))
            if len(items) >= limit:
                break
        if items:
            return RecommendationListOut(source="llm", items=items)
        # キャッシュが全滅（全部非表示化）なら人気順に落とす。

    # ここから: キャッシュ無し/陳腐化。人気順フォールバックを即返し、必要なら生成起動。
    # プロフィールが作れない（行動なし/埋め込み欠損）なら生成しても失敗するだけなので起動しない。
    if profile is not None and _should_generate(state):
        _schedule_generation(db, background_tasks, user_id, profile.profile_hash)

    return _fallback(db, limit, exclude_ids=exclude_ids)


def _schedule_generation(
    db: Session,
    background_tasks: BackgroundTasks,
    user_id: int,
    profile_hash: str,
) -> None:
    """多重起動を防ぎつつ LLM 生成タスクを起動する。

    BackgroundTasks はレスポンス返却後に走るため、generating がコミットされる前に
    届いた同一ユーザの並行リクエストが二重に生成をスケジュールし得る。PostgreSQL の
    advisory ロックで同一ユーザのスケジューリングを直列化し、ロック下で state を
    読み直して generating を同期確定させることで TOCTOU 競合と重複生成を防ぐ。
    ロックが取れない（＝他リクエストが処理中）ならスキップする。
    """
    got_lock = db.execute(
        text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": user_id}
    ).scalar()
    if not got_lock:
        return
    # ロック取得後に最新の state を読み直す（identity map の古い値ではなく DB の確定値）。
    state = db.get(RecommendationState, user_id, populate_existing=True)
    if not _should_generate(state):
        return
    # レスポンス返却前に generating を同期確定させ、後続リクエストの二重起動を防ぐ。
    recommendation.mark_generating(db, user_id, profile_hash)
    background_tasks.add_task(recommendation.generate_for_user, SessionLocal, user_id)


def _should_generate(state: RecommendationState | None) -> bool:
    """多重起動防止＋失敗クールダウン。

    generating（生成中）と failed（直近失敗）は、状態更新時刻から一定時間内なら
    再起動しない。これにより並行リクエストの二重起動と、Ollama 障害時にホーム表示の
    たびに失敗する生成を再スケジュールし続ける空回りの両方を防ぐ。
    """
    if state is None:
        return True
    if state.status not in ("generating", "failed"):
        return True
    # 状態が最後に更新された時刻を基準に「新しさ」を判断する。
    marker = state.updated_at or state.generated_at
    if marker is None:
        return True
    if marker.tzinfo is None:
        marker = marker.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - marker > _GENERATING_TTL
