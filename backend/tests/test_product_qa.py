"""product_qa の商品ブロック・レビュー整形・プロンプト構築のユニットテスト（DB 不要）。

answer_question 本体は Ollama 呼び出しを含むため、ここでは DB 非依存の純ロジックと
フォールバックの返り値を検証する。
"""

from app.models import Product, Review
from app.services import product_qa


def _product(**kwargs) -> Product:
    defaults = dict(
        name="琺瑯ケトル",
        price=5000,
        sale_price=None,
        stock=3,
        status="on_sale",
        description="直火・IH対応の1.5L琺瑯ケトル。",
    )
    defaults.update(kwargs)
    return Product(**defaults)


class TestBuildProductBlock:
    def test_contains_core_fields(self):
        block = product_qa.build_product_block(_product(), 4.5)
        assert "商品名: 琺瑯ケトル" in block
        assert "カテゴリ: その他" in block  # category 未設定は「その他」
        assert "価格: ¥5,000" in block
        assert "平均評価: ★4.5" in block
        assert "商品説明: 直火・IH対応の1.5L琺瑯ケトル。" in block

    def test_uses_effective_price_when_on_sale(self):
        block = product_qa.build_product_block(_product(sale_price=3980), None)
        # sale_price があれば実売価格を使う。
        assert "価格: ¥3,980" in block
        # レビューが無ければ平均評価は「まだレビューなし」。
        assert "平均評価: まだレビューなし" in block

    def test_availability_in_stock(self):
        block = product_qa.build_product_block(_product(stock=3, status="on_sale"), None)
        assert "在庫状況: 販売中（在庫あり）" in block

    def test_availability_sold_out(self):
        block = product_qa.build_product_block(_product(stock=0, status="on_sale"), None)
        assert "在庫状況: 在庫切れ" in block

    def test_availability_not_purchasable(self):
        block = product_qa.build_product_block(_product(status="coming_soon"), None)
        assert "在庫状況: 現在購入できません" in block

    def test_empty_description_placeholder(self):
        block = product_qa.build_product_block(_product(description=None), None)
        assert "商品説明: （説明なし）" in block


class TestBuildReviewLines:
    def test_orders_newest_first_and_limits(self):
        product = _product()
        product.reviews = [
            Review(id=i, rating=(i % 5) + 1, comment=f"レビュー{i}") for i in range(1, 12)
        ]
        lines = product_qa.build_review_lines(product)
        # 最大 8 件、id 降順（新しい順）。
        assert len(lines) == 8
        assert lines[0] == "★" + str((11 % 5) + 1) + ": レビュー11"

    def test_rating_only_when_no_comment(self):
        product = _product()
        product.reviews = [Review(id=1, rating=4, comment=None)]
        assert product_qa.build_review_lines(product) == ["★4"]

    def test_empty_when_no_reviews(self):
        assert product_qa.build_review_lines(_product()) == []


class TestBuildUserPrompt:
    def test_wraps_question_in_tag(self):
        prompt = product_qa.build_user_prompt("商品名: ケトル", ["★5: 良い"], "これは指示です")
        assert "<question>これは指示です</question>" in prompt

    def test_contains_blocks(self):
        prompt = product_qa.build_user_prompt("商品名: ケトル", ["★5: 使いやすい"], "食洗機で洗える？")
        assert "【商品情報】" in prompt
        assert "商品名: ケトル" in prompt
        assert "【カスタマーレビュー】" in prompt
        assert "★5: 使いやすい" in prompt
        assert "【お客様の質問】" in prompt

    def test_empty_review_placeholder(self):
        prompt = product_qa.build_user_prompt("商品名: ケトル", [], "質問")
        assert "（レビューはまだありません）" in prompt


class TestSystemPrompt:
    def test_grounding_and_injection_guard(self):
        # 根拠限定・不明時は正直に・インジェクション緩和が明示されていること。
        assert "根拠" in product_qa.SYSTEM_PROMPT
        assert "推測で答えず" in product_qa.SYSTEM_PROMPT
        assert "<question>" in product_qa.SYSTEM_PROMPT
        assert "指示ではありません" in product_qa.SYSTEM_PROMPT


class TestFallback:
    def test_fallback_shape(self):
        result = product_qa._fallback()
        assert result.source == "fallback"
        assert result.answerable is False
        assert result.answer  # 定型文が入る
