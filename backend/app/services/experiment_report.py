"""実験結果の集計と統計検定。

曝露テーブル（誰にどの枝を見せたか）と汎用イベントログ（誰が何をしたか）を訪問者 ID で
JOIN し、枝ごとの成果を出す。イベント側は実験を一切知らないので、実験を作る前から
貯まっているログでも同じように集計できる。

集計の約束ごと:
- 分母は「曝露した訪問者数」。イベント数ではなく人数で数える（同じ人の複数回で
  効果が水増しされないようにするため）。
- 成果は「曝露した時刻以降」のイベントだけを数える。曝露前の行動は、その枝を見た
  結果ではないため。
"""

import math

from scipy import stats
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AnalyticsEvent, Experiment, ExperimentExposure
from app.schemas import (
    ExperimentOut,
    ExperimentResultOut,
    FunnelStepOut,
    SrmCheckOut,
    VariantResultOut,
)
from app.services.analytics import DEFAULT_FUNNEL

# 有意水準。慣例の 5%。判断材料であって「これを割ったら即採用」ではない。
SIGNIFICANCE_LEVEL = 0.05
# 95% 信頼区間に使う標準正規分布の分位点。
Z_95 = 1.959963984540054
# SRM（サンプル比率ミスマッチ）の警告水準。通常の有意水準より厳しくして誤警告を減らす。
# ここを割るのは偶然ではまず起きず、割り当てか計測の実装バグを疑うべき状態。
SRM_ALERT_LEVEL = 0.001


def _exposure_counts(db: Session, experiment_id: int) -> dict[str, int]:
    """枝ごとの曝露訪問者数。1 訪問者 1 行なので単純な件数でよい。"""
    rows = (
        db.query(ExperimentExposure.variant_key, func.count(ExperimentExposure.id))
        .filter(ExperimentExposure.experiment_id == experiment_id)
        .group_by(ExperimentExposure.variant_key)
        .all()
    )
    return {variant_key: count for variant_key, count in rows}


def _metric_counts(
    db: Session, experiment_id: int, metric: str
) -> dict[str, tuple[int, float]]:
    """枝ごとの (成果を出した訪問者数, value の合計)。

    value の合計は購入金額のような「量」の指標に使う。人数は distinct、金額は合計と
    数え方が違う点に注意（1 人が 2 回買えば人数は 1、金額は 2 件分）。
    """
    rows = (
        db.query(
            ExperimentExposure.variant_key,
            func.count(func.distinct(AnalyticsEvent.visitor_id)),
            func.coalesce(func.sum(AnalyticsEvent.value), 0.0),
        )
        .join(
            AnalyticsEvent,
            (AnalyticsEvent.visitor_id == ExperimentExposure.visitor_id)
            & (AnalyticsEvent.name == metric)
            # 曝露より後に起きたイベントだけを成果として数える。
            & (AnalyticsEvent.occurred_at >= ExperimentExposure.first_seen_at),
        )
        .filter(ExperimentExposure.experiment_id == experiment_id)
        .group_by(ExperimentExposure.variant_key)
        .all()
    )
    return {variant_key: (users, float(total)) for variant_key, users, total in rows}


def _funnel(
    db: Session, experiment_id: int, steps: tuple[str, ...]
) -> list[FunnelStepOut]:
    """ファネル各段の到達訪問者数を枝ごとに返す。

    段の順序どおりに通過したかまでは見ず、各段への到達人数を並べる簡易版。レイアウト
    変更の実験では「どこで人が減ったか」が分かれば十分なことが多い。
    """
    rows = (
        db.query(
            ExperimentExposure.variant_key,
            AnalyticsEvent.name,
            func.count(func.distinct(AnalyticsEvent.visitor_id)),
        )
        .join(
            AnalyticsEvent,
            (AnalyticsEvent.visitor_id == ExperimentExposure.visitor_id)
            & (AnalyticsEvent.occurred_at >= ExperimentExposure.first_seen_at),
        )
        .filter(
            ExperimentExposure.experiment_id == experiment_id,
            AnalyticsEvent.name.in_(steps),
        )
        .group_by(ExperimentExposure.variant_key, AnalyticsEvent.name)
        .all()
    )
    by_step: dict[str, dict[str, int]] = {step: {} for step in steps}
    for variant_key, name, count in rows:
        by_step[name][variant_key] = count
    return [FunnelStepOut(name=step, counts=by_step[step]) for step in steps]


def two_proportion_p_value(
    control_hits: int, control_n: int, variant_hits: int, variant_n: int
) -> float | None:
    """2 標本比率の差の両側 p 値（プールした分散による Z 検定）。

    どちらかの分母が 0、または両群の比率が同一で分散が 0 になる場合は None を返す
    （検定できない状態を「差が無い」と言い切らないため）。
    """
    if control_n <= 0 or variant_n <= 0:
        return None
    p_control = control_hits / control_n
    p_variant = variant_hits / variant_n
    p_pool = (control_hits + variant_hits) / (control_n + variant_n)
    if p_pool <= 0 or p_pool >= 1:
        return None
    standard_error = math.sqrt(p_pool * (1 - p_pool) * (1 / control_n + 1 / variant_n))
    if standard_error == 0:
        return None
    z = (p_variant - p_control) / standard_error
    return float(2 * stats.norm.sf(abs(z)))


def relative_lift_ci(
    control_hits: int, control_n: int, variant_hits: int, variant_n: int
) -> tuple[float | None, float | None, float | None]:
    """相対リフト（%）とその 95% 信頼区間を返す。

    比の対数に対する標準誤差（デルタ法）で区間を作る。差ではなく比で見るのは、
    「CVR が 2.0% から 2.4% へ」より「20% 改善」の方が意思決定に直結するため。
    どちらかの成果が 0 件のときは比が定義できないので区間は None にする。
    """
    if control_n <= 0 or variant_n <= 0 or control_hits <= 0:
        return None, None, None
    p_control = control_hits / control_n
    p_variant = variant_hits / variant_n
    lift = (p_variant / p_control - 1) * 100
    if variant_hits <= 0:
        return lift, None, None
    log_se = math.sqrt(
        (1 - p_control) / control_hits + (1 - p_variant) / variant_hits
    )
    log_ratio = math.log(p_variant / p_control)
    low = (math.exp(log_ratio - Z_95 * log_se) - 1) * 100
    high = (math.exp(log_ratio + Z_95 * log_se) - 1) * 100
    return lift, low, high


def check_srm(experiment: Experiment, exposures: dict[str, int]) -> SrmCheckOut:
    """サンプル比率ミスマッチ検査（カイ二乗適合度検定）。

    設計した配分と実測の曝露比がずれていないかを見る。ずれている場合、割り当て・
    計測・キャッシュのいずれかに不具合がある可能性が高く、CVR の差を読む前にまず
    ここを疑う必要がある。A/Bテストで最も見落とされやすい欠陥の検出器。
    """
    variants = [v for v in experiment.variants if v.weight > 0]
    total_weight = sum(v.weight for v in variants)
    expected_ratio = {
        v.key: (v.weight / total_weight if total_weight else 0.0) for v in variants
    }
    observed = {v.key: exposures.get(v.key, 0) for v in variants}
    total_observed = sum(observed.values())

    # 期待度数が小さいとカイ二乗近似が成り立たないため、十分な量が貯まるまで判定しない。
    if total_observed < 20 or total_weight == 0 or len(variants) < 2:
        return SrmCheckOut(expected=expected_ratio, observed=observed, p_value=None)

    chi_square = 0.0
    for key, ratio in expected_ratio.items():
        expected_count = total_observed * ratio
        if expected_count <= 0:
            continue
        chi_square += (observed[key] - expected_count) ** 2 / expected_count
    p_value = float(stats.chi2.sf(chi_square, df=len(variants) - 1))
    return SrmCheckOut(
        expected=expected_ratio,
        observed=observed,
        p_value=p_value,
        is_mismatch=p_value < SRM_ALERT_LEVEL,
    )


def build_result(
    db: Session, experiment: Experiment, metric: str | None = None
) -> ExperimentResultOut:
    """結果画面に出す集計一式を組み立てる。"""
    target_metric = metric or experiment.primary_metric
    exposures = _exposure_counts(db, experiment.id)
    metrics = _metric_counts(db, experiment.id, target_metric)

    control = next((v for v in experiment.variants if v.is_control), None)
    control_n = exposures.get(control.key, 0) if control else 0
    control_hits = metrics.get(control.key, (0, 0.0))[0] if control else 0

    results: list[VariantResultOut] = []
    for variant in experiment.variants:
        n = exposures.get(variant.key, 0)
        hits, value_sum = metrics.get(variant.key, (0, 0.0))
        is_control = bool(variant.is_control)

        lift = lift_low = lift_high = p_value = None
        if not is_control and control is not None:
            lift, lift_low, lift_high = relative_lift_ci(control_hits, control_n, hits, n)
            p_value = two_proportion_p_value(control_hits, control_n, hits, n)

        results.append(
            VariantResultOut(
                variant_key=variant.key,
                name=variant.name,
                is_control=is_control,
                exposures=n,
                conversions=hits,
                conversion_rate=(hits / n if n else 0.0),
                value_sum=value_sum,
                value_per_user=(value_sum / n if n else 0.0),
                lift=lift,
                lift_ci_low=lift_low,
                lift_ci_high=lift_high,
                p_value=p_value,
                is_significant=bool(p_value is not None and p_value < SIGNIFICANCE_LEVEL),
            )
        )

    # 主要指標がファネルに含まれない実験（クリック率など）でも最後に並ぶようにする。
    steps = DEFAULT_FUNNEL
    if target_metric not in steps:
        steps = (*steps, target_metric)

    return ExperimentResultOut(
        experiment=ExperimentOut.model_validate(experiment),
        metric=target_metric,
        total_exposures=sum(exposures.values()),
        variants=results,
        funnel=_funnel(db, experiment.id, steps),
        srm=check_srm(experiment, exposures),
    )
