"""AIショッピングアシスタントのチャット API。

POST /assistant/chat は同期パスで LLM 応答（またはフォールバック）を返す。認証は任意
（get_current_user_optional）で、未ログインでもゲスト会話として利用できる。Ollama 失敗時も
source="fallback" で 200 応答し、この API がユーザーに 500 を返すことはない。

GET /assistant/conversations/{id}/messages はウィジェット再オープン時の履歴復元用。
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional
from app.database import get_db
from app.models import (
    LISTED_STATUSES,
    AssistantConversation,
    AssistantMessage,
    Product,
    User,
)
from app.routers.products import _rating_stats, _to_product_out
from app.schemas import (
    AssistantChatIn,
    AssistantChatOut,
    AssistantMessageOut,
    RecommendationItemOut,
)
from app.services import assistant

router = APIRouter(prefix="/assistant", tags=["assistant"])

# 1 会話あたりのメッセージ上限。超過時は 400（会話の肥大化・コンテキスト溢れ防止）。
_MAX_MESSAGES = 50


def _item_out(product: Product, db: Session, reason: str | None) -> RecommendationItemOut:
    """Product を RecommendationItemOut（product + reason）に整形する。"""
    avg_rating, review_count = _rating_stats(db, product.id)
    return RecommendationItemOut(
        product=_to_product_out(product, avg_rating, review_count),
        reason=reason,
    )


def _load_conversation(
    db: Session,
    conversation_id: str,
    current_user: User | None,
    *,
    attach: bool,
) -> AssistantConversation:
    """会話を取得し所有チェックする。存在しない/他人のものは 404。

    - ログインユーザーの会話（user_id あり）→ 本人のみアクセス可（他人は 404）。
    - ゲスト会話（user_id NULL）→ UUID を知っていることが認可（サンプルアプリとして許容）。
      本番想定なら UUID 保持だけでは不十分で、署名付きセッション（HttpOnly Cookie 等）で
      ゲスト会話を端末に束縛する必要がある。ここではサンプルのため UUID 認可に留める。

    attach=True かつログイン済みのとき、ゲスト会話に user_id を紐付けて引き継ぐ。
    """
    conv = db.get(AssistantConversation, conversation_id)
    if conv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    if conv.user_id is not None:
        # 会話の所有者以外には存在を秘匿するため 404 を返す。
        if current_user is None or current_user.id != conv.user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
            )
    elif attach and current_user is not None:
        # ゲスト会話中にログインした。以降は本人の会話として紐付ける（引き継ぎ）。
        conv.user_id = current_user.id
    return conv


def _history(db: Session, conversation_id: str) -> list[tuple[str, str]]:
    """会話の過去メッセージを (role, content) の古い順で返す（プロンプト履歴用）。"""
    rows = (
        db.query(AssistantMessage.role, AssistantMessage.content)
        .filter(AssistantMessage.conversation_id == conversation_id)
        .order_by(AssistantMessage.id)
        .all()
    )
    return [(role, content) for role, content in rows]


@router.post("/chat", response_model=AssistantChatOut)
def chat(
    payload: AssistantChatIn,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> AssistantChatOut:
    # 会話の取得/作成。conversation_id が null なら新規作成する。
    if payload.conversation_id is None:
        conv = AssistantConversation(
            id=str(uuid.uuid4()),
            user_id=current_user.id if current_user is not None else None,
        )
        db.add(conv)
        db.flush()  # id を確定させてから以降のメッセージで参照する。
        history: list[tuple[str, str]] = []
    else:
        conv = _load_conversation(
            db, payload.conversation_id, current_user, attach=True
        )
        # メッセージ上限チェック（超過で新規投稿を拒否）。
        count = (
            db.scalar(
                select(func.count(AssistantMessage.id)).where(
                    AssistantMessage.conversation_id == conv.id
                )
            )
            or 0
        )
        if count >= _MAX_MESSAGES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Conversation message limit reached",
            )
        history = _history(db, conv.id)

    # ユーザーメッセージを永続化する。
    db.add(
        AssistantMessage(
            conversation_id=conv.id,
            role="user",
            content=payload.message,
            product_ids=[],
            source=None,
        )
    )

    # LLM 応答（失敗時はフォールバック）を生成する。ここは 500 を出さない。
    # ログインユーザーは行動履歴をプロンプトに注入する。ゲストは None で従来どおり。
    result = assistant.generate_reply(
        db,
        payload.message,
        history,
        user_id=current_user.id if current_user is not None else None,
    )

    # assistant メッセージを永続化する（提案商品IDと生成元を保存）。
    product_ids = [p.id for p, _ in result.products]
    db.add(
        AssistantMessage(
            conversation_id=conv.id,
            role="assistant",
            content=result.reply,
            product_ids=product_ids,
            source=result.source,
        )
    )
    db.commit()

    products = [_item_out(p, db, reason) for p, reason in result.products]
    return AssistantChatOut(
        conversation_id=conv.id,
        source=result.source,
        reply=result.reply,
        products=products,
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[AssistantMessageOut],
)
def list_messages(
    conversation_id: str,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> list[AssistantMessageOut]:
    """会話履歴を復元する。assistant 行は product_ids から商品を引き直し、
    LISTED_STATUSES を再確認して非公開化された商品はカードから落とす。
    """
    # 履歴取得は読み取りのみ（user_id の引き継ぎは chat 側で行う）。
    conv = _load_conversation(db, conversation_id, current_user, attach=False)

    messages = (
        db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == conv.id)
        .order_by(AssistantMessage.id)
        .all()
    )

    out: list[AssistantMessageOut] = []
    for msg in messages:
        products: list[RecommendationItemOut] = []
        if msg.role == "assistant" and msg.product_ids:
            # 保存順を維持しつつ商品を引き直す。
            found = {
                p.id: p
                for p in db.query(Product)
                .filter(Product.id.in_(msg.product_ids))
                .all()
            }
            for pid in msg.product_ids:
                product = found.get(pid)
                # 生成後に非公開化された商品はカードから除外する（可視性の再確認）。
                if product is None or product.status not in LISTED_STATUSES:
                    continue
                products.append(_item_out(product, db, None))
        out.append(
            AssistantMessageOut(
                role=msg.role,
                content=msg.content,
                source=msg.source,
                products=products,
                created_at=msg.created_at,
            )
        )
    return out
