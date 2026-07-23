"""A/Bテストの割り当てと統計のユニットテスト（DB 不要）。

ORM オブジェクトはセッションに add しなければ素のインスタンスとして扱えるため、
DB を張らずに割り当てロジックを検証できる。
"""

from app.models import Experiment, ExperimentVariant
from app.services import experiment as experiment_service
from app.services import experiment_report


def build_experiment(
    key: str = "exp",
    salt: str = "salt-1",
    traffic_allocation: int = 100,
    weights: tuple[int, ...] = (50, 50),
) -> Experiment:
    variants = [
        ExperimentVariant(
            key=f"v{index}",
            name=f"variant {index}",
            weight=weight,
            is_control=(index == 0),
            config=None,
        )
        for index, weight in enumerate(weights)
    ]
    return Experiment(
        key=key,
        name="test",
        salt=salt,
        status="running",
        traffic_allocation=traffic_allocation,
        primary_metric="purchase",
        variants=variants,
    )


def visitors(count: int, prefix: str = "visitor") -> list[str]:
    return [f"{prefix}-{i}" for i in range(count)]


class TestAssignVariant:
    def test_is_deterministic(self):
        # 同じ訪問者・同じ実験なら何度呼んでも同じ枝でなければならない
        # （毎回変わると同じ人が両方の体験を見てしまい、結果を解釈できなくなる）。
        experiment = build_experiment()
        first = experiment_service.assign_variant(experiment, "visitor-42")
        for _ in range(10):
            assert experiment_service.assign_variant(experiment, "visitor-42") is first

    def test_empty_visitor_id_is_not_assigned(self):
        # 識別できない訪問者は実験対象にしない（計測できないため）。
        assert experiment_service.assign_variant(build_experiment(), "") is None

    def test_no_variants_returns_none(self):
        assert experiment_service.assign_variant(build_experiment(weights=()), "v1") is None

    def test_zero_weight_variant_is_never_selected(self):
        experiment = build_experiment(weights=(100, 0))
        assigned = {
            experiment_service.assign_variant(experiment, visitor).key
            for visitor in visitors(500)
        }
        assert assigned == {"v0"}

    def test_split_is_close_to_weights(self):
        # 50/50 の配分がおおむね守られること（±2 ポイント以内）。
        experiment = build_experiment()
        counts = {"v0": 0, "v1": 0}
        for visitor in visitors(10000):
            counts[experiment_service.assign_variant(experiment, visitor).key] += 1
        assert abs(counts["v0"] / 10000 - 0.5) < 0.02

    def test_uneven_weights_are_respected(self):
        experiment = build_experiment(weights=(90, 10))
        counts = {"v0": 0, "v1": 0}
        for visitor in visitors(10000):
            counts[experiment_service.assign_variant(experiment, visitor).key] += 1
        assert abs(counts["v1"] / 10000 - 0.1) < 0.02

    def test_traffic_allocation_limits_participants(self):
        experiment = build_experiment(traffic_allocation=10)
        assigned = [
            experiment_service.assign_variant(experiment, visitor) for visitor in visitors(10000)
        ]
        participating = sum(1 for variant in assigned if variant is not None)
        assert abs(participating / 10000 - 0.1) < 0.02

    def test_split_stays_balanced_under_partial_traffic(self):
        # traffic と variant で別のハッシュを使っている効果の確認。同じハッシュを使い回すと
        # 対象者のバケットが前半に偏り、この比率が 50/50 から大きく崩れる。
        experiment = build_experiment(traffic_allocation=50)
        counts = {"v0": 0, "v1": 0}
        for visitor in visitors(10000):
            variant = experiment_service.assign_variant(experiment, visitor)
            if variant is not None:
                counts[variant.key] += 1
        total = counts["v0"] + counts["v1"]
        assert abs(counts["v0"] / total - 0.5) < 0.03

    def test_variant_order_does_not_change_assignment(self):
        # 枝の並び順（DB の取得順）が変わっても割り当てが変わらないこと。
        experiment = build_experiment()
        expected = {
            visitor: experiment_service.assign_variant(experiment, visitor).key
            for visitor in visitors(200)
        }
        experiment.variants = list(reversed(experiment.variants))
        for visitor, variant_key in expected.items():
            assert experiment_service.assign_variant(experiment, visitor).key == variant_key

    def test_different_salt_reshuffles_visitors(self):
        # salt が違えば同じ訪問者でも割り当てが変わる。これが無いと、ある実験で対照群に
        # 入った人が別の実験でも対照群に寄る（キャリーオーバー相関）。
        first = build_experiment(salt="salt-1")
        second = build_experiment(salt="salt-2")
        same = sum(
            1
            for visitor in visitors(1000)
            if experiment_service.assign_variant(first, visitor).key
            == experiment_service.assign_variant(second, visitor).key
        )
        # 無相関ならおよそ半分。完全一致・完全反転のどちらでもないことを確かめる。
        assert 400 < same < 600


class TestTwoProportionPValue:
    def test_identical_rates_are_not_significant(self):
        p_value = experiment_report.two_proportion_p_value(100, 1000, 100, 1000)
        assert p_value is not None and p_value > 0.9

    def test_large_difference_is_significant(self):
        p_value = experiment_report.two_proportion_p_value(100, 1000, 200, 1000)
        assert p_value is not None and p_value < 0.001

    def test_zero_denominator_returns_none(self):
        assert experiment_report.two_proportion_p_value(0, 0, 10, 100) is None

    def test_no_conversions_at_all_returns_none(self):
        # 双方 0 件では分散が 0 になり検定できない。「差が無い」と断定しない。
        assert experiment_report.two_proportion_p_value(0, 100, 0, 100) is None


class TestRelativeLiftCi:
    def test_lift_is_relative_percentage(self):
        lift, low, high = experiment_report.relative_lift_ci(100, 1000, 120, 1000)
        assert lift is not None and abs(lift - 20.0) < 1e-9
        assert low is not None and high is not None and low < lift < high

    def test_zero_control_conversions_has_no_ratio(self):
        assert experiment_report.relative_lift_ci(0, 1000, 10, 1000) == (None, None, None)

    def test_zero_variant_conversions_has_lift_but_no_interval(self):
        lift, low, high = experiment_report.relative_lift_ci(10, 1000, 0, 1000)
        assert lift == -100.0
        assert low is None and high is None


class TestSrmCheck:
    def test_balanced_split_is_not_flagged(self):
        experiment = build_experiment()
        result = experiment_report.check_srm(experiment, {"v0": 5000, "v1": 5050})
        assert result.is_mismatch is False

    def test_severe_imbalance_is_flagged(self):
        # 50/50 のはずが 70/30 に偏っている状態。割り当てか計測の不具合を疑うべき。
        experiment = build_experiment()
        result = experiment_report.check_srm(experiment, {"v0": 7000, "v1": 3000})
        assert result.is_mismatch is True
        assert result.p_value is not None and result.p_value < 0.001

    def test_small_sample_is_not_judged(self):
        # 件数が少ないうちは近似が成り立たないので判定しない（誤警告を出さない）。
        experiment = build_experiment()
        result = experiment_report.check_srm(experiment, {"v0": 8, "v1": 2})
        assert result.p_value is None
        assert result.is_mismatch is False

    def test_expected_ratio_follows_weights(self):
        experiment = build_experiment(weights=(90, 10))
        result = experiment_report.check_srm(experiment, {"v0": 900, "v1": 100})
        assert abs(result.expected["v0"] - 0.9) < 1e-9
        assert result.is_mismatch is False
