"""MCP ツールの認証。

ヘッダは Context から取る。SDK 自身のコメントどおり「ヘッダはクライアントが自由に書ける
入力であって身元の主張ではない」ので、必ず app.auth._resolve_user_from_token() を通す
（iat と password_changed_at による失効判定をそのまま効かせる。jwt.decode を自分で書かない）。

**ユーザーを絶対にキャッシュしない。** Context.request_context.request は JSON-RPC の
メッセージごとに差し替わるので、ツール呼び出しのたびにヘッダから引き直す。モジュール変数や
セッションに載せると、最初の呼び出し時点の身元に固定され、以後の全操作がその人として動く。

visitor_id（X-Visitor-Id）は読まない。あれは計測専用の端末IDで、認証には一切使わない。
"""

from fastapi import HTTPException
from mcp.server.mcpserver import Context
from sqlalchemy.orm import Session

from app.auth import _resolve_user_from_token
from app.mcp_server.errors import MSG_NEED_AUTH, McpToolError
from app.models import User


def _bearer_token(ctx: Context) -> str | None:
    headers = ctx.headers or {}  # キーはすべて小文字で入っている
    raw = headers.get("authorization", "")
    scheme, _, credentials = raw.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = credentials.strip()
    return token or None


def require_user(ctx: Context, db: Session) -> User:
    """認証必須ツール用。トークンが無い・無効なら例外。

    無効なトークンを匿名にフォールバックさせないこと（fail closed）。書き込み経路で
    get_current_user_optional 相当の握り潰しをやると、期限切れが「ゲスト」に化ける。
    """
    token = _bearer_token(ctx)
    if token is None:
        raise McpToolError(MSG_NEED_AUTH)
    # HTTPException(401) は呼び出し側の domain_errors() が MSG_BAD_AUTH に翻訳する。
    return _resolve_user_from_token(token, db)


def optional_user(ctx: Context, db: Session) -> User | None:
    """商品検索用の任意認証。無効トークンでも 401 にせず匿名扱い。

    読み取り専用のカタログ操作だけに使う（get_current_user_optional と同じ流儀）。
    """
    token = _bearer_token(ctx)
    if token is None:
        return None
    try:
        return _resolve_user_from_token(token, db)
    except HTTPException:
        # 無効なトークンはすべて匿名に落とす（auth.get_current_user_optional と同じ意味論。
        # 無効なトークンが 401 として揃うことは _resolve_user_from_token 側が担保している）。
        return None
