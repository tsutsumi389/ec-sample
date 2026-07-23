"""A/Bテストの配信 API（公開）。

未ログインでも使えるよう任意認証にし、割り当ての単位は X-Visitor-Id ヘッダで運ばれる
端末識別子にする。実験が 1 件も無い・訪問者が実験対象外、のいずれでも空配列や 204 を
返すだけなので、フロントは常に「割り当てが無ければ既定のUI」と書ける。
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional, get_visitor_id
from app.database import get_db
from app.models import User
from app.schemas import ExperimentAssignmentOut, ExposureIn
from app.services import experiment as experiment_service

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("/assignments", response_model=list[ExperimentAssignmentOut])
def list_assignments(
    visitor_id: str | None = Depends(get_visitor_id),
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[ExperimentAssignmentOut]:
    """配信中の全実験について、この訪問者に見せる枝を返す。

    ここでは曝露を記録しない。ページを開いただけで画面下部の実験まで曝露扱いにすると
    分母が膨らみ、実際には見られていない枝の効果が薄まって見えるため、記録は該当UIが
    描画された時点でフロントから exposure を呼ぶ。
    """
    if visitor_id is None:
        return []
    return [
        ExperimentAssignmentOut(
            experiment_key=exp.key, variant_key=variant.key, config=variant.config
        )
        for exp, variant in experiment_service.resolve_assignments(db, visitor_id)
    ]


@router.post("/exposure", status_code=status.HTTP_204_NO_CONTENT)
def record_exposure(
    payload: ExposureIn,
    visitor_id: str | None = Depends(get_visitor_id),
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> None:
    """「この訪問者に実際に見せた」ことを記録する。2 回目以降は何もしない。

    どの枝を見せたかはサーバー側で解決し直す（クライアントの申告は信用しない）。
    """
    if visitor_id is None:
        return None
    variant = experiment_service.variant_for(db, payload.experiment_key, visitor_id)
    if variant is None:
        # 実験が止まっている・この訪問者は対象外、のいずれか。記録するものは無い。
        return None
    experiment_service.record_exposure(
        db,
        experiment_id=variant.experiment_id,
        variant_key=variant.key,
        visitor_id=visitor_id,
        user_id=current_user.id if current_user else None,
    )
    return None
