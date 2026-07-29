"""build_product_text（埋め込み元テキストの組み立て）のユニットテスト（DB 不要）。

Product / ProductSpec は永続化せずインスタンスだけ作って渡す。
"""

from app.models import Category, Product, ProductSpec
from app.services import embedding


def _product(**kwargs) -> Product:
    defaults = {
        "name": "ステンレスボトル",
        "description": "保温保冷に優れた真空断熱ボトル。",
        "price": 1500,
        "stock": 10,
        "status": "on_sale",
    }
    return Product(**{**defaults, **kwargs})


class TestBuildProductText:
    def test_includes_specs_as_one_line(self):
        # 仕様は「項目名 値」を読点で連ねた1行にまとまる。
        product = _product(
            specs=[
                ProductSpec(label="容量", value="500mL", sort_order=0),
                ProductSpec(label="重量", value="約280g", sort_order=1),
            ]
        )
        text = embedding.build_product_text(product)
        assert "仕様: 容量 500mL、重量 約280g" in text

    def test_omits_spec_line_when_no_specs(self):
        # 仕様が無い商品に空の「仕様:」行を足さない。足すと、仕様を持たない商品どうしが
        # 「仕様が無い」という共通点でベクトル上近づいてしまう。
        text = embedding.build_product_text(_product())
        assert "仕様" not in text

    def test_keeps_existing_parts(self):
        # 既存の4行（商品名・カテゴリ・説明・価格帯）は仕様の有無に関わらず出る。
        product = _product(
            category=Category(name="日用品", slug="daily-goods"),
            specs=[ProductSpec(label="素材", value="ステンレス鋼", sort_order=0)],
        )
        text = embedding.build_product_text(product)
        assert "商品名: ステンレスボトル" in text
        assert "カテゴリ: 日用品" in text
        assert "説明: 保温保冷に優れた真空断熱ボトル。" in text
        assert "価格帯: 手頃な価格帯（¥1,500）" in text

    def test_uses_effective_price_band(self):
        # 価格帯は実売価格（sale_price があればそれ）で判定する。
        product = _product(price=8000, sale_price=1800)
        assert "価格帯: 手頃な価格帯（¥1,800）" in embedding.build_product_text(product)
