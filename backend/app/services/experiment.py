"""A/Bテストの割り当て。

割り当て結果は原則 DB に持たず、visitor_id と実験の salt から毎回同じ値を計算する
（決定論的ハッシュ）。書き込みが要らないので割り当てだけなら DB 更新なしで返せ、
同じ訪問者には常に同じ枝が出る。

ただし一度でも曝露を記録した訪問者については、保存済みの variant_key を優先する
（sticky bucketing）。運用中に枝の weight を変えるとハッシュの境界が動き、既に
片方を見ていた人が途中から別の枝に移ってしまうため。移動が起きると「どちらの体験の
結果なのか」が分からないデータが混ざり、実験そのものが無効になる。
"""

import hashlib

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.models import (
    ACTIVE_EXPERIMENT_STATUSES,
    Experiment,
    ExperimentExposure,
    ExperimentVariant,
)

# バケットの分解能。0-9999 の 10000 分割で割り当てるため、配分は 0.01% 刻みまで表現できる。
BUCKET_RESOLUTION = 10000


def _bucket(experiment_key: str, salt: str, visitor_id: str, namespace: str) -> int:
    """visitor を 0-9999 のバケットに決定論的に写す。

    namespace は「何を決めるためのハッシュか」を分けるための文字列。実験対象に入るか
    （traffic）と、どの枝に入るか（variant）で別のハッシュを使う。同じハッシュを使い
    回すと、traffic_allocation を絞ったときに残った訪問者のバケットが前半に偏り、
    枝の配分が設計どおりにならない。
    """
    raw = f"{experiment_key}:{salt}:{namespace}:{visitor_id}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % BUCKET_RESOLUTION


def _eligible_variants(experiment: Experiment) -> list[ExperimentVariant]:
    """配分対象の枝を、順序が安定するように key 昇順で返す。

    枝の並び順が変わると同じ visitor の割り当てまで変わってしまうため、DB の取得順や
    追加順ではなく key で必ずソートする。
    """
    return sorted(
        (v for v in experiment.variants if v.weight > 0), key=lambda v: v.key
    )


def assign_variant(experiment: Experiment, visitor_id: str) -> ExperimentVariant | None:
    """visitor に見せる枝を決める。実験対象外／枝が無い場合は None。"""
    if not visitor_id:
        return None

    variants = _eligible_variants(experiment)
    if not variants:
        return None

    # 実験対象に含めるかの判定。traffic_allocation は 0-100 の百分率。
    if _bucket(experiment.key, experiment.salt, visitor_id, "traffic") >= (
        experiment.traffic_allocation * 100
    ):
        return None

    total_weight = sum(v.weight for v in variants)
    bucket = _bucket(experiment.key, experiment.salt, visitor_id, "variant")
    # 浮動小数の誤差で境界がぶれないよう、両辺を整数のまま比較する。
    accumulated = 0
    for variant in variants:
        accumulated += variant.weight
        if bucket * total_weight < accumulated * BUCKET_RESOLUTION:
            return variant
    return variants[-1]


def list_active_experiments(db: Session) -> list[Experiment]:
    """配信中の実験を variant ごと取得する。"""
    return (
        db.query(Experiment)
        .options(selectinload(Experiment.variants))
        .filter(Experiment.status.in_(ACTIVE_EXPERIMENT_STATUSES))
        .order_by(Experiment.id)
        .all()
    )


def get_experiment_by_key(db: Session, key: str) -> Experiment | None:
    return (
        db.query(Experiment)
        .options(selectinload(Experiment.variants))
        .filter(Experiment.key == key)
        .first()
    )


def _sticky_variants(db: Session, visitor_id: str, experiment_ids: list[int]) -> dict[int, str]:
    """既に曝露記録がある実験について、当時割り当てた variant_key を返す。"""
    if not experiment_ids:
        return {}
    rows = (
        db.query(ExperimentExposure.experiment_id, ExperimentExposure.variant_key)
        .filter(
            ExperimentExposure.visitor_id == visitor_id,
            ExperimentExposure.experiment_id.in_(experiment_ids),
        )
        .all()
    )
    return {row.experiment_id: row.variant_key for row in rows}


def resolve_assignments(
    db: Session, visitor_id: str
) -> list[tuple[Experiment, ExperimentVariant]]:
    """配信中の全実験について visitor の割り当てを解決する。

    曝露済みなら当時の枝を、未曝露ならハッシュで決めた枝を返す。実験対象外の実験は
    結果に含めない（フロントは既定のUIを出す）。
    """
    if not visitor_id:
        return []

    experiments = list_active_experiments(db)
    sticky = _sticky_variants(db, visitor_id, [e.id for e in experiments])

    assignments: list[tuple[Experiment, ExperimentVariant]] = []
    for experiment in experiments:
        variant: ExperimentVariant | None = None
        stuck_key = sticky.get(experiment.id)
        if stuck_key is not None:
            # 当時の枝が今も存在する場合だけ採用する。枝を消した実験ではハッシュに戻す。
            variant = next((v for v in experiment.variants if v.key == stuck_key), None)
        if variant is None:
            variant = assign_variant(experiment, visitor_id)
        if variant is not None:
            assignments.append((experiment, variant))
    return assignments


def record_exposure(
    db: Session,
    experiment_id: int,
    variant_key: str,
    visitor_id: str,
    user_id: int | None,
) -> None:
    """曝露を記録する。1 訪問者 × 1 実験で 1 行だけ持つ。

    2回目以降は variant_key も first_seen_at も更新しない（当時見せたものと、いつから
    見せたかを保持するため）。あとからログインした場合に限り user_id を後埋めする。
    """
    stmt = pg_insert(ExperimentExposure).values(
        experiment_id=experiment_id,
        variant_key=variant_key,
        visitor_id=visitor_id,
        user_id=user_id,
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_experiment_exposure_visitor",
        set_={"user_id": func.coalesce(ExperimentExposure.user_id, stmt.excluded.user_id)},
    )
    db.execute(stmt)
    db.commit()


def variant_for(db: Session, experiment_key: str, visitor_id: str) -> ExperimentVariant | None:
    """サーバー側のロジック分岐用。指定実験での枝を1つだけ解決する。

    配信中でない実験や実験対象外の visitor には None を返すので、呼び出し側は
    「None なら既定の挙動」と書けばよい。
    """
    experiment = get_experiment_by_key(db, experiment_key)
    if experiment is None or not experiment.is_active:
        return None
    stuck = _sticky_variants(db, visitor_id, [experiment.id]).get(experiment.id)
    if stuck is not None:
        variant = next((v for v in experiment.variants if v.key == stuck), None)
        if variant is not None:
            return variant
    return assign_variant(experiment, visitor_id)
