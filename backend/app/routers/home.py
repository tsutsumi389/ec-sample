"""ホーム画面 API（Netflix 型のレーン構成）。

レーンの組み立て（1 レーン = 1 アルゴリズム、stage-wise 貪欲法）はすべて
services/home_page.py に置き、ここは HTTP 境界の責務だけを持つ:
クエリパラメータの解釈 → 文脈構築 → ページ構築 → スキーマ変換。

多層フォールバック: pgvector 不在・Ollama 停止・埋め込み 0 件・プロフィール構築不能の
いずれでも 200 を返す（例外は home_page 側の _safe / _safe_build で吸収される）。
"""

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional
from app.core.presenters import to_product_out
from app.database import SessionLocal, get_db
from app.models import User
from app.repositories import review as review_repo
from app.schemas import HomeOut, HomeSectionOut, RecommendationItemOut
from app.services import home_page, recommendation

router = APIRouter(prefix="/home", tags=["home"])


def _parse_recently_viewed_ids(raw: str | None) -> list[int]:
    """"12,7,3" 形式を商品ID列に解釈する。

    パース不能な要素は黙って無視する（400 にしない）。この値は localStorage 由来で
    ユーザーが直せるものではないため、壊れた 1 要素でホームが 500/400 になるより
    「その要素だけ落として表示する」ほうが正しい。重複は先勝ちで除去し、契約どおり
    先頭 10 件までを採用する。
    """
    if not raw:
        return []
    ids: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            pid = int(part)
        except ValueError:
            continue
        if pid > 0 and pid not in ids:
            ids.append(pid)
    return ids[:home_page._MAX_RECENTLY_VIEWED_IDS]


@router.get("", response_model=HomeOut)
def get_home(
    background_tasks: BackgroundTasks,
    recently_viewed_ids: str | None = Query(default=None),
    max_lanes: int = Query(default=8, ge=1, le=12),
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> HomeOut:
    viewed_ids = _parse_recently_viewed_ids(recently_viewed_ids)
    user_id = current_user.id if current_user is not None else None

    # プロフィールはここで 1 回だけ構築され、全ビルダーで使い回される（性能上の要）。
    ctx = home_page.build_context(db, user_id, viewed_ids)

    # LLM キャッシュが陳腐化していれば再生成を起動する（/api/recommendations/home と同流儀。
    # レスポンスはブロックせず、今回は人気順などのフォールバックレーンで組む）。
    if user_id is not None and ctx.needs_generation and ctx.profile is not None:
        recommendation.schedule_generation(
            db, background_tasks, SessionLocal, user_id, ctx.profile.profile_hash
        )

    lanes, source = home_page.build_page(ctx, max_lanes)

    # レーティングはページ確定後に、載る商品ぶんだけまとめて引く（N+1 回避）。
    all_ids = {p.id for lane in lanes for p, _ in lane.items}
    ratings = review_repo.rating_map(db, all_ids)

    sections = [
        HomeSectionOut(
            key=lane.key,
            title=lane.title,
            subtitle=None,  # Phase 1 では常に None（契約）。
            layout=lane.layout,
            items=[
                RecommendationItemOut(
                    product=to_product_out(product, *ratings.get(product.id, (None, 0))),
                    reason=reason,
                )
                for product, reason in lane.items
            ],
        )
        for lane in lanes
    ]
    return HomeOut(source=source, sections=sections)
