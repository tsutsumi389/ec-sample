"""MCP Apps 用 UI アセットの純関数（DB・認証・ルーターに一切触れない）。

View 本体（iframe の中で描画される画面）は別プロジェクト `mcp-apps/`（TypeScript +
Vite）が持ち、単一ファイル HTML として `ui/dist/` へ書き出す。**このモジュールは
その成果物を読むだけで、HTML を組み立てない。**

apps_ui.py（Apps() への配線本体）から呼ばれる処理のうち、入出力だけで完結するものを
ここに分けてある。apps_ui.py は app.mcp_server.tools を import しており、tools.py は
app.routers 経由で app.auth を import する（app.auth はモジュール読み込み時点で
SECRET_KEY の fail closed 検査を実行する——未設定・短すぎ・既知の弱い値なら
RuntimeError で止まる）。backend/tests/ は「DB 不要の純ロジックテストのみ」が前提
（conftest.py 参照）なので、テストしたい純関数は apps_ui.py ではなくこちらに置く。

同じ理由で、検索結果カードの画像URL・商品ページURLを組み立てる build_search_ui_items、
商品詳細パネルの同種データを組み立てる build_product_ui_item もここに置いてある。
views.py（LLM 向け structuredContent の契約を持つモジュール）には置かない——views.py は
「重いものは一覧に出さない（画像は詳細ツールだけ）」と明言しており、画像URLを返す関数を
並べて置くと、実際には別チャンネル（_meta.ui であって structuredContent ではない）
なのにその規律に反しているように読めてしまうため。

なお `_meta.ui` の組み立て（この2関数）は View を別コンテナへ切り出した後も backend に
残っている。在庫・価格・購入可否の判定と同じく「何を渡すか」はサーバー側の契約であり、
移したのは「どう描くか」だけ。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.config import FRONTEND_ORIGIN

logger = logging.getLogger(__name__)

UI_DIR = Path(__file__).resolve().parent / "ui"

# mcp-apps コンテナ（TypeScript + Vite + vite-plugin-singlefile）が書き出す単一ファイル
# HTML の置き場。backend はここを **読むだけ**で、一切書かない（.gitignore 済みなので
# リポジトリにも入らない）。ビルドは mcp-apps 側の責務であり backend の起動条件ではない
# ——揃っていなければ UI を諦めて素のツール登録に落ちる（_load_app_html 参照）。
DIST_DIR = UI_DIR / "dist"

# ファイル名は mcp-apps 側の Vite の入口（rollupOptions.input）と一対一で対応する。
# 片方だけ名前を変えると、backend は「ファイルが無い」と判断して無音でフォールバック
# するので、名前をここに固定して対応関係を目で追えるようにしておく。
SEARCH_APP_FILENAME = "search.html"
PRODUCT_APP_FILENAME = "product.html"


def _load_app_html(path: Path, *, label: str, tool_name: str) -> str | None:
    """ビルド済みの View HTML を読んでそのまま返す共通処理。読めない・壊れていれば None。

    None は apps_ui.py にとって「UI を諦めて素のツール登録へ切り替える」合図。mcp-apps が
    まだ dist を書き出していない環境（初回起動中・compose を通さず backend だけ動かした
    場合・pytest）でも /mcp 自体は 11 ツールで起動できる、という CLAUDE.md の
    「付随機能の失敗で店を止めない」規律をここが支える。

    **例外を外へ漏らさないこと。** ここから例外が出ると apps_ui.py のモジュール import が
    失敗し、server.py の `from app.mcp_server import apps_ui, checkout, tools` ごと落ちて
    /mcp 全体（既存11ツール）が道連れになる。View のビルドが少し崩れただけで店が止まる。

    無音と警告を撃ち分ける（この2段は View を別コンテナへ移す前からの規律をそのまま
    引き継いだもの）:
      - OSError（ファイルがまだ無い）= 想定内。mcp-apps の初回ビルドが終わる前や、
        compose を使わずに backend だけ動かしたときに毎回起きるので鳴らさない
        （毎回鳴らすと開発環境のログが埋まり、本物の警告が埋もれる）。
      - 内容が壊れている（空・<html> が無い・末尾が切れている・UTF-8 として読めない）
        = 想定外の設定ミス、またはビルド途中の書きかけ。make logs-backend で気づける
        よう warning を残す。**ここを無音にしないこと**（next/font が「失敗しても
        ビルドを通して黙ってフォールバックに落ちる」ことをこの repo が嫌っているのと
        同じ話）。

    path は呼び出し元（load_search_app_html / load_product_app_html）の関数本体で
    DIST_DIR を名前解決して渡す。デフォルト引数値として束縛すると import 時点の値で
    凍結され、テストの monkeypatch.setattr(ui_assets, "DIST_DIR", ...) が効かなくなる。
    """
    try:
        html = path.read_text(encoding="utf-8")
    except OSError:
        # ファイルがまだ無い＝想定内。無音でフォールバックへ。
        return None
    except UnicodeDecodeError:
        # ビルド途中の書きかけを、マルチバイト文字の**途中で**読んだ場合。
        # UnicodeDecodeError は ValueError の子であって OSError ではないので、上の
        # except では捕まらない。**捕まえ損ねると例外がここから外へ出て apps_ui.py の
        # モジュール import ごと落ち、server.py の
        # `from app.mcp_server import apps_ui, checkout, tools` が失敗して /mcp が
        # 丸ごと消える**（REST だけが生き残り、POST /mcp は 404 になる。実測済み）。
        # dist の大半は ASCII なので、途中で切れた場合の大半は下の </html> 検査に
        # 落ちて正しく処理される——**この分岐はその残りを同じ場所へ合流させるためだけに
        # ある**。空文字にして下の検査へ渡し、警告の文言も1本に保つ。
        html = ""

    # vite-plugin-singlefile は完結した HTML 文書を1枚だけ吐く。ここで見るのは「文書として
    # 体を成しているか」だけで、中身の妥当性は見ない（見ようとすると View の実装形式が
    # backend 側へ漏れ、mcp-apps のビルド構成を変えるたびに backend を直す羽目になる）。
    # 末尾（</html>）まで確認するのは、ビルド中の書きかけを読んでしまった場合を弾くため
    # ——その場合は書き込み完了でもう一度 reload が掛かり、次の import で正しく読める
    # （放っておいても自然に回復する）。
    # **この3条件は mcp-apps/scripts/check-dist.ts の findHtmlProblems と対で持つ値。**
    # 作り手（mcp-apps）の検査がこちらより緩いと、ビルドは緑のまま UI だけが消える。
    # 片方だけ直さないこと。
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
    HTML に個別のデータが焼き込まれない設計の根拠になっている（View を別コンテナへ移す
    前は build_app_html(template, bundle_js) の引数が2つだけであることがその根拠だった）。
    View は iframe 側の JS が app.ontoolresult で受け取った structuredContent / _meta.ui を
    描画時に埋める。
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
    このモジュールを app.schemas に依存させないため、型は Any の duck typing にして
    ある——app.schemas 自体は DB に触れないので import しても安全だが、依存の向きを
    「apps_ui.py 側が ProductOut を渡してくる」に閉じ、ここは属性2つだけを知っていれば
    よい形にしておく）。

    structuredContent 側の ProductBrief には画像を持たせない（views.py の
    「重いものは一覧に出さない・画像は詳細ツールだけ」規律）。しかしカード UI の描画には
    画像が要るため、LLM の会話ログには乗らない _meta.ui 側にだけ、絶対URL化した画像と
    ページの2つのリンクを流す。

    呼び出し側（apps_ui.py）は search_products_with_raw_items が返す商品列をそのまま
    渡すこと。structuredContent.items と同じ順序・同じ id になる（View は id で
    突き合わせるので順序自体は必須ではないが、揃えておく）。
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

    build_search_ui_items の単数版。product は id / image_url を持つオブジェクト
    （実際には views.ProductDetail。search の raw_items 分割と違い、apps_ui.py 側は
    tools.get_product() を 1 回呼んだ戻り値をそのままここへ渡せばよい——
    views.ProductDetail は既に image_url を（相対パスのまま）structuredContent に
    持っているため、search のように「画像URLの元を得るためだけの生商品列」を別途
    取り直す必要がない）。

    ここで作る image_url は structuredContent 側の相対パスとは別物で、絶対URL化して
    iframe の <img src> にそのまま使える値にする。structuredContent と _meta.ui の
    両方に image_url が存在することになるが、重複ではなく役割が違う——前者は
    LLM 向けの参考情報（views.py の「詳細ツールは画像を出してよい」規律の対象）、
    後者は描画専用の絶対URL。search の ProductBrief は画像を一切持たないので、
    その場合の _meta.ui.items[].image_url とは事情が異なる点に注意。

    page_url は structuredContent のどのフィールドにも無いので、ここで新規に組み立てる
    （build_search_ui_items と同じ形）。
    """
    image_url = f"{FRONTEND_ORIGIN}{product.image_url}" if product.image_url else None
    return {
        "image_url": image_url,
        "page_url": f"{FRONTEND_ORIGIN}/products/{product.id}",
    }
