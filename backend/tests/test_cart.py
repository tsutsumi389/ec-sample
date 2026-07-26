"""カート投入の在庫判定ロジックのユニットテスト（DB 不要）。

再注文（もう一度買う）とゲストカートのマージが同じ判定を共有するため、売り越し・
取りこぼしに直結する境界をここで固定する。
"""

from app.models import Product
from app.services import cart


def make_product(status: str = "on_sale", stock: int = 10) -> Product:
    """判定に必要な列だけを持つ Product。DB へは入れない（プロパティの評価のみ）。"""
    return Product(name="テスト商品", description="", price=1000, stock=stock, status=status)


class TestAddableQuantity:
    def test_all_requested_fits(self):
        assert cart.addable_quantity(2, 10, 0) == 2

    def test_clamped_to_remaining_stock(self):
        # 在庫 5、カートに 3 → あと 2 しか入らない。
        assert cart.addable_quantity(4, 5, 3) == 2

    def test_zero_when_cart_already_holds_all_stock(self):
        assert cart.addable_quantity(1, 3, 3) == 0

    def test_never_negative_when_cart_exceeds_stock(self):
        # 在庫が後から減った場合、カート数が在庫を超えることがある。負数を返さない。
        assert cart.addable_quantity(1, 2, 5) == 0

    def test_zero_stock(self):
        assert cart.addable_quantity(1, 0, 0) == 0


class TestShortageReason:
    def test_none_when_fully_added(self):
        assert cart.shortage_reason(3, 3) is None

    def test_none_when_added_more_than_requested(self):
        # 起こらない組み合わせだが、理由を捏造しないことを固定する。
        assert cart.shortage_reason(4, 3) is None

    def test_message_when_partially_added(self):
        assert cart.shortage_reason(2, 5) == "在庫が不足するため2点のみ追加しました"


class TestUnavailableReason:
    def test_on_sale_with_stock_is_available(self):
        assert cart.unavailable_reason(make_product()) is None

    def test_missing_product(self):
        assert cart.unavailable_reason(None) == "お取り扱いが終了しました"

    def test_archived_is_not_viewable(self):
        # archived は VIEWABLE_STATUSES に無い（論理削除相当）。
        assert cart.unavailable_reason(make_product(status="archived")) == "お取り扱いが終了しました"

    def test_viewable_but_not_on_sale(self):
        # 商品ページは開けるが買えない状態（近日発売・販売停止・販売終了）。
        for status in ("coming_soon", "suspended", "discontinued"):
            assert cart.unavailable_reason(make_product(status=status)) == "現在購入できません"

    def test_on_sale_but_sold_out(self):
        assert cart.unavailable_reason(make_product(stock=0)) == "在庫切れです"

    def test_status_is_checked_before_stock(self):
        # 販売停止かつ在庫切れなら、理由は在庫ではなく状態を優先して伝える
        # （在庫を足せば買えるように読めてしまうため）。
        assert cart.unavailable_reason(make_product(status="suspended", stock=0)) == "現在購入できません"
