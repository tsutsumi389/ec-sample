"""MCP サーバー本体。既存の FastAPI アプリに /mcp として同居する。

別プロセスにしないのは、在庫・価格・購入可否の判定を HTTP 越しに二重実装しないため。
"""

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

# この import 自体が Apps() への UI 付きツール登録を完了させる副作用を持つ。**MCPServer(...)
# より後ろへ動かさないこと**——構築後に apps.tool() を呼んでも例外もログも無く無視され、
# UI だけが静かに消える（詳細は apps_ui.py）。
from app.mcp_server import apps_ui, checkout, tools

INSTRUCTIONS = """\
ひびの商店（家庭用品のECサイト）のカタログ・カート・注文を操作するツール群です。

- 商品検索と商品詳細はログイン不要です。
- カート操作・配送先・注文にはログインが必要で、Authorization: Bearer <アクセストークン>
  ヘッダをこのMCPサーバーの設定に入れておく必要があります。
  会話の中でユーザーにパスワードを尋ねないでください。
- 購入は必ず preview_checkout →（ユーザーへ内容を提示して同意を得る）→ place_order の
  順で行います。preview_checkout を飛ばして注文を確定することはできません。
"""

mcp = MCPServer(
    name="hibino",
    title="ひびの商店",
    version="0.1.0",
    instructions=INSTRUCTIONS,
    extensions=[apps_ui.apps],
)

tools.register(mcp)
checkout.register(mcp)
# UI 付きで登録できなかったツールだけ素のツールとして登録する（成否はツールごとに独立。
# apps_ui.py 参照）。
apps_ui.register_fallback(mcp)

# streamable_http_app() の返り値（Starlette アプリ）は捨て、副作用で構成される
# session_manager だけを使って ASGI アプリを自分で組む。SDK が session_manager を公開して
# いるのは、まさにこの「単一の FastAPI アプリに複数の MCPServer をマウントする」用途のため。
#
# transport_security は明示する。省略すると host 引数（既定 "127.0.0.1"）を見て SDK が
# 勝手に有効化する挙動に依存することになり、将来 host を変えた瞬間に無防備になる。
#
# **これはアクセス制御ではない。** Host も Origin もクライアントが自由に書けるヘッダなので、
# curl のような非ブラウザには一切効かない。ここが塞ぐのは「被害者のブラウザを踏み台に
# する攻撃＝DNS リバインディング」だけで、認証は各ツールの require_user が担う。
mcp.streamable_http_app(
    streamable_http_path="/mcp",
    # backend は uvicorn --reload で動いており、ステートフルだとコードを保存するたびに
    # セッションが消えて接続が壊れる。認証はリクエストごとのヘッダで完結している。
    stateless_http=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        # compose のサービス名（backend:8000）は入れていないので、コンテナ内から /mcp を
        # 叩くと 421 になる（要るときだけ "backend:*" を足す）。ワイルドカードは "host:" の
        # 前方一致なので `Host: 0.0.0.0:8000` も 421。
        allowed_hosts=["localhost:*", "127.0.0.1:*", "[::1]:*"],
        # SDK 既定と同じローカルオリジンのみ許可。[] にしても追加で塞げるのは「自分の
        # フロントから /mcp を叩く」経路だけで、見返りに「繋がらないのに 403 "Invalid
        # Origin header" としか出ない」切り分けの難しい失敗を買う。外部オリジンは既定でも 403。
        allowed_origins=["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"],
    ),
)


class _McpASGIApp:
    """session_manager を ASGI アプリとして Route にぶら下げるための器。

    SDK の StreamableHTTPASGIApp は mcp.server の __all__ に無い準内部シンボルなので写しを
    置く。handle_request は RequestBodyLimitMiddleware 込みの asgi_app を呼ぶので、4MiB の
    ボディ上限も transport security も従来どおり効く。

    関数ではなくクラスにするのは必須。starlette の Route は endpoint が関数・メソッドだと
    request_response() でラップしてしまい、ASGI アプリとして扱われなくなる。
    """

    def __init__(self, session_manager) -> None:
        self._session_manager = session_manager

    async def __call__(self, scope, receive, send) -> None:
        await self._session_manager.handle_request(scope, receive, send)


mcp_asgi_app = _McpASGIApp(mcp.session_manager)
