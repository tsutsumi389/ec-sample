"""MCP Apps 配線のユニットテスト（DB 不要）。

ui_assets.py の純関数と、Apps 拡張そのものが持つ「設定ミスを検知する」契約を対象にする。
apps_ui.py（Apps() への配線本体）はここでは import しない——app.mcp_server.tools 経由で
app.routers から app.auth を import し、app.auth はモジュール読み込み時点で SECRET_KEY の
fail closed 検査を実行する（未設定・短すぎ・既知の弱い値なら RuntimeError）。conftest.py が
明言する「DB 不要の純ロジックテストのみ」を守るため、ここでは持ち込まない。

View 本体（iframe の中身）は別プロジェクト mcp-apps/（TypeScript + Vite）が持ち、
backend はそのビルド成果物（ui/dist/*.html）を読むだけになった。したがってここで固定
するのは「読めないとき・壊れているときにどう振る舞うか」であって、HTML の中身ではない。
実物の dist を読むテストは置かない——dist は .gitignore 済みの生成物で、新規チェックアウトや
mcp-apps の初回ビルド前には存在せず、無条件に読むテストは必ず落ちるため。
"""

import inspect
import logging

import pytest

from app.mcp_server import ui_assets

# ui_assets._load_app_html が「壊れている」と判定しない最小の HTML。dist に置かれる
# 実物は vite-plugin-singlefile が吐く単一ファイル HTML だが、backend が見るのは
# 「文書として体を成しているか」だけなのでテストもその粒度で書く。
_VALID_HTML = "<!DOCTYPE html><html lang='ja'><body><div id='root'></div></body></html>"


class _FakeProduct:
    """build_search_ui_items が要求する最小限の形（id, image_url）だけを持つダミー。

    実際には app.schemas.ProductOut が渡ってくるが、ui_assets.py は duck typing で
    受けるだけなので、テストでは ProductOut そのものを構築する必要がない
    （ProductOut を import すると app.models 経由で余計な依存が増える）。
    """

    def __init__(self, *, id: int, image_url: str | None) -> None:
        self.id = id
        self.image_url = image_url


def _use_dist(monkeypatch, tmp_path):
    """DIST_DIR を tmp_path へ差し替える。

    差し替えられること自体が回帰テストの対象でもある——ローダはモジュール属性
    DIST_DIR を**関数本体で**名前解決しており、デフォルト引数値に束縛すると import
    時点の値で凍結されてここが効かなくなる（ui_assets._load_app_html の docstring 参照）。
    """
    monkeypatch.setattr(ui_assets, "DIST_DIR", tmp_path)


class TestLoaderSignatures:
    """ローダに商品データを渡す口が無いことの回帰テスト。

    View を別コンテナへ移す前は build_app_html(template, bundle_js) の引数が2つだけで
    あることが「UI リソースの HTML に商品データを焼き込まない」設計の根拠だった。今は
    「ローダが引数を1つも取らない」ことがその根拠にあたる。
    """

    def test_loaders_take_no_arguments(self):
        assert len(inspect.signature(ui_assets.load_search_app_html).parameters) == 0
        assert len(inspect.signature(ui_assets.load_product_app_html).parameters) == 0


class TestLoadSearchAppHtml:
    """load_search_app_html() が「ファイルが無い（想定内）」と「ファイルはあるが
    壊れている（想定外の設定ミス）」のどちらでも None を返し、例外を外へ漏らさない
    ことの回帰テスト。

    例外を漏らすと apps_ui.py のモジュール import 自体が失敗し、server.py の
    `from app.mcp_server import apps_ui, checkout, tools` が例外を投げて /mcp 全体
    （既存11ツール）が起動できなくなる——mcp-apps のビルドがわずかに崩れただけで店ごと
    止まる障害モードなので、ローダの内側で確実に吸収されていることをここで固定する。
    """

    def test_returns_none_when_file_missing(self, monkeypatch, tmp_path):
        # mcp-apps がまだ dist を書き出していない状態（初回起動中・compose を通さずに
        # backend だけ動かした場合）。
        _use_dist(monkeypatch, tmp_path)

        assert ui_assets.load_search_app_html() is None

    def test_missing_file_is_silent(self, monkeypatch, tmp_path, caplog):
        # 「無い」は想定内なので鳴らさない。毎回鳴らすと開発環境のログが埋まり、
        # 本物の警告（下の test_broken_file_logs_warning）が埋もれる。
        _use_dist(monkeypatch, tmp_path)

        with caplog.at_level(logging.WARNING, logger="app.mcp_server.ui_assets"):
            assert ui_assets.load_search_app_html() is None

        assert caplog.records == []

    def test_returns_none_when_file_is_empty(self, monkeypatch, tmp_path):
        # vite build --watch が書きかけの0バイトを晒す瞬間に踏む、実在する経路。
        (tmp_path / "search.html").write_text("", encoding="utf-8")
        _use_dist(monkeypatch, tmp_path)

        assert ui_assets.load_search_app_html() is None

    def test_returns_none_when_content_is_not_html(self, monkeypatch, tmp_path):
        (tmp_path / "search.html").write_text("not html at all", encoding="utf-8")
        _use_dist(monkeypatch, tmp_path)

        assert ui_assets.load_search_app_html() is None

    def test_returns_none_when_html_is_truncated(self, monkeypatch, tmp_path):
        # ビルド途中の書きかけを読んでしまった場合。書き込みが終われば dist の更新で
        # backend がもう一度再起動し、次の import で正しく読める（自然に回復する）。
        (tmp_path / "search.html").write_text(
            "<!DOCTYPE html><html lang='ja'><body>", encoding="utf-8"
        )
        _use_dist(monkeypatch, tmp_path)

        assert ui_assets.load_search_app_html() is None

    def test_returns_none_when_utf8_is_truncated_midcharacter(
        self, monkeypatch, tmp_path, caplog
    ):
        # 上の truncated テストと同じ「書きかけを読んだ」経路だが、切れた位置が
        # **マルチバイト文字の途中**の場合。read_text() が UnicodeDecodeError を投げる。
        # UnicodeDecodeError は ValueError の子であって OSError ではないため、
        # `except OSError` だけでは捕まらず外へ漏れる——漏れると apps_ui.py の import が
        # 失敗し、/mcp が 11 ツールごと 404 になる（実測済みの障害）。dist は大半が
        # ASCII なのでこの経路を踏む確率は数%だが、踏んだときの被害は店ごと止まる。
        # ASCII だけの断片ではこの分岐を通らないので、テストは必ず bytes で書くこと。
        (tmp_path / "search.html").write_bytes(
            "<!DOCTYPE html><html lang='ja'><body>ホ".encode()[:-1]
        )
        _use_dist(monkeypatch, tmp_path)

        with caplog.at_level(logging.WARNING, logger="app.mcp_server.ui_assets"):
            assert ui_assets.load_search_app_html() is None

        # 「壊れている」側（warning あり）へ合流させる。末尾が </html> で切れた場合と
        # 同じ事象なので、切れた位置で無音と警告が入れ替わってはならない。
        assert len(caplog.records) == 1

    def test_broken_file_logs_warning(self, monkeypatch, tmp_path, caplog):
        # 「壊れている」は想定外の設定ミスなので、make logs-backend で気づけるように
        # 必ず1件残す。無言でフォールバックに落ちないことがこのテストの本体。
        (tmp_path / "search.html").write_text("not html at all", encoding="utf-8")
        _use_dist(monkeypatch, tmp_path)

        with caplog.at_level(logging.WARNING, logger="app.mcp_server.ui_assets"):
            assert ui_assets.load_search_app_html() is None

        assert len(caplog.records) == 1

    def test_returns_file_content_unchanged(self, monkeypatch, tmp_path):
        # backend は読むだけで一切加工しない。ここに置換処理を戻そうとした人が落ちる。
        (tmp_path / "search.html").write_text(_VALID_HTML, encoding="utf-8")
        _use_dist(monkeypatch, tmp_path)

        assert ui_assets.load_search_app_html() == _VALID_HTML

    def test_does_not_read_the_product_app(self, monkeypatch, tmp_path):
        # ファイル名の取り違え（search が product を読む）の回帰テスト。2つの View は
        # 独立して成否が決まるので、片方だけ dist にある状態を作って確かめる。
        (tmp_path / "product.html").write_text(_VALID_HTML, encoding="utf-8")
        _use_dist(monkeypatch, tmp_path)

        assert ui_assets.load_search_app_html() is None
        assert ui_assets.load_product_app_html() == _VALID_HTML


class TestLoadProductAppHtml:
    """load_product_app_html() が load_search_app_html() と同じ壊れ方（ファイル欠落・
    内容が HTML でない）を同じ規律で吸収することの回帰テスト。

    ロジック本体は共有ヘルパー _load_app_html に集約されているため（TestLoadSearchAppHtml
    が既に全パターンを固定している）、ここでは商品詳細側のファイル名でも同じ挙動になる
    ことだけを確認する。
    """

    def test_returns_none_when_file_missing(self, monkeypatch, tmp_path):
        _use_dist(monkeypatch, tmp_path)

        assert ui_assets.load_product_app_html() is None

    def test_returns_none_when_content_is_not_html(self, monkeypatch, tmp_path):
        (tmp_path / "product.html").write_text("not html at all", encoding="utf-8")
        _use_dist(monkeypatch, tmp_path)

        assert ui_assets.load_product_app_html() is None

    def test_broken_file_logs_warning(self, monkeypatch, tmp_path, caplog):
        (tmp_path / "product.html").write_text("", encoding="utf-8")
        _use_dist(monkeypatch, tmp_path)

        with caplog.at_level(logging.WARNING, logger="app.mcp_server.ui_assets"):
            assert ui_assets.load_product_app_html() is None

        assert len(caplog.records) == 1

    def test_returns_file_content_unchanged(self, monkeypatch, tmp_path):
        (tmp_path / "product.html").write_text(_VALID_HTML, encoding="utf-8")
        _use_dist(monkeypatch, tmp_path)

        assert ui_assets.load_product_app_html() == _VALID_HTML


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
