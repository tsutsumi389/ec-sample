"""MCP Apps 拡張（`io.modelcontextprotocol/ui`）への配線。

search_products と get_product を UI 付きツールとして登録し、tools/list に
`_meta.ui.resourceUri` を、tools/call の戻り値に `_meta.ui`（カード・パネル描画用データ）を
付ける。判定は一切持たない——tools.py を呼んで結果を包み直すだけ。

**登録は import 時点で完了させる。** `Apps()` インスタンスは `MCPServer(extensions=[apps])`
のコンストラクタ内で**同期的に一度だけ** `apps.tools()` / `apps.resources()` を読み出す
（SDK の `_apply_extension`）。構築後に `apps.tool()` を呼んでも `Apps._tools` に積まれる
だけで誰も読みに来ない——例外もログも出ずに静かに無視される。

**同名ツールを両方の経路から登録しないこと。** `ToolManager.add_tool()` は同名の再登録を
「先勝ち＋警告ログのみ」で処理し、後から来た description/annotations を黙って捨てる。
そのため tools.py の `register()` から search_products / get_product を外してあり、
UI 付き登録は必ずここだけが行う。

**ビルド済みの View HTML（ui/dist/*.html）が無ければ、そのツールぶんは何も登録しない。**
代わりに `register_fallback()` が素のツールとして登録する（2 ツールの成否は独立。後述の
`_ui_registered_tools` 参照）。ツールを 1 つも登録しなければ `apps.tools()` は空リストを
返すだけなので `MCPServer(...)` の構築は成功する（ValueError が出るのは「ツールだけ登録して
リソースを登録しなかった」とき）。HTML は**このモジュールの import 時に一度だけ**読まれる
ので、mcp-apps が dist を書き換えても backend が再起動するまで古い UI が配られ続ける。

`client_supports_apps` で分岐しないこと（stateless_http=True では常に False を返す）。UI が
描画されるかどうかの判断はホスト側に委ね、content / structuredContent は「UI が描画され
ない場合」を前提にした形を常に返す。UI 専用の画像URL・ページURLは `_meta.ui` にだけ載せ、
`structuredContent` には足さない。
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

# apps.tool() の resource_uri と apps.add_html_resource() の uri は必ず同じ文字列にすること。
# 一致しないと Apps.tools() が ValueError を投げ、MCPServer の構築ごと落ちる（= 設定ミスで
# /mcp 全体が死ぬ）。定数化してタイプミスの余地を消す。
SEARCH_RESOURCE_URI = "ui://hibino/search-products.html"
PRODUCT_RESOURCE_URI = "ui://hibino/product-detail.html"

apps = Apps()

# UI 付きで登録できたツール名の集合。**単一のブール値に戻さないこと**——search が UI 登録に
# 成功し product が失敗した場合、1 ビットだと「もう登録済み」の判定に search の成功が使われ、
# product が UI 登録もフォールバック登録もされず、例外もログも無く tools/list から丸ごと
# 消える。ツール名をキーに独立して持てば、この事故は構造的に起こらない。
_ui_registered_tools: set[str] = set()


# search_products の UI 付き版。tools.search_products_with_raw_items を 1 回呼ぶだけ。
#
# `functools.wraps(tools.search_products)` により、SDK が `Tool.from_function()` で読む
# signature（引数・型注釈・ctx の位置）はこの関数自身のものではなく `tools.search_products`
# のものになる（`inspect.signature` が `__wrapped__` を辿るため）。引数列をここに書き写すと、
# 将来 tools.search_products に引数が増えたときにここだけ取り残され、UI 付き経路の
# inputSchema が黙って古くなる。
#
# この説明を docstring ではなくコメントにしてあるのは、functools.wraps が `__doc__` ごと
# `tools.search_products` 側（docstring 無し）で上書きするため——docstring に書いても実行時
# には None に消える（実測済み）。
@functools.wraps(tools.search_products)
def _search_products_with_ui(**kwargs: Any) -> CallToolResult:
    result, raw_items = tools.search_products_with_raw_items(**kwargs)

    # content は Apps 対応前と完全に同じ形にする（UI 非対応クライアントの見え方を変えない
    # ため）。SDK の func_metadata.convert_result が非 CallToolResult な戻り値に対してやる
    # 変換をここで手で行っている。
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
        # ホスト既定の CSP は img-src 'self' data: なので、商品画像（frontend が配る
        # http://localhost:3000/products/*.svg）を出すには resourceDomains の明示が要る
        # （img-src / script-src / style-src / font-src / media-src の全てに展開される）。
        csp=ResourceCsp(resource_domains=[FRONTEND_ORIGIN]),
    )
    # デコレータ構文ではなく関数適用にしてあるのは、add_html_resource が失敗したときに
    # apps.tool() まで実行するとリソースの無いツールが 1 つ登録された不完全な状態になり、
    # 次に apps.tools() が呼ばれた瞬間に ValueError で /mcp 全体が落ちるため。
    apps.tool(
        resource_uri=SEARCH_RESOURCE_URI,
        visibility=["model", "app"],
        description=tools.SEARCH_PRODUCTS_DESCRIPTION,
        annotations=tools.SEARCH_PRODUCTS_ANNOTATIONS,
    )(_search_products_with_ui)
    _ui_registered_tools.add("search_products")


# get_product の UI 付き版。search と違い生商品列を取り直す分割は要らない——
# views.ProductDetail は既に image_url を（相対パスのまま）持っているので、
# tools.get_product() の戻り値をそのまま ui_assets.build_product_ui_item() にも渡せる。
# functools.wraps の理由は _search_products_with_ui と同じ。
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
    # search と同じ理由で、リソース登録とツール登録を同じ if の中に収めてある。
    apps.tool(
        resource_uri=PRODUCT_RESOURCE_URI,
        visibility=["model", "app"],
        description=tools.GET_PRODUCT_DESCRIPTION,
        annotations=tools.GET_PRODUCT_ANNOTATIONS,
    )(_get_product_with_ui)
    _ui_registered_tools.add("get_product")


def register_fallback(mcp: MCPServer) -> None:
    """apps 経由で UI 付き登録ができなかったツールだけ、素の形で足す。

    server.py から MCPServer 構築の**後**に呼ぶこと。判定はツールごとに独立
    （_ui_registered_tools 参照）。UI 登録済みのツールを二重登録すると
    ToolManager.add_tool() が「先勝ち＋警告ログのみ」で処理し、tools/list の説明が
    意図しない方に固定される。
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
