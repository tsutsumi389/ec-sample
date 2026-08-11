"""ツールのエラー変換。

MCP の SDK は、ツールが送出した例外を JSON-RPC の error ではなく result.isError=true に
変換し、**例外のメッセージをそのままクライアントへ渡す**。つまり握らずに素通しすると
SQLAlchemy の例外文（接続文字列・テーブル名・SQL 断片）がモデルに届く。ここで受けて
定型文に置き換え、詳細は logger.exception でサーバー側にだけ残す。

既存ルーターの HTTPException.detail は素通しする。「在庫が不足しています: 琺瑯ケトル」
「カートが空です」は既に人間向けの完成した日本語で、写しを作れば必ずどちらかが古くなる。
差し替えるのは 401 だけ——detail が英語で、しかも「何をすれば直るか」が書かれていない。

ただし **日本語の detail が揃っているのは在庫・カート・購入可否の系統だけ**で、既存ルーターの
404 系は英語のまま素通しになる（"Product not found" / "Order not found" / "Cart item not
found" / "Address not found" / "Shipping address is required"）。SDK が前置する
"Error executing tool <name>: " と合わさって、日本語の会話に英語の断片が混ざる。
**それでも差し替え表をここで育てないこと**——写しを増やせば必ず片方が古くなる。
気になるなら既存ルーター側の detail を日本語に直す別 PR にする（フロントの表示にも
影響するのでこの PR のスコープ外）。

app.auth を import しないこと（backend/tests/ を DB / SECRET_KEY 非依存に保つため）。
"""

import logging
from contextlib import contextmanager

from fastapi import HTTPException

from app.mcp_server.confirm import ConfirmTokenError

logger = logging.getLogger(__name__)


class McpToolError(Exception):
    """LLM にそのまま見せてよいエラー。文面が API 契約の一部になる。"""


# 文面は SDK が "Error executing tool <name>: " を前置しても読める形にしてある。
MSG_NEED_AUTH = (
    "この操作にはログインが必要です。MCP サーバーの設定に Authorization: Bearer "
    "<アクセストークン> ヘッダを追加してください（トークンは POST /api/auth/login で"
    "取得します）。会話の中でユーザーにパスワードを尋ねないでください。"
)
MSG_BAD_AUTH = (
    "ログイン情報が無効か、期限切れです（アクセストークンの有効期間は24時間、パスワード"
    "変更時も失効します）。新しいアクセストークンを取得して MCP サーバーの設定を更新して"
    "ください。会話の中でユーザーにパスワードを尋ねないでください。"
)
MSG_EMPTY_CART = (
    "カートが空です。search_products で商品を探し、add_to_cart で入れてから "
    "preview_checkout を呼んでください。"
)
MSG_NO_ADDRESS = (
    "配送先が登録されていません。shipping_address に「宛名 / 郵便番号 / 住所 / 電話番号」を"
    "含む文字列を渡すか、ブラウザで http://localhost:3000 にログインしてマイページから"
    "配送先を登録してください（MCP からは配送先を作成できません）。"
)
# 「他人の住所」も同じ文言にする（存在の有無を教えない）。
MSG_ADDRESS_NOT_FOUND = "指定された配送先が見つかりません。list_addresses で選び直してください。"
MSG_INTERNAL = (
    "サーバー側の問題で処理できませんでした。しばらく待って同じ操作をやり直してください。"
    "place_order が失敗した場合は、注文が成立していないか list_orders で必ず確認してから"
    "再試行してください。"
)
# detail が空・非文字列だったときの最後の砦。
MSG_FALLBACK = "処理できませんでした。"

def _message(exc: HTTPException) -> str:
    """HTTPException から LLM に見せる本文を作る。

    ステータスコードは混ぜない。素通しすると HTTPException.__str__ が
    "400: 在庫が不足しています" を返し、数字がユーザーへの再説明にそのまま混入する。
    """
    # 差し替えるのは 401 だけ（detail が英語で、かつ直し方が書かれていない唯一の系統）。
    # **ここに分岐を足さないこと**——理由はモジュール docstring。表と .get() にすると
    # 行を 1 本足すのが最も簡単な形になり、禁じているものを最も破りやすい形で置くことになる。
    if exc.status_code == 401:
        return MSG_BAD_AUTH
    detail = exc.detail
    return detail if isinstance(detail, str) and detail else MSG_FALLBACK


@contextmanager
def domain_errors():
    """既存ルーターの HTTPException を、そのまま読める文面のツールエラーへ移し替える。"""
    try:
        yield
    except McpToolError:
        raise  # 二重ラップしない
    except ConfirmTokenError as exc:
        raise McpToolError(exc.message) from exc
    except HTTPException as exc:
        raise McpToolError(_message(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - 文面が外に出るので必ずここで受ける
        logger.exception("MCP ツールで想定外の例外")
        raise McpToolError(MSG_INTERNAL) from exc
