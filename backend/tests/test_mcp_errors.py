"""MCP ツールのエラー変換のユニットテスト（DB 不要）。

MCP の SDK は例外のメッセージをそのままクライアントへ渡すので、ここが漏れると
SQLAlchemy の例外文（テーブル名・SQL 断片）がモデルに届く。既存の日本語 detail は
素通しし、握るべきものだけ握る、という線をここで固定する。
"""

import pytest
from fastapi import HTTPException

from app.mcp_server.confirm import ConfirmTokenError
from app.mcp_server.errors import (
    MSG_BAD_AUTH,
    MSG_FALLBACK,
    MSG_INTERNAL,
    McpToolError,
    domain_errors,
)


def message_of(exc: Exception) -> str:
    with pytest.raises(McpToolError) as caught:
        with domain_errors():
            raise exc
    return str(caught.value)


class TestDomainErrors:
    def test_japanese_detail_passes_through(self):
        # 既存ルーターの日本語 detail は完成した文面。写しを作らない。
        assert message_of(HTTPException(400, "在庫が不足しています")) == "在庫が不足しています"

    def test_detail_with_product_name_passes_through(self):
        assert (
            message_of(HTTPException(400, "在庫が不足しています: 琺瑯ケトル"))
            == "在庫が不足しています: 琺瑯ケトル"
        )

    def test_status_code_is_not_in_message(self):
        # HTTPException を素通しすると __str__ が "400: ..." を返す。数字は LLM には
        # ノイズで、ユーザーへの再説明にそのまま混入する。
        assert "400" not in message_of(HTTPException(400, "カートが空です"))
        assert "404" not in message_of(HTTPException(404, "Order not found"))

    def test_401_is_replaced_with_japanese_guidance(self):
        # detail が英語で、しかも「何をすれば直るか」が書かれていない唯一のケース。
        message = message_of(HTTPException(401, "Could not validate credentials"))
        assert message == MSG_BAD_AUTH
        assert "Could not validate credentials" not in message
        assert "/api/auth/login" in message or "アクセストークン" in message

    def test_401_message_does_not_ask_for_password(self):
        assert "パスワードを尋ねないでください" in message_of(
            HTTPException(401, "Could not validate credentials")
        )

    def test_404_detail_passes_through(self):
        # 英語の detail でも差し替え表を育てない（育てると detail の写しが二重管理になる）。
        assert message_of(HTTPException(404, "Product not found")) == "Product not found"

    def test_empty_detail_falls_back_to_default(self):
        assert message_of(HTTPException(400, "")) == MSG_FALLBACK

    def test_non_string_detail_falls_back_to_default(self):
        assert message_of(HTTPException(422, {"loc": ["body"], "msg": "bad"})) == MSG_FALLBACK

    def test_mcp_tool_error_is_reraised_unchanged(self):
        original = McpToolError("カートにその商品はありません（product_id=3）。")
        with pytest.raises(McpToolError) as caught:
            with domain_errors():
                raise original
        assert caught.value is original

    def test_confirm_token_error_uses_its_message(self):
        assert message_of(ConfirmTokenError("expired", "確認トークンの有効期限が切れました")) == (
            "確認トークンの有効期限が切れました"
        )

    def test_unexpected_exception_is_masked(self):
        # SQLAlchemy 風の文面（テーブル名・SQL 断片）が丸ごと外に出ないこと。
        leaky = RuntimeError('relation "cart_items" does not exist\nSELECT users.hashed_password')
        message = message_of(leaky)
        assert message == MSG_INTERNAL
        assert "cart_items" not in message
        assert "hashed_password" not in message

    def test_unexpected_exception_message_mentions_list_orders(self):
        # place_order が落ちたとき、確認せずに再試行させないための一文。
        assert "list_orders" in message_of(RuntimeError("boom"))

    def test_nothing_raised_passes_through(self):
        with domain_errors():
            value = 1 + 1
        assert value == 2
