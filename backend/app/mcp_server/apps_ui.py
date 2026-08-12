"""MCP Apps 拡張（`io.modelcontextprotocol/ui`）への配線。

**このモジュールがやること・やらないこと**
  - やる: search_products を UI 付きツールとして登録し、tools/list に
    `_meta.ui.resourceUri` を、tools/call の戻り値に `_meta.ui`（カード描画用データ）を
    付ける。
  - やらない: 在庫・価格・購入可否の判定。すべて tools.search_products_with_raw_items
    （= 既存ルーターへの委譲）に任せ、ここでは呼んで結果を包み直すだけ。

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
捨てる。そのため tools.py の `register()` から search_products の `mcp.add_tool()` を
外してあり（tools.py 側にもコメントを残してある）、UI 付き登録は必ずここだけが行う。

**vendor JS（MCP App SDK）が無ければ UI を諦める。** `ui_assets.load_search_app_html()`
が None を返す（テンプレートまたは vendor JS が読めない）場合、`apps` には何も登録しない
（＝ `Apps()` は空のまま。`MCPServer(extensions=[apps])` の構築は成功する——
`apps.tools()` の ValueError は「ツールだけ登録してリソースを登録しなかった」ときにしか
出ない。ツールを1つも登録しなければ空リストを返すだけで済む）。その代わり
`register_fallback()` が `mcp.add_tool(tools.search_products, ...)` で従来どおり素の
ツールとして登録する。これは CLAUDE.md の「付随機能の失敗で店を止めない」規律
（マイグレーション 0001/0002 を分けてあるのと同じ）を Apps 拡張にも適用したもの。
`make mcp-app-sdk` で vendor JS を取得すれば、次回の起動から UI が付く。

**client_supports_apps で分岐しないこと。** このサーバーの構成（stateless_http=True）
では常に False を返す（initialize で送られる ClientCapabilities が、リクエストごとに
作り直されるステートレスなセッションへ引き継がれないため）。UI が描画されるかどうかの
判断はホスト側に委ね、content / structuredContent は「UI が描画されない場合」を前提に
した形（= Apps 対応前と同じ形）を常に返す。

**画像URLは _meta.ui にだけ載せ、structuredContent には足さない。** views.py の
「重いものは一覧に出さない（画像は詳細ツールだけ）」規律を破らないため。カードの画像は
LLM の会話ログではなく、iframe だけが読む _meta.ui.items[].image_url から取る。
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

apps = Apps()

# apps.add_html_resource() が実際に呼ばれ、UI 付きで search_products が登録できたか。
# register_fallback() が「もう登録済みなら何もしない」を判定するのに使う。
_ui_registered = False


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
    _ui_registered = True


def register_fallback(mcp: MCPServer) -> None:
    """apps 経由で UI 付き登録ができなかった場合だけ、素の search_products を足す。

    server.py から MCPServer 構築の**後**に呼ぶこと。UI 登録に成功していれば何もしない
    （二重登録すると ToolManager.add_tool() が「先勝ち＋警告ログのみ」で処理し、
    tools/list の説明が意図しない方に固定される）。
    """
    if _ui_registered:
        return
    mcp.add_tool(
        tools.search_products,
        description=tools.SEARCH_PRODUCTS_DESCRIPTION,
        annotations=tools.SEARCH_PRODUCTS_ANNOTATIONS,
    )
