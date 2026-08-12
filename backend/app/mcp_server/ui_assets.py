"""MCP Apps 用 UI アセットの純関数（DB・認証・ルーターに一切触れない）。

apps_ui.py（Apps() への配線本体）から呼ばれる処理のうち、入出力だけで完結するものを
ここに分けてある。apps_ui.py は app.mcp_server.tools を import しており、tools.py は
app.routers 経由で app.auth を import する（app.auth はモジュール読み込み時点で
SECRET_KEY の fail closed 検査を実行する——未設定・短すぎ・既知の弱い値なら
RuntimeError で止まる）。backend/tests/ は「DB 不要の純ロジックテストのみ」が前提
（conftest.py 参照）なので、テストしたい純関数は apps_ui.py ではなくこちらに置く。

同じ理由で、検索結果カードの画像URL・商品ページURLを組み立てる build_search_ui_items も
ここに置いてある。views.py（LLM 向け structuredContent の契約を持つモジュール）には
置かない——views.py は「重いものは一覧に出さない（画像は詳細ツールだけ）」と明言して
おり、画像URLを返す関数を並べて置くと、実際には別チャンネル（_meta.ui であって
structuredContent ではない）なのにその規律に反しているように読めてしまうため。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.config import FRONTEND_ORIGIN

logger = logging.getLogger(__name__)

UI_DIR = Path(__file__).resolve().parent / "ui"
TEMPLATE_PATH = UI_DIR / "search.html"
VENDOR_SDK_PATH = UI_DIR / "vendor" / "mcp-app-sdk.js"

# search.html 側のプレースホルダ（<script type="module"> の中）と文字列を一致させること。
PLACEHOLDER = "<!--MCP_APP_SDK-->"


def build_app_html(template: str, bundle_js: str) -> str:
    """テンプレートの PLACEHOLDER を vendor バンドルへちょうど1回だけ差し替える。

    プレースホルダは search.html の <script type="module"> タグの中に置かれている
    （search.html 参照）。ここで <script> タグを新たに被せないのはそのため——被せると
    外側のタグと二重になり構文が壊れる。

    商品データなど未信頼のテキストは一切受け取らない（引数は template と bundle_js の
    2つだけ）。UI リソースの HTML に商品データを焼き込まない設計はこの関数の引数リストが
    根拠になっている。

    Raises:
        ValueError: bundle_js に "</script" が含まれる場合、または template 内の
            プレースホルダがちょうど1回でない場合。

    bundle_js に "</script" が含まれていたら、埋め込み先の <script> タグをその場で
    閉じてしまい、以降の HTML（イベント配線・初期化処理）がブラウザにただのテキストとして
    解釈される。fetch-mcp-app-sdk.mjs はハッシュを検証した実物だけを書き出すので通常は
    起きないが、将来 vendor のビルド方式が変わって偶然この文字列を含むようになった場合に
    備え、黙って壊れた HTML を配るよりここで検知して落とす。
    """
    if "</script" in bundle_js:
        raise ValueError(
            "MCP App SDK バンドルに '</script' が含まれています。"
            "<script> タグを途中で閉じてしまうため埋め込めません。"
        )
    count = template.count(PLACEHOLDER)
    if count != 1:
        raise ValueError(
            f"テンプレートのプレースホルダ {PLACEHOLDER!r} は1回だけ現れる必要があります"
            f"（実際: {count}回）。search.html の構造が変わっていないか確認してください。"
        )
    return template.replace(PLACEHOLDER, bundle_js, 1)


def load_search_app_html() -> str | None:
    """検索 UI の完成品 HTML を返す。

    テンプレート・vendor バンドルのどちらかが読めなければ None を返す。apps_ui.py は
    これを「UI を諦めて素のツール登録へ切り替える」合図として使う——make mcp-app-sdk を
    まだ走らせていない開発環境や、vendor 取得に失敗したままの環境でも /mcp 自体は
    起動できる、という CLAUDE.md の「付随機能の失敗で店を止めない」規律をここが支える。

    ここで拾うのは OSError（ファイルが単に無い＝想定内。make mcp-app-sdk 未実行の
    開発環境で毎回起きるので無音でよい）だけでなく、build_app_html() が投げる
    ValueError（vendor バンドルに "</script" が混入している／search.html の
    プレースホルダが1個でない＝想定外の設定ミス）も含める。ValueError まで
    OSError と同様に握りつぶさないと、apps_ui.py のモジュール import が
    ValueError で失敗し、`from app.mcp_server.server import mcp` ごと落ちて
    /mcp 全体（既存11ツール）が道連れになる——「付随機能の失敗で店を止めない」の
    対象は「vendor JS が無い」だけで、「vendor JS が壊れている」まで含めるなら
    ここで吸収しておく必要がある。ただし後者は make logs-backend で気づけるよう
    warning を残す（前者は毎回鳴ると開発環境のログが埋まるので鳴らさない）。
    """
    try:
        template = TEMPLATE_PATH.read_text(encoding="utf-8")
        bundle_js = VENDOR_SDK_PATH.read_text(encoding="utf-8")
    except OSError:
        return None
    try:
        return build_app_html(template, bundle_js)
    except ValueError:
        logger.warning(
            "MCP App の検索 UI（%s / %s）を組み立てられませんでした。"
            "search_products は UI 無しのツールとして登録します。詳細は原因の例外を参照してください。",
            TEMPLATE_PATH,
            VENDOR_SDK_PATH,
            exc_info=True,
        )
        return None


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
    渡すこと。structuredContent.items と同じ順序・同じ id になる（search.html は id で
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
