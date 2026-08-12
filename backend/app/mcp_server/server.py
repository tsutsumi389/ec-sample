"""MCP サーバー本体。既存の FastAPI アプリに /mcp として同居する。

別プロセスにしないのは、在庫・価格・購入可否の判定を HTTP 越しに二重実装しないため。
ツールは app/routers/ と app/services/ の関数を直接呼ぶ（同じ判定を書き直さない）。

ツールは素の `def` で書く。SDK 2.0 は同期のツール関数を anyio のワーカースレッドへ逃がす
ので、psycopg2 のブロッキング I/O でイベントループを塞ぐことはない（FastAPI が `def`
エンドポイントに対してやっているのと同じ扱いになる）。**`async def` で書くとこの保護が
外れる**（SDK は await するだけ）ので、DB を触るツールを async にしないこと。
"""

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

# apps_ui の import 自体が、Apps() への UI 付きツール登録（apps.tool() /
# add_html_resource()）を完了させる副作用を持つ。この import 文は
# MCPServer(extensions=[apps_ui.apps]) より**前**に実行されている必要がある——
# Apps インスタンスは MCPServer のコンストラクタ内で同期的に一度だけ
# apps.tools()/apps.resources() を読み出すため（mcp/server/mcpserver/server.py の
# _apply_extension）。構築後に apps.tool() を呼んでも例外もログも無く静かに無視される
# ので、この import を MCPServer(...) の後ろへ動かさないこと。詳細は apps_ui.py。
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
# apps_ui.apps が search_products / get_product を UI 付きで登録できていれば（= vendor JS
# が取得済みで import 時点の登録が成功していれば）そのツールについては何もしない。登録
# できていないツールだけ、従来どおり素のツールとして登録する（CLAUDE.md の「付随機能の
# 失敗で店を止めない」規律。2ツールの成否は独立に判定される——apps_ui.py 参照）。
apps_ui.register_fallback(mcp)

# streamable_http_app() は「Starlette アプリを作って返す」関数だが、副作用として
# session_manager を構成して保持する。ここで欲しいのは後者だけなので返り値は捨て、
# ASGI アプリは自分で組む（SDK が「単一の FastAPI アプリに複数の MCPServer をマウント
# する」用途向けに session_manager を公開しているのがこの使い方）。
#
# transport_security は明示する。省略すると host 引数（既定 "127.0.0.1"）を見て SDK が
# 勝手に有効化する挙動に依存することになり、将来 host を変えた瞬間に無防備になる。
#
# **これはアクセス制御ではない。** Host も Origin もクライアントが自由に書けるヘッダなので、
# curl のような非ブラウザには一切効かない（compose は 0.0.0.0:8000 で公開しているので、
# 同一 LAN からは `Host: localhost:8000` を詐称すれば素通りする）。ここが塞ぐのは
# 「被害者のブラウザを踏み台にする攻撃＝DNS リバインディング」だけ。認証は各ツールの
# require_user が担い、露出面は既存の /api と同等になる。
mcp.streamable_http_app(
    streamable_http_path="/mcp",
    # ステートレスにする。backend は uvicorn --reload で動いており、ステートフルだと
    # コードを保存するたびにセッションが消えて接続が壊れる。認証はリクエストごとの
    # Authorization ヘッダで完結しており、サーバー側にセッション状態は要らない。
    stateless_http=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        # compose のサービス名（backend:8000）は入れていない。コンテナ内から /mcp を
        # 叩くと 421 になる。将来その経路が要るときだけ "backend:*" を足すこと。
        # ワイルドカードは "host:" 前方一致なので、接続先は必ず localhost:8000 か
        # 127.0.0.1:8000 にすること（`Host: 0.0.0.0:8000` は 421 になる）。
        allowed_hosts=["localhost:*", "127.0.0.1:*", "[::1]:*"],
        # SDK 既定と同じローカルオリジンのみ許可。ここを [] にすると「Origin ヘッダを
        # 送るクライアントは全部 403」になるが、それで追加で塞げるのは「localhost:3000 の
        # 自分のフロントから /mcp を叩く」経路だけ——設計上そもそも呼ばない経路であり、
        # 見返りに「繋がらないのに 403 "Invalid Origin header" としか出ない」という
        # 切り分けの難しい失敗を買うことになる。外部オリジンはこの既定でも 403 で落ちる。
        allowed_origins=["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"],
    ),
)


class _McpASGIApp:
    """session_manager を ASGI アプリとして Route にぶら下げるための器。

    SDK にも同じものが StreamableHTTPASGIApp としてあるが、あれは mcp.server の __all__ に
    無い準内部シンボルなので写しを置く（session_manager 側は「単一の FastAPI アプリに複数の
    MCPServer をマウントする」用途向けに公開が明言されている正規 API）。handle_request は
    RequestBodyLimitMiddleware 込みの asgi_app を呼ぶので、4MiB のボディ上限も transport
    security も従来どおり効く。

    関数ではなくクラスにするのは必須。starlette の Route は endpoint が関数・メソッドだと
    request_response() でラップしてしまい、ASGI アプリとして扱われなくなる。
    """

    def __init__(self, session_manager) -> None:
        self._session_manager = session_manager

    async def __call__(self, scope, receive, send) -> None:
        await self._session_manager.handle_request(scope, receive, send)


mcp_asgi_app = _McpASGIApp(mcp.session_manager)
