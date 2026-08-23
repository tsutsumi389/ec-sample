"""MCP ツールの出力モデルのユニットテスト（DB 不要）。

守っているのは 3 点。(1) 実売価格と定価が別の鍵で出ること、(2) 「なぜ買えないか」を
LLM に自作させないこと、(3) 金額を MCP 側で組み立て直さないこと。どれも崩れると、
会話の中でユーザーに提示される数字が実際の請求と食い違う。
"""

from datetime import datetime, timezone

from app.mcp_server import views
from app.schemas import (
    AddressOut,
    CartItemOut,
    CartOut,
    OrderDetailOut,
    OrderItemOut,
    OrderSummaryOut,
    ProductOut,
    ProductSpecOut,
)

CREATED_AT = datetime(2026, 1, 1, tzinfo=timezone.utc)


def make_product(
    *,
    id: int = 1,
    name: str = "琺瑯ケトル",
    price: int = 7980,
    sale_price: int | None = None,
    stock: int = 5,
    status: str = "on_sale",
    **extra,
) -> ProductOut:
    """判定と表示に要る列だけを持つ ProductOut（DB へは入れない）。"""
    effective_price = sale_price if sale_price is not None else price
    return ProductOut(
        id=id,
        name=name,
        price=price,
        sale_price=sale_price,
        effective_price=effective_price,
        stock=stock,
        status=status,
        purchasable=status == "on_sale" and stock > 0,
        created_at=CREATED_AT,
        **extra,
    )


def make_cart_item(product: ProductOut, quantity: int, item_id: int = 1) -> CartItemOut:
    return CartItemOut(
        id=item_id,
        product=product,
        quantity=quantity,
        subtotal=product.effective_price * quantity,
    )


class TestProductBrief:
    def test_effective_price_used_when_on_sale(self):
        brief = views.to_product_brief(make_product(price=7980, sale_price=4000), "キッチン")
        assert brief.effective_price == 4000
        assert brief.list_price == 7980

    def test_list_price_is_none_without_sale(self):
        # 定価と実売が同じときに 2 つの数字を並べない（どちらが請求額か揺れる）。
        assert views.to_product_brief(make_product(), None).list_price is None

    def test_no_bare_price_field(self):
        # "price" という鍵を作らない。リポジトリ内で price は「定価」の意味に固定されている。
        assert "price" not in views.to_product_brief(make_product(), None).model_dump()

    def test_excludes_description_images_specs(self):
        keys = set(views.to_product_brief(make_product(), None).model_dump())
        assert keys.isdisjoint({"description", "images", "specs", "image_url", "sku"})

    def test_availability_for_on_sale_with_stock(self):
        assert views.to_product_brief(make_product(), None).availability == "購入できます"

    def test_availability_for_coming_soon(self):
        brief = views.to_product_brief(make_product(status="coming_soon"), None)
        assert brief.availability == "現在購入できません"
        assert brief.purchasable is False

    def test_availability_for_sold_out(self):
        assert views.to_product_brief(make_product(stock=0), None).availability == "在庫切れです"

    def test_availability_for_discontinued(self):
        brief = views.to_product_brief(make_product(status="discontinued"), None)
        assert brief.availability == "現在購入できません"

    def test_category_name_none_when_unmapped(self):
        # カテゴリ名を捏造しない。
        assert views.to_product_brief(make_product(), None).category is None


class TestProductDetail:
    def test_specs_flattened_to_label_colon_value(self):
        product = make_product(
            specs=[ProductSpecOut(label="重量", value="320g"), ProductSpecOut(label="素材", value="琺瑯")]
        )
        assert views.to_product_detail(product, None).specs == ["重量: 320g", "素材: 琺瑯"]

    def test_empty_specs_becomes_empty_list(self):
        assert views.to_product_detail(make_product(), None).specs == []

    def test_description_truncated(self):
        # 全文を流すとコンテキストを食い、説明に仕込まれた指示文の面積もそのまま広がる。
        product = make_product(description="あ" * 500)
        detail = views.to_product_detail(product, None)
        assert detail.description.startswith("あ" * views.DESCRIPTION_MAX_CHARS)
        assert len(detail.description) == views.DESCRIPTION_MAX_CHARS + 1

    def test_short_description_is_untouched(self):
        assert views.to_product_detail(make_product(description="短い"), None).description == "短い"

    def test_detail_keeps_brief_fields(self):
        detail = views.to_product_detail(make_product(sale_price=4000, sku="KT-01"), "キッチン")
        assert detail.effective_price == 4000
        assert detail.sku == "KT-01"
        assert detail.category == "キッチン"


class TestCartView:
    def test_total_amount_is_taken_from_cart_out(self):
        # サーバーが effective_price から計算した値をそのまま出す（再計算しない）。
        cart = CartOut(items=[make_cart_item(make_product(sale_price=4000), 2)], total_amount=8000)
        assert views.to_cart_view(cart).total_amount == 8000

    def test_total_is_not_recomputed_from_lines(self):
        # 明細の和と total_amount がずれていても、出すのは total_amount のほう。
        cart = CartOut(items=[make_cart_item(make_product(price=1000), 2)], total_amount=1)
        assert views.to_cart_view(cart).total_amount == 1

    def test_item_count_is_sum_of_quantities(self):
        cart = CartOut(
            items=[
                make_cart_item(make_product(id=1), 2, item_id=1),
                make_cart_item(make_product(id=2), 3, item_id=2),
            ],
            total_amount=0,
        )
        assert views.to_cart_view(cart).item_count == 5

    def test_line_uses_effective_price_as_unit_price(self):
        cart = CartOut(items=[make_cart_item(make_product(price=7980, sale_price=4000), 1)], total_amount=4000)
        assert views.to_cart_view(cart).items[0].effective_price == 4000

    def test_subtotal_is_taken_from_cart_item_out(self):
        item = make_cart_item(make_product(price=1000), 3)
        assert views.to_cart_view(CartOut(items=[item], total_amount=3000)).items[0].subtotal == 3000

    def test_empty_cart(self):
        view = views.to_cart_view(CartOut(items=[], total_amount=0))
        assert view.items == [] and view.item_count == 0 and view.total_amount == 0

    def test_item_id_is_not_exposed(self):
        # 識別子は product_id 一本（LLM に 2 種類の ID を持たせない）。
        cart = CartOut(items=[make_cart_item(make_product(id=42), 1, item_id=7)], total_amount=0)
        dumped = views.to_cart_view(cart).items[0].model_dump()
        assert dumped["product_id"] == 42
        assert "id" not in dumped and "item_id" not in dumped

    def test_line_availability_accounts_for_quantity(self):
        # 在庫 2 に対し数量 3。get_cart が「購入できます」と言った直後に
        # preview_checkout が止める食い違いを作らない。
        cart = CartOut(items=[make_cart_item(make_product(stock=2), 3)], total_amount=0)
        line = views.to_cart_view(cart).items[0]
        assert line.availability == "在庫が不足しています"
        assert line.purchasable is False

    def test_line_state_reason_wins_over_quantity(self):
        cart = CartOut(items=[make_cart_item(make_product(status="suspended", stock=1), 3)], total_amount=0)
        assert views.to_cart_view(cart).items[0].availability == "現在購入できません"

    def test_line_purchasable_agrees_with_product_out_when_stock_is_enough(self):
        # CartLine.purchasable は数量まで見た判定、ProductOut.purchasable は models.py の
        # 導出。在庫が足りている限りこの 2 つは一致していなければならない（割れると
        # 「カートには入るのに get_cart が買えないと言う」が起きる）。
        for status in ("draft", "coming_soon", "on_sale", "suspended", "discontinued", "archived"):
            product = make_product(status=status, stock=5)
            cart = CartOut(items=[make_cart_item(product, 1)], total_amount=0)
            assert views.to_cart_view(cart).items[0].purchasable is product.purchasable, status


class TestStatusIsNotReDerived:
    """status → 可否の変換を views.py が書き写していないことを固定する。

    写しがあると、販売可能な状態を 1 つ足した日に REST の商品ページと MCP の答えが割れる。
    ここでは models.py の唯一の源（is_viewable_status / is_on_sale_status）を差し替えて、
    views.py の出力がそれに追随することを確かめる。
    """

    def test_availability_follows_models_when_a_sellable_status_is_added(self, monkeypatch):
        from app.services import cart as cart_service

        # 「preorder も販売可能」に定義を変えたつもりで、models 側だけを差し替える。
        monkeypatch.setattr(
            cart_service, "is_viewable_status", lambda status: status in ("on_sale", "preorder")
        )
        monkeypatch.setattr(
            cart_service, "is_on_sale_status", lambda status: status in ("on_sale", "preorder")
        )
        product = make_product(status="preorder", stock=3)
        # views.py が status を直接比較していれば、ここは「お取り扱いが終了しました」になる。
        assert views.availability_text(product) == "購入できます"

    def test_cart_line_follows_models_too(self, monkeypatch):
        # to_cart_line にも同じ写しがあったので、そちらも追随することを固定する。
        from app.services import cart as cart_service

        monkeypatch.setattr(
            cart_service, "is_viewable_status", lambda status: status in ("on_sale", "preorder")
        )
        monkeypatch.setattr(
            cart_service, "is_on_sale_status", lambda status: status in ("on_sale", "preorder")
        )
        cart = CartOut(
            items=[make_cart_item(make_product(status="preorder", stock=3), 1)], total_amount=0
        )
        line = views.to_cart_view(cart).items[0]
        assert line.purchasable is True and line.availability == "購入できます"


class TestAddressBrief:
    def make_address(self) -> AddressOut:
        return AddressOut(
            id=3,
            recipient_name="日比野太郎",
            postal_code="150-0001",
            prefecture="東京都",
            city="渋谷区",
            address_line="神宮前1-2-3",
            phone="03-1234-5678",
            is_default=True,
            created_at=CREATED_AT,
        )

    def test_summary_excludes_address_line_and_phone(self):
        # 本人のデータではあるが、MCP の戻り値は会話ログに残る。選ぶのに番地は要らない。
        summary = views.to_address_brief(self.make_address()).summary
        assert "神宮前" not in summary
        assert "03-1234-5678" not in summary

    def test_summary_includes_postal_and_prefecture(self):
        summary = views.to_address_brief(self.make_address()).summary
        assert "150-0001" in summary and "東京都" in summary and "渋谷区" in summary

    def test_keeps_id_and_default_flag(self):
        brief = views.to_address_brief(self.make_address())
        assert brief.id == 3 and brief.is_default is True


class TestMaskShippingAddress:
    """会話ログ（＝モデル提供側のログ）に電話番号を残さない。

    番地は「そこへ送ってよいか」の確認に要るので残す。伏せるのは表示だけで、
    Order.shipping_address に保存される文字列と確認トークンの address_hash は
    伏せる前の全文で作る（伏字を指紋に混ぜると照合が壊れる）。
    """

    FULL = "日比野太郎\n〒150-0001 東京都渋谷区神宮前1-2-3\nTEL: 03-1234-5678"

    def test_phone_number_is_removed(self):
        masked = views.mask_shipping_address(self.FULL)
        assert "03-1234-5678" not in masked
        assert "TEL: ***" in masked

    def test_address_line_is_kept(self):
        masked = views.mask_shipping_address(self.FULL)
        assert "神宮前1-2-3" in masked and "150-0001" in masked

    def test_is_a_noop_without_a_phone_line(self):
        # 自由入力の住所は TEL: を含まないことがある。壊さない。
        free = "日比野太郎 東京都渋谷区神宮前1-2-3"
        assert views.mask_shipping_address(free) == free


class TestCheckoutModels:
    def test_blocker_kinds_are_fixed(self):
        # 種別を増やすと LLM 側の分岐が壊れる。列挙を固定する。
        assert set(views.CheckoutBlocker.model_fields["kind"].annotation.__args__) == {
            "cart",
            "item",
            "address",
            "coupon",
        }

    def test_confirm_token_defaults_to_none(self):
        # 「発行しない」が既定。can_place_order のときだけ明示的に載せる。
        preview = views.CheckoutPreview(
            items=[],
            subtotal=0,
            discount_amount=0,
            payable_amount=0,
            can_place_order=False,
            next_step="x",
        )
        assert preview.confirm_token is None and preview.expires_in_seconds is None


class TestOrderViews:
    def make_detail(self) -> OrderDetailOut:
        return OrderDetailOut(
            id=12,
            total_amount=7000,
            discount_amount=1000,
            coupon_code="WELCOME10",
            status="pending",
            shipping_address="日比野太郎\n〒150-0001 東京都渋谷区神宮前1-2-3\nTEL: 03-1234-5678",
            created_at=CREATED_AT,
            items=[
                OrderItemOut(id=1, product_id=9, product_name="琺瑯ケトル（当時の名前）", price=4000, quantity=2)
            ],
        )

    def test_order_detail_uses_snapshot_name_and_price(self):
        line = views.to_order_detail(self.make_detail()).items[0]
        assert line.product_name == "琺瑯ケトル（当時の名前）"
        assert line.price == 4000

    def test_order_detail_keeps_discount_and_total(self):
        detail = views.to_order_detail(self.make_detail())
        assert detail.total_amount == 7000 and detail.discount_amount == 1000

    def test_order_detail_masks_the_phone_number(self):
        # get_order は「注文状況を確認して」の一言で呼ばれる。毎回ログに電話番号を展開しない。
        detail = views.to_order_detail(self.make_detail())
        assert "03-1234-5678" not in detail.shipping_address
        assert "神宮前1-2-3" in detail.shipping_address

    def test_summary_drops_items_and_address(self):
        # items を持たないのは list_orders で注文件数ぶんの N+1（遅延ロード）を作らないため。
        # shipping_address を持たないのは、履歴一覧に PII を並べないため。
        summary = views.to_order_summary(
            OrderSummaryOut(
                id=12,
                total_amount=7000,
                discount_amount=0,
                coupon_code=None,
                status="pending",
                shipping_address="東京都渋谷区神宮前1-2-3",
                created_at=CREATED_AT,
            )
        )
        assert "items" not in summary.model_dump()
        assert "shipping_address" not in summary.model_dump()
