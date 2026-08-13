"""MCP Apps 拡張（`io.modelcontextprotocol/ui`）への配線。

**このモジュールがやること・やらないこと**
  - やる: search_products と get_product を UI 付きツールとして登録し、tools/list に
    `_meta.ui.resourceUri` を、tools/call の戻り値に `_meta.ui`（カード・パネル描画用
    データ）を付ける。
  - やらない: 在庫・価格・購入可否の判定。すべて tools.search_products_with_raw_items /
    tools.get_product（= 既存ルーターへの委譲）に任せ、ここでは呼んで結果を包み直すだけ。

**登録は import 時点で完了させる。** `Apps()` インスタンスは
`MCPServer(extensions=[apps])` のコンストラクタ内で **同期的に一度だけ**
`apps.tools()` / `apps.resources()` を読み出す（mcp/server/mcpserver/server.py の
`_apply_extension`）。つまりこのモジュールの `apps.add_html_resource()` /
`apps.tool()` 呼び出しは、**モジュールの import 時点**で（= server.py が
`MCPServer(...)` を構築する前に）完了していなければならない。構築後に `apps.tool()` を
呼んでも、`Apps._tools` にリストが積まれるだけで誰も読みに来ない——例外もログも出ずに
静かに無視される。

**同名ツールを両方の経路から登録しないこと。** `ToolManager.add_tool()` は同名の
再登録を「先勝ち＋警告ログのみ」で処理し、後から来た description/annotations を黙って
捨てる。そのため tools.py の `register()` から search_products / get_product の
`mcp.add_tool()` を外してあり（tools.py 側にもコメントを残してある）、UI 付き登録は
必ずここだけが行う。

**ビルド済みの View HTML（ui/dist/*.html）が無ければ UI を諦める。**
`ui_assets.load_search_app_html()` / `load_product_app_html()` が None を返す
（dist の HTML が読めない、または読めても内容が壊れている）場合、
その 1 ツールぶんは `apps` に何も登録しない（＝もう片方が登録済みでも `Apps()` の状態は
そのツールについてだけ空のまま。`MCPServer(extensions=[apps])` の構築は成功する——
`apps.tools()` の ValueError は「ツールだけ登録してリソースを登録しなかった」ときにしか
出ない。ツールを1つも登録しなければ空リストを返すだけで済む）。その代わり
`register_fallback()` が `mcp.add_tool(tools.search_products, ...)` /
`mcp.add_tool(tools.get_product, ...)` で従来どおり素のツールとして登録する。これは
CLAUDE.md の「付随機能の失敗で店を止めない」規律（マイグレーション 0001/0002 を分けて
あるのと同じ）を Apps 拡張にも適用したもの。2 ツールの成否は独立している——片方の UI
登録だけ失敗しても、もう片方の UI 登録・フォールバック登録には影響しない（後述の
`_ui_registered_tools` 参照）。View 本体は別コンテナ `mcp-apps/`（TypeScript + Vite）が
持っており、そこが `ui/dist/{search,product}.html` を書き出せば次の起動から両方に UI が
付く（backend は `uvicorn --reload-include '*.html'` で dist の書き換えを拾って再起動
する——HTML はこのモジュールの **import 時に一度だけ**読まれるため、再起動しなければ
古い UI が配られ続ける）。

**client_supports_apps で分岐しないこと。** このサーバーの構成（stateless_http=True）
では常に False を返す（initialize で送られる ClientCapabilities が、リクエストごとに
作り直されるステートレスなセッションへ引き継がれないため）。UI が描画されるかどうかの
判断はホスト側に委ね、content / structuredContent は「UI が描画されない場合」を前提に
した形（= Apps 対応前と同じ形）を常に返す。

**検索結果カードの画像URLは _meta.ui にだけ載せ、structuredContent には足さない。**
views.py の「重いものは一覧に出さない（画像は詳細ツールだけ）」規律を破らないため
（search の ProductBrief は画像を持たない）。カードの画像は LLM の会話ログではなく、
iframe だけが読む _meta.ui.items[].image_url から取る。商品詳細はこの規律の裏側に
あたる——views.ProductDetail は既に image_url を（相対パスのまま）structuredContent に
持つ。get_product の _meta.ui にも image_url を載せるが、これは絶対URL化した別物
（iframe の <img src> にそのまま使える値）であって、重複ではなく役割の違い。
structuredContent に対応が無いのは _meta.ui.page_url だけ。
"""

from __future__ import annotations

import functools
from typing import Any

import pydantic_core
from mcp.server.apps import Apps, ResourceCsp
from mcp.server.mcpserver import MCPServer
from mcp_types import CallToolResult, TextContent

from app.config import FRONTEND_ORIGIN
from app.mcp_server import tools, ui_assets

# apps.tool() の resource_uri と apps.add_html_resource() の uri は必ず同じ文字列に
# すること。Apps.tools() はここが一致しないと ValueError を投げ、MCPServer の構築ごと
# 落ちる（「設定ミスで /mcp 全体が死ぬ」障害モードそのもの）。定数化してタイプミスの
# 余地を消す。
SEARCH_RESOURCE_URI = "ui://hibino/search-products.html"
PRODUCT_RESOURCE_URI = "ui://hibino/product-detail.html"

apps = Apps()

# apps.add_html_resource() が実際に呼ばれ、UI 付きで登録できたツール名の集合。
# register_fallback() が「そのツールはもう登録済みだから何もしない」をツールごとに
# 独立して判定するのに使う。単一のブール値にしないのは、2ツール以上になった時点で
# 「(search: UI or fallback) × (product: UI or fallback)」という独立な状態を1ビットへ
# 潰してしまうため——例えば search が UI 登録に成功し product が失敗した場合、単一の
# ブールだと「もう登録済み」の判定に search の成功が使われ、product が UI 登録もされず
# フォールバックも打たれず、例外もログも無く tools/list から丸ごと消えるという事故が
# 起きる（気づけない静かな消失）。ツール名をキーにして独立に持てば、この事故は
# 構造的に起こらない。
_ui_registered_tools: set[str] = set()


# search_products の UI 付き版。判定は一切持たない——tools.search_products_with_raw_items
# を1回呼ぶだけで、LLM 向けの結果（views.ProductSearchResult）と、変換前の商品列
# （画像URLの元）の両方を受け取る。
#
# `functools.wraps(tools.search_products)` を下に掛けてあるため、SDK が
# `Tool.from_function()` で読む signature（引数・型注釈・ctx の位置）はこの関数自身の
# ものではなく `tools.search_products` のものになる（`inspect.signature` の既定
# `follow_wrapped=True` により、`__wrapped__` を辿って本体の signature が返る）。実測で
# input schema・output schema とも `tools.search_products` を直接 `Tool.from_function()`
# した場合と完全に一致することを確認済み。引数列をここに書き写さないのはこのため——
# 書き写すと、将来 tools.search_products に引数が増えたときにここだけ取り残され、UI 付き
# 経路の inputSchema が黙って古くなる。
#
# この説明を関数の docstring ではなくコメントにしてあるのは、functools.wraps が
# `__doc__` も含めて属性を丸ごと `tools.search_products` 側（docstring 無し）で
# 上書きするため——ここに docstring を書いても実行時には None に消える（実測済み）。
@functools.wraps(tools.search_products)
def _search_products_with_ui(**kwargs: Any) -> CallToolResult:
    result, raw_items = tools.search_products_with_raw_items(**kwargs)

    # content は Apps 対応前と完全に同じ形にする（UI 非対応クライアントの見え方を
    # 変えないため）。SDK の func_metadata.convert_result が非 CallToolResult な
    # 戻り値に対してやっている変換
    # （unstructured_content = pydantic_core.to_json(result, fallback=str, indent=2)）を
    # ここで手で行う。実機で採取した Apps 対応前のレスポンスと突き合わせて一致を確認済み。
    content = [
        TextContent(
            type="text",
            text=pydantic_core.to_json(result, fallback=str, indent=2).decode(),
        )
    ]
    structured_content = result.model_dump(mode="json", by_alias=True)

    return CallToolResult(
        content=content,
        structured_content=structured_content,
        meta={"ui": {"items": ui_assets.build_search_ui_items(raw_items)}},
    )


_html = ui_assets.load_search_app_html()
if _html is not None:
    apps.add_html_resource(
        SEARCH_RESOURCE_URI,
        _html,
        title="商品検索結果",
        description="search_products の検索結果をカード一覧で表示します。",
        # ホスト既定の CSP は img-src 'self' data: なので、商品画像
        # （frontend が配る http://localhost:3000/products/*.svg）を出すには
        # resourceDomains を明示する必要がある（resourceDomains は img-src /
        # script-src / style-src / font-src / media-src の全てに展開される）。
        csp=ResourceCsp(resource_domains=[FRONTEND_ORIGIN]),
    )
    # デコレータ構文ではなく関数適用で既存関数（_search_products_with_ui）に当てる。
    # add_html_resource が失敗したときに apps.tool() まで実行してしまうと、リソースの
    # 無いツールが1つ登録された不完全な状態になる（次に apps.tools() が呼ばれた瞬間に
    # ValueError で /mcp 全体が落ちる）。if ブロックの中に両方を収めているのはそのため。
    apps.tool(
        resource_uri=SEARCH_RESOURCE_URI,
        visibility=["model", "app"],
        description=tools.SEARCH_PRODUCTS_DESCRIPTION,
        annotations=tools.SEARCH_PRODUCTS_ANNOTATIONS,
    )(_search_products_with_ui)
    _ui_registered_tools.add("search_products")


# get_product の UI 付き版。search と違い判定を持たないだけでなく、生商品列を別途
# 取り直す分割（search_products_with_raw_items 相当）も要らない——
# views.ProductDetail は既に image_url を（相対パスのまま）structuredContent に
# 持っているので、tools.get_product() を 1 回呼んだ戻り値をそのまま
# ui_assets.build_product_ui_item() にも渡せる（views.py の「詳細ツールは画像を
# 出してよい」規律の裏側）。
#
# functools.wraps(tools.get_product) の理由は _search_products_with_ui と同じ
# （上のコメント参照）。tools.get_product は ctx を取らない（product_id だけ）ので、
# SDK が読む signature もそれだけになる。
@functools.wraps(tools.get_product)
def _get_product_with_ui(**kwargs: Any) -> CallToolResult:
    result = tools.get_product(**kwargs)

    # content は Apps 対応前と完全に同じ形にする（_search_products_with_ui と同じ理由）。
    content = [
        TextContent(
            type="text",
            text=pydantic_core.to_json(result, fallback=str, indent=2).decode(),
        )
    ]
    structured_content = result.model_dump(mode="json", by_alias=True)

    return CallToolResult(
        content=content,
        structured_content=structured_content,
        meta={"ui": ui_assets.build_product_ui_item(result)},
    )


_product_html = ui_assets.load_product_app_html()
if _product_html is not None:
    apps.add_html_resource(
        PRODUCT_RESOURCE_URI,
        _product_html,
        title="商品詳細",
        description="get_product の結果を商品詳細パネルで表示します。",
        # search と同じ理由（商品画像が frontend 配信のため）で resourceDomains が要る。
        csp=ResourceCsp(resource_domains=[FRONTEND_ORIGIN]),
    )
    # add_html_resource が失敗したときに apps.tool() まで実行してしまうと、リソースの
    # 無いツールが1つ登録された不完全な状態になる（search と同じ理由で if ブロックの
    # 中に両方を収めてある）。
    apps.tool(
        resource_uri=PRODUCT_RESOURCE_URI,
        visibility=["model", "app"],
        description=tools.GET_PRODUCT_DESCRIPTION,
        annotations=tools.GET_PRODUCT_ANNOTATIONS,
    )(_get_product_with_ui)
    _ui_registered_tools.add("get_product")


def register_fallback(mcp: MCPServer) -> None:
    """apps 経由で UI 付き登録ができなかったツールだけ、素の形で足す。

    server.py から MCPServer 構築の**後**に呼ぶこと。ツールごとに独立して判定する
    （_ui_registered_tools 参照）——search_products と get_product の一方だけ UI 登録に
    成功していても、もう一方はここでフォールバック登録される。UI 登録済みのツールを
    二重登録すると ToolManager.add_tool() が「先勝ち＋警告ログのみ」で処理し、
    tools/list の説明が意図しない方に固定される。
    """
    if "search_products" not in _ui_registered_tools:
        mcp.add_tool(
            tools.search_products,
            description=tools.SEARCH_PRODUCTS_DESCRIPTION,
            annotations=tools.SEARCH_PRODUCTS_ANNOTATIONS,
        )
    if "get_product" not in _ui_registered_tools:
        mcp.add_tool(
            tools.get_product,
            description=tools.GET_PRODUCT_DESCRIPTION,
            annotations=tools.GET_PRODUCT_ANNOTATIONS,
        )
