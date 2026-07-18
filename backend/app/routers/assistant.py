"""AIショッピングアシスタントのチャット API。

POST /assistant/chat は同期パスで LLM 応答（またはフォールバック）を返す。認証は任意
（get_current_user_optional）で、未ログインでもゲスト会話として利用できる。Ollama 失敗時も
source="fallback" で 200 応答し、この API がユーザーに 500 を返すことはない。

会話の永続化・所有チェック・履歴復元は services/assistant_chat に集約し、
ここは HTTP 境界の責務だけを持つ。
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional
from app.database import get_db
from app.models import User
from app.schemas import AssistantChatIn, AssistantChatOut, AssistantMessageOut
from app.services import assistant_chat

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/chat", response_model=AssistantChatOut)
def chat(
    payload: AssistantChatIn,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> AssistantChatOut:
    return assistant_chat.chat(db, current_user, payload)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[AssistantMessageOut],
)
def list_messages(
    conversation_id: str,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[AssistantMessageOut]:
    return assistant_chat.list_messages(db, conversation_id, current_user)
