"""管理者向けの実験 API。

実験の定義・状態遷移と、結果の集計を返す。配信の可否は Experiment.status が唯一の源で、
実施中の実験は削除せず completed にする（結果を失わないため）。
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_admin
from app.database import get_db
from app.models import AnalyticsEvent, Experiment, ExperimentVariant
from app.schemas import (
    ExperimentCreate,
    ExperimentOut,
    ExperimentResultOut,
    ExperimentUpdate,
    ExperimentVariantIn,
)
from app.services import experiment_report

router = APIRouter(
    prefix="/admin/experiments",
    tags=["admin-experiments"],
    dependencies=[Depends(get_current_admin)],
)

# 許可する状態遷移。completed からは戻さない（中断期間を挟むと季節性やキャンペーンなど
# 外部要因の異なるデータが 1 つの実験に混ざり、結果を解釈できなくなるため）。
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"running"},
    "running": {"paused", "completed"},
    "paused": {"running", "completed"},
    "completed": set(),
}


def _get_experiment(db: Session, experiment_id: int) -> Experiment:
    experiment = (
        db.query(Experiment)
        .options(selectinload(Experiment.variants))
        .filter(Experiment.id == experiment_id)
        .first()
    )
    if experiment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
    return experiment


def _validate_variants(variants: list[ExperimentVariantIn]) -> None:
    keys = [v.key for v in variants]
    if len(set(keys)) != len(keys):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Variant keys must be unique"
        )
    if sum(1 for v in variants if v.is_control) != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exactly one control variant is required",
        )
    if sum(v.weight for v in variants) <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Total weight must be positive"
        )


@router.get("/event-names", response_model=list[str])
def list_event_names(db: Session = Depends(get_db)) -> list[str]:
    """記録済みのイベント名一覧。指標やファネルを選ぶ際の候補に使う。"""
    rows = (
        db.query(AnalyticsEvent.name, func.count(AnalyticsEvent.id).label("total"))
        .group_by(AnalyticsEvent.name)
        .order_by(func.count(AnalyticsEvent.id).desc())
        .limit(100)
        .all()
    )
    return [name for name, _ in rows]


@router.get("", response_model=list[ExperimentOut])
def list_experiments(db: Session = Depends(get_db)) -> list[Experiment]:
    return (
        db.query(Experiment)
        .options(selectinload(Experiment.variants))
        .order_by(Experiment.created_at.desc())
        .all()
    )


@router.post("", response_model=ExperimentOut, status_code=status.HTTP_201_CREATED)
def create_experiment(
    payload: ExperimentCreate, db: Session = Depends(get_db)
) -> Experiment:
    if db.query(Experiment).filter(Experiment.key == payload.key).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Experiment key already exists"
        )
    _validate_variants(payload.variants)

    experiment = Experiment(
        key=payload.key,
        name=payload.name,
        description=payload.description,
        # 実験ごとに異なる salt を自動生成する。これがあるおかげで、ある実験で control に
        # 入った人が別の実験でも control に寄る（キャリーオーバー相関）ことを避けられる。
        salt=uuid.uuid4().hex,
        status="draft",
        traffic_allocation=payload.traffic_allocation,
        primary_metric=payload.primary_metric,
        variants=[
            ExperimentVariant(
                key=v.key,
                name=v.name,
                weight=v.weight,
                is_control=v.is_control,
                config=v.config,
            )
            for v in payload.variants
        ],
    )
    db.add(experiment)
    db.commit()
    db.refresh(experiment)
    return experiment


@router.get("/{experiment_id}", response_model=ExperimentOut)
def get_experiment(experiment_id: int, db: Session = Depends(get_db)) -> Experiment:
    return _get_experiment(db, experiment_id)


@router.put("/{experiment_id}", response_model=ExperimentOut)
def update_experiment(
    experiment_id: int, payload: ExperimentUpdate, db: Session = Depends(get_db)
) -> Experiment:
    experiment = _get_experiment(db, experiment_id)

    if payload.status is not None and payload.status != experiment.status:
        if payload.status not in ALLOWED_TRANSITIONS[experiment.status]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot change status from {experiment.status} to {payload.status}",
            )
        now = datetime.now(timezone.utc)
        if payload.status == "running" and experiment.started_at is None:
            experiment.started_at = now
        if payload.status == "completed":
            experiment.ended_at = now
        experiment.status = payload.status

    if payload.variants is not None:
        # 配分の変更は下書きのときだけ。実施中に weight を変えると割り当ての境界が動き、
        # 既に片方を見ていた人が別の枝に移って結果が汚れる（曝露済みの人は保存済みの枝を
        # 使い続けるので実害は抑えられるが、設計比と実測比がずれて SRM 警告の原因になる）。
        if experiment.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Variants can only be edited while the experiment is a draft",
            )
        _validate_variants(payload.variants)
        experiment.variants = [
            ExperimentVariant(
                key=v.key,
                name=v.name,
                weight=v.weight,
                is_control=v.is_control,
                config=v.config,
            )
            for v in payload.variants
        ]

    if payload.name is not None:
        experiment.name = payload.name
    if payload.description is not None:
        experiment.description = payload.description
    if payload.primary_metric is not None:
        experiment.primary_metric = payload.primary_metric
    if payload.traffic_allocation is not None:
        experiment.traffic_allocation = payload.traffic_allocation

    db.commit()
    db.refresh(experiment)
    return experiment


@router.delete("/{experiment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_experiment(experiment_id: int, db: Session = Depends(get_db)) -> None:
    """下書きの実験のみ削除できる。

    一度でも配信した実験は削除せず completed にする（曝露と成果の対応が失われると、
    過去の意思決定の根拠を検証できなくなるため）。
    """
    experiment = _get_experiment(db, experiment_id)
    if experiment.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft experiments can be deleted",
        )
    db.delete(experiment)
    db.commit()
    return None


@router.get("/{experiment_id}/results", response_model=ExperimentResultOut)
def get_results(
    experiment_id: int,
    metric: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ExperimentResultOut:
    """枝ごとの成果とファネル、SRM 検査結果を返す。metric 未指定なら主要指標。"""
    experiment = _get_experiment(db, experiment_id)
    return experiment_report.build_result(db, experiment, metric)
