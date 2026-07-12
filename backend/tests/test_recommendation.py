"""recommendation の時間減衰ロジック（_decay_factor）のユニットテスト（DB 不要）。"""

from datetime import datetime, timedelta, timezone

from app.services import recommendation


class TestDecayFactor:
    def test_none_returns_one(self):
        # タイムスタンプが無い行動（カート等）は「今の関心」として減衰なし。
        now = datetime.now(timezone.utc)
        assert recommendation._decay_factor(None, now) == 1.0

    def test_now_is_approximately_one(self):
        # 経過ゼロなら 0.5 ** 0 = 1.0。
        now = datetime.now(timezone.utc)
        assert recommendation._decay_factor(now, now) == 1.0

    def test_half_life_is_about_half(self):
        # 半減期（30 日）ちょうどでほぼ 0.5。
        now = datetime.now(timezone.utc)
        occurred = now - timedelta(days=recommendation._HALF_LIFE_DAYS)
        assert recommendation._decay_factor(occurred, now) == 0.5

    def test_two_half_lives_is_about_quarter(self):
        # 半減期 2 回分でおよそ 0.25（下限 0.05 には届かない範囲）。
        now = datetime.now(timezone.utc)
        occurred = now - timedelta(days=recommendation._HALF_LIFE_DAYS * 2)
        assert abs(recommendation._decay_factor(occurred, now) - 0.25) < 1e-9

    def test_very_old_hits_min_floor(self):
        # 非常に古い行動でも下限 _MIN_DECAY までしか下がらない。
        now = datetime.now(timezone.utc)
        occurred = now - timedelta(days=3650)  # 約 10 年前
        assert recommendation._decay_factor(occurred, now) == recommendation._MIN_DECAY

    def test_naive_datetime_treated_as_utc(self):
        # tzinfo 無しの naive datetime は UTC とみなして計算できる（例外を出さない）。
        now = datetime.now(timezone.utc)
        naive = (now - timedelta(days=recommendation._HALF_LIFE_DAYS)).replace(
            tzinfo=None
        )
        assert recommendation._decay_factor(naive, now) == 0.5

    def test_future_occurred_at_not_amplified(self):
        # 未来時刻（負の経過）は 0 に丸めて 1.0 を超えない。
        now = datetime.now(timezone.utc)
        future = now + timedelta(days=10)
        assert recommendation._decay_factor(future, now) == 1.0
