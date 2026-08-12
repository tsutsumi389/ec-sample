"""MCP Apps 配線のユニットテスト（DB 不要）。

ui_assets.py の純関数と、Apps 拡張そのものが持つ「設定ミスを検知する」契約を対象にする。
apps_ui.py（Apps() への配線本体）はここでは import しない——app.mcp_server.tools 経由で
app.routers から app.auth を import し、app.auth はモジュール読み込み時点で SECRET_KEY の
fail closed 検査を実行する（未設定・短すぎ・既知の弱い値なら RuntimeError）。conftest.py が
明言する「DB 不要の純ロジックテストのみ」を守るため、ここでは持ち込まない。
"""

import inspect

import pytest

from app.mcp_server import ui_assets


class _FakeProduct:
    """build_search_ui_items が要求する最小限の形（id, image_url）だけを持つダミー。

    実際には app.schemas.ProductOut が渡ってくるが、ui_assets.py は duck typing で
    受けるだけなので、テストでは ProductOut そのものを構築する必要がない
    （ProductOut を import すると app.models 経由で余計な依存が増える）。
    """

    def __init__(self, *, id: int, image_url: str | None) -> None:
        self.id = id
        self.image_url = image_url


class TestBuildAppHtml:
    def test_replaces_placeholder_exactly_once(self):
        template = f"<script>before\n{ui_assets.PLACEHOLDER}\nafter</script>"
        html = ui_assets.build_app_html(template, "globalThis.__McpAppSdk = {};")

        assert ui_assets.PLACEHOLDER not in html
        assert "globalThis.__McpAppSdk = {};" in html
        assert "before" in html
        assert "after" in html

    def test_rejects_bundle_containing_close_script_tag(self):
        template = f"<script>{ui_assets.PLACEHOLDER}</script>"

        with pytest.raises(ValueError):
            ui_assets.build_app_html(template, "var x = '</script>';")

    def test_rejects_template_missing_placeholder(self):
        with pytest.raises(ValueError):
            ui_assets.build_app_html("<script>no placeholder here</script>", "var x = 1;")

    def test_rejects_template_with_duplicate_placeholder(self):
        template = f"{ui_assets.PLACEHOLDER}{ui_assets.PLACEHOLDER}"

        with pytest.raises(ValueError):
            ui_assets.build_app_html(template, "var x = 1;")

    def test_signature_cannot_receive_product_data(self):
        # テンプレートに商品データを焼き込む経路が無いことの回帰テスト。引数が
        # template と bundle_js の2つだけであること自体が、UI リソースの HTML に
        # 商品データを埋め込めない設計の根拠になっている。
        params = set(inspect.signature(ui_assets.build_app_html).parameters)
        assert params == {"template", "bundle_js"}


class TestLoadSearchAppHtml:
    """load_search_app_html() が「ファイルが無い（想定内）」と「ファイルはあるが
    壊れている（想定外の設定ミス）」のどちらでも None を返し、例外を外へ漏らさない
    ことの回帰テスト。

    後者を漏らすと apps_ui.py のモジュール import 自体が ValueError で失敗し、
    server.py の `from app.mcp_server import apps_ui, checkout, tools` が例外を
    投げて /mcp 全体（既存11ツール）が起動できなくなる——vendor バンドルの取得や
    search.html の編集をわずかに誤っただけで店ごと止まる障害モードなので、
    load_search_app_html() の内側で確実に吸収されていることをここで固定する。
    """

    def test_returns_none_when_files_missing(self, monkeypatch, tmp_path):
        monkeypatch.setattr(ui_assets, "TEMPLATE_PATH", tmp_path / "missing.html")
        monkeypatch.setattr(ui_assets, "VENDOR_SDK_PATH", tmp_path / "missing.js")

        assert ui_assets.load_search_app_html() is None

    def test_returns_none_without_raising_when_bundle_contains_close_script_tag(
        self, monkeypatch, tmp_path
    ):
        template_path = tmp_path / "search.html"
        vendor_path = tmp_path / "mcp-app-sdk.js"
        template_path.write_text(
            f"<script>{ui_assets.PLACEHOLDER}</script>", encoding="utf-8"
        )
        vendor_path.write_text("var x = '</script>';", encoding="utf-8")
        monkeypatch.setattr(ui_assets, "TEMPLATE_PATH", template_path)
        monkeypatch.setattr(ui_assets, "VENDOR_SDK_PATH", vendor_path)

        assert ui_assets.load_search_app_html() is None

    def test_returns_none_without_raising_when_placeholder_count_is_wrong(
        self, monkeypatch, tmp_path
    ):
        template_path = tmp_path / "search.html"
        vendor_path = tmp_path / "mcp-app-sdk.js"
        # プレースホルダが0個（誤って消された想定）。
        template_path.write_text("<script>no placeholder here</script>", encoding="utf-8")
        vendor_path.write_text("globalThis.__McpAppSdk = {};", encoding="utf-8")
        monkeypatch.setattr(ui_assets, "TEMPLATE_PATH", template_path)
        monkeypatch.setattr(ui_assets, "VENDOR_SDK_PATH", vendor_path)

        assert ui_assets.load_search_app_html() is None

    def test_returns_html_when_files_are_valid(self, monkeypatch, tmp_path):
        template_path = tmp_path / "search.html"
        vendor_path = tmp_path / "mcp-app-sdk.js"
        template_path.write_text(
            f"<script>{ui_assets.PLACEHOLDER}</script>", encoding="utf-8"
        )
        vendor_path.write_text("globalThis.__McpAppSdk = {};", encoding="utf-8")
        monkeypatch.setattr(ui_assets, "TEMPLATE_PATH", template_path)
        monkeypatch.setattr(ui_assets, "VENDOR_SDK_PATH", vendor_path)

        html = ui_assets.load_search_app_html()

        assert html == "<script>globalThis.__McpAppSdk = {};</script>"


class TestLoadProductAppHtml:
    """load_product_app_html() が load_search_app_html() と同じ壊れ方（ファイル欠落・
    プレースホルダ異常）を同じ規律で吸収することの回帰テスト。

    ロジック本体は共有ヘルパー _load_app_html に集約されているため（TestLoadSearchAppHtml
    が既に「ファイル欠落」「</script 混入」「プレースホルダ数不一致」「正常系」の4パターンを
    固定している）、ここでは商品詳細側のパス（PRODUCT_TEMPLATE_PATH）を差し替えても同じ
    挙動になることだけを確認する。
    """

    def test_returns_none_when_files_missing(self, monkeypatch, tmp_path):
        monkeypatch.setattr(ui_assets, "PRODUCT_TEMPLATE_PATH", tmp_path / "missing.html")
        monkeypatch.setattr(ui_assets, "VENDOR_SDK_PATH", tmp_path / "missing.js")

        assert ui_assets.load_product_app_html() is None

    def test_returns_none_without_raising_when_placeholder_count_is_wrong(
        self, monkeypatch, tmp_path
    ):
        template_path = tmp_path / "product.html"
        vendor_path = tmp_path / "mcp-app-sdk.js"
        # プレースホルダが0個（誤って消された想定）。
        template_path.write_text("<script>no placeholder here</script>", encoding="utf-8")
        vendor_path.write_text("globalThis.__McpAppSdk = {};", encoding="utf-8")
        monkeypatch.setattr(ui_assets, "PRODUCT_TEMPLATE_PATH", template_path)
        monkeypatch.setattr(ui_assets, "VENDOR_SDK_PATH", vendor_path)

        assert ui_assets.load_product_app_html() is None

    def test_returns_html_when_files_are_valid(self, monkeypatch, tmp_path):
        template_path = tmp_path / "product.html"
        vendor_path = tmp_path / "mcp-app-sdk.js"
        template_path.write_text(
            f"<script>{ui_assets.PLACEHOLDER}</script>", encoding="utf-8"
        )
        vendor_path.write_text("globalThis.__McpAppSdk = {};", encoding="utf-8")
        monkeypatch.setattr(ui_assets, "PRODUCT_TEMPLATE_PATH", template_path)
        monkeypatch.setattr(ui_assets, "VENDOR_SDK_PATH", vendor_path)

        html = ui_assets.load_product_app_html()

        assert html == "<script>globalThis.__McpAppSdk = {};</script>"


class TestProductTemplateFile:
    """product.html（静的資産そのもの）にちょうど1個のプレースホルダがあることの固定。

    search.html と同じ契約を新しいテンプレートにも要求しないと、build_app_html が本番の
    起動時にだけ ValueError を出し、load_product_app_html() がそれを飲み込んで
    「vendor JS が無いときと同じ」フォールバックへ静かに落ちる（気づきにくい劣化）。
    """

    def test_has_exactly_one_placeholder(self):
        template = ui_assets.PRODUCT_TEMPLATE_PATH.read_text(encoding="utf-8")

        assert template.count(ui_assets.PLACEHOLDER) == 1


class TestBuildSearchUiItems:
    def test_absolute_urls_are_built_from_frontend_origin(self):
        items = [_FakeProduct(id=1, image_url="/products/kettle.svg")]

        result = ui_assets.build_search_ui_items(items)

        assert result == [
            {
                "id": 1,
                "image_url": "http://localhost:3000/products/kettle.svg",
                "page_url": "http://localhost:3000/products/1",
            }
        ]

    def test_image_url_none_stays_none_but_page_url_is_always_built(self):
        items = [_FakeProduct(id=2, image_url=None)]

        result = ui_assets.build_search_ui_items(items)

        assert result[0]["image_url"] is None
        assert result[0]["page_url"] == "http://localhost:3000/products/2"

    def test_preserves_input_order(self):
        items = [
            _FakeProduct(id=3, image_url=None),
            _FakeProduct(id=1, image_url=None),
        ]

        result = ui_assets.build_search_ui_items(items)

        assert [row["id"] for row in result] == [3, 1]

    def test_empty_list_returns_empty_list(self):
        assert ui_assets.build_search_ui_items([]) == []


class TestBuildProductUiItem:
    """build_search_ui_items の単数版。商品詳細は1件しか無いので id は含まず、
    image_url（絶対URL化）と page_url の2キーだけを返す。
    """

    def test_absolute_urls_are_built_from_frontend_origin(self):
        product = _FakeProduct(id=1, image_url="/products/kettle.svg")

        result = ui_assets.build_product_ui_item(product)

        assert result == {
            "image_url": "http://localhost:3000/products/kettle.svg",
            "page_url": "http://localhost:3000/products/1",
        }

    def test_image_url_none_stays_none_but_page_url_is_always_built(self):
        product = _FakeProduct(id=2, image_url=None)

        result = ui_assets.build_product_ui_item(product)

        assert result["image_url"] is None
        assert result["page_url"] == "http://localhost:3000/products/2"


class TestAppsExtensionMisconfiguration:
    """ui:// リソースを登録せずにツールだけ登録すると、Apps.tools() が ValueError で
    落ちることの回帰テスト（= /mcp 全体が死ぬ障害モード）。

    Apps.tools() は MCPServer(extensions=[apps]) のコンストラクタ内で同期的に一度だけ
    呼ばれる（mcp/server/mcpserver/server.py の _apply_extension）。apps_ui.py が
    add_html_resource() を先に呼ばずに apps.tool() だけ呼ぶ書き方に戻ってしまったら、
    このテストではなく実際の /mcp 起動が例外で落ちる——このテストはその条件を、DB を
    張らずに SDK 単体で再現して固定する。
    """

    def test_tool_without_matching_resource_raises(self):
        from mcp.server.apps import Apps

        apps = Apps()

        def dummy_tool() -> str:
            return "ok"

        apps.tool(resource_uri="ui://test/app.html")(dummy_tool)

        with pytest.raises(ValueError):
            apps.tools()

    def test_tool_with_matching_resource_does_not_raise(self):
        from mcp.server.apps import Apps

        apps = Apps()

        def dummy_tool() -> str:
            return "ok"

        apps.add_html_resource("ui://test/app.html", "<html></html>")
        apps.tool(resource_uri="ui://test/app.html")(dummy_tool)

        assert len(apps.tools()) == 1
