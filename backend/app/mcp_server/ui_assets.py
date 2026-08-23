"""MCP Apps 用 UI アセットの純関数（DB・認証・ルーターに一切触れない）。

View 本体（iframe の中で描画される画面）は別プロジェクト `mcp-apps/`（TypeScript +
Vite）が持ち、単一ファイル HTML として `ui/dist/` へ書き出す。**このモジュールは
その成果物を読むだけで、HTML を組み立てない。**

apps_ui.py から呼ばれる処理のうち入出力だけで完結するものをここへ分けてあるのは、
apps_ui.py → tools.py → app.routers → app.auth と芋づるで import され、app.auth が読み込み
時点で SECRET_KEY の fail closed 検査を走らせるため。backend/tests/ は「DB 不要の純ロジック
テストのみ」が前提（conftest.py 参照）なので、テストしたい純関数はこちらに置く。

build_search_ui_items / build_product_ui_item を views.py に置かないのも同じ理由に加え、
views.py が「重いものは一覧に出さない（画像は詳細ツールだけ）」と明言しているため——実際は
別チャンネル（_meta.ui であって structuredContent ではない）なのに規律違反に読めてしまう。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.config import FRONTEND_ORIGIN

logger = logging.getLogger(__name__)

UI_DIR = Path(__file__).resolve().parent / "ui"

# mcp-apps コンテナが書き出す単一ファイル HTML の置き場（.gitignore 済み）。backend は
# **読むだけ**で、ビルドは起動条件ではない——揃っていなければ UI を諦めて素のツール登録へ
# 落ちる（_load_app_html 参照）。
DIST_DIR = UI_DIR / "dist"

# ファイル名は mcp-apps 側の Vite の入口（rollupOptions.input）と一対一。片方だけ変えると、
# backend は「ファイルが無い」と判断して無音でフォールバックする。
SEARCH_APP_FILENAME = "search.html"
PRODUCT_APP_FILENAME = "product.html"


def _load_app_html(path: Path, *, label: str, tool_name: str) -> str | None:
    """ビルド済みの View HTML を読んでそのまま返す共通処理。読めない・壊れていれば None。

    None は apps_ui.py にとって「UI を諦めて素のツール登録へ切り替える」合図。

    **例外を外へ漏らさないこと。** ここから例外が出ると apps_ui.py のモジュール import が
    失敗し、server.py の `from app.mcp_server import apps_ui, checkout, tools` ごと落ちて
    /mcp 全体（既存11ツール）が道連れになる。

    無音と警告を撃ち分ける:
      - OSError（ファイルがまだ無い）= 想定内。mcp-apps の初回ビルドが終わる前や、compose を
        使わずに backend だけ動かしたときに毎回起きるので鳴らさない（本物の警告が埋もれる）。
      - 内容が壊れている（空・<html> が無い・末尾が切れている・UTF-8 として読めない）
        = 想定外の設定ミス、またはビルド途中の書きかけ。**ここを無音にしないこと。**

    path は呼び出し元の関数本体で DIST_DIR を名前解決して渡す。デフォルト引数値として
    束縛すると import 時点の値で凍結され、テストの
    monkeypatch.setattr(ui_assets, "DIST_DIR", ...) が効かなくなる。
    """
    try:
        html = path.read_text(encoding="utf-8")
    except OSError:
        # ファイルがまだ無い＝想定内。無音でフォールバックへ。
        return None
    except UnicodeDecodeError:
        # ビルド途中の書きかけを、マルチバイト文字の**途中で**読んだ場合。
        # UnicodeDecodeError は ValueError の子であって OSError ではないので上の except では
        # 捕まらず、**捕まえ損ねると例外がここから外へ出て apps_ui.py の import ごと落ち、
        # /mcp が丸ごと消える**（REST だけが生き残り POST /mcp は 404。実測済み）。
        # 空文字にして下の検査へ合流させ、警告の文言も1本に保つ。
        html = ""

    # 見るのは「HTML 文書として体を成しているか」だけで、**中身の意味的な検査を足さないこと**
    # （View の実装形式が backend へ漏れ、mcp-apps のビルド構成を変えるたびに backend を直す
    # 羽目になる）。末尾（</html>）まで見るのはビルド中の書きかけを弾くため——書き込み完了で
    # もう一度 reload が掛かるので放っておいても回復する。
    # **この3条件は mcp-apps/scripts/check-dist.ts の findHtmlProblems と対で持つ値。**
    # 作り手側の検査がこちらより緩いと、ビルドは緑のまま UI だけが消える。片方だけ直さない。
    if not html.strip() or "<html" not in html or "</html>" not in html:
        logger.warning(
            "MCP App の%s UI（%s）が壊れています"
            "（空・不完全な HTML・UTF-8 として読めないバイト列のいずれか）。"
            "%s は UI 無しのツールとして登録します。"
            "mcp-apps のビルドが完了しているか（make logs-mcp-apps）を確認してください。",
            label,
            path,
            tool_name,
        )
        return None
    return html


def load_search_app_html() -> str | None:
    """検索 UI（ビルド済み）の HTML を返す。apps_ui.py の search_products 登録が使う。

    **引数を取らないこと。** 商品データを渡す口がどこにも無いこと自体が、UI リソースの
    HTML に個別のデータが焼き込まれない設計の根拠になっている。View は iframe 側の JS が
    app.ontoolresult で受け取った structuredContent / _meta.ui を描画時に埋める。
    """
    return _load_app_html(
        DIST_DIR / SEARCH_APP_FILENAME, label="検索", tool_name="search_products"
    )


def load_product_app_html() -> str | None:
    """商品詳細 UI（ビルド済み）の HTML を返す。apps_ui.py の get_product 登録が使う。

    load_search_app_html と同じく引数を取らない（理由も同じ）。
    """
    return _load_app_html(
        DIST_DIR / PRODUCT_APP_FILENAME, label="商品詳細", tool_name="get_product"
    )


def build_search_ui_items(items: list[Any]) -> list[dict[str, Any]]:
    """検索結果の商品列から、View（iframe）だけが読む _meta.ui.items を組み立てる。

    items は id / image_url を持つオブジェクトの列（実際には app.schemas.ProductOut。
    依存の向きを「apps_ui.py 側が渡してくる」に閉じるため、型は Any の duck typing）。

    structuredContent 側の ProductBrief には画像を持たせない（views.py の「重いものは一覧に
    出さない・画像は詳細ツールだけ」規律）。カード UI の描画には画像が要るので、LLM の会話
    ログには乗らない _meta.ui 側にだけ絶対URL化した画像とページのリンクを流す。

    呼び出し側（apps_ui.py）は search_products_with_raw_items が返す商品列をそのまま渡すこと
    （structuredContent.items と同じ順序・同じ id になる）。
    """
    result: list[dict[str, Any]] = []
    for item in items:
        image_url = f"{FRONTEND_ORIGIN}{item.image_url}" if item.image_url else None
        result.append(
            {
                "id": item.id,
                "image_url": image_url,
                "page_url": f"{FRONTEND_ORIGIN}/products/{item.id}",
            }
        )
    return result


def build_product_ui_item(product: Any) -> dict[str, Any]:
    """商品詳細 1 件から、View（iframe）だけが読む _meta.ui を組み立てる。

    build_search_ui_items の単数版。product は id / image_url を持つオブジェクト（実際には
    views.ProductDetail）。search と違い「画像URLの元を得るためだけの生商品列」を別途取り
    直す必要はない——views.ProductDetail は既に image_url を structuredContent に持つ。

    ここで作る image_url はその相対パスとは別物で、絶対URL化して iframe の <img src> に
    そのまま使える値にする（重複ではなく役割の違い。前者は LLM 向けの参考情報、後者は
    描画専用）。page_url は structuredContent のどのフィールドにも無いのでここで組み立てる。
    """
    image_url = f"{FRONTEND_ORIGIN}{product.image_url}" if product.image_url else None
    return {
        "image_url": image_url,
        "page_url": f"{FRONTEND_ORIGIN}/products/{product.id}",
    }
