"""AI アシスタントの会話・メッセージのデータアクセス。"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AssistantConversation, AssistantMessage


def get_conversation(db: Session, conversation_id: str) -> AssistantConversation | None:
    return db.get(AssistantConversation, conversation_id)


def message_count(db: Session, conversation_id: str) -> int:
    return (
        db.scalar(
            select(func.count(AssistantMessage.id)).where(
                AssistantMessage.conversation_id == conversation_id
            )
        )
        or 0
    )


def history_pairs(db: Session, conversation_id: str) -> list[tuple[str, str]]:
    """会話の過去メッセージを (role, content) の古い順で返す（プロンプト履歴用）。"""
    rows = (
        db.query(AssistantMessage.role, AssistantMessage.content)
        .filter(AssistantMessage.conversation_id == conversation_id)
        .order_by(AssistantMessage.id)
        .all()
    )
    return [(role, content) for role, content in rows]


def list_messages(db: Session, conversation_id: str) -> list[AssistantMessage]:
    return (
        db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == conversation_id)
        .order_by(AssistantMessage.id)
        .all()
    )


def add(db: Session, obj) -> None:
    db.add(obj)
