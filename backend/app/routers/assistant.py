"""AIショッピングアシスタントのチャット API。

POST /assistant/chat は同期パスで LLM 応答（またはフォールバック）を返す。認証は任意
（get_current_user_optional）で、未ログインでもゲスト会話として利用できる。Ollama 失敗時も
source="fallback" で 200 応答し、この API がユーザーに 500 を返すことはない。

GET /assistant/conversations/{id}/messages はウィジェット再オープン時の履歴復元用。
"""

import uuid
from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
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
from app.schemas import (
    AssistantChatIn,
    AssistantChatOut,
    AssistantMessageOut,
)
from app.services import assistant, product_view

router = APIRouter(prefix="/assistant", tags=["assistant"])

# 1 会話あたりのメッセージ上限。超過時は 400（会話の肥大化・コンテキスト溢れ防止）。
_MAX_MESSAGES = 50


def _listed_products_by_ids(db: Session, ids: Sequence[int]) -> dict[int, Product]:
    """公開中の商品だけを ID の集合から 1 クエリで引く。

    status は Python 側で弾かずクエリに添える（弾く形にすると、次にこのループへ
    手を入れた人が絞りを落としても誰も気づけない）。
    """
    if not ids:
        return {}
    products = (
        db.execute(
            select(Product).where(
                Product.id.in_(set(ids)), Product.status.in_(LISTED_STATUSES)
            )
        )
        .scalars()
        .all()
    )
    return {p.id: p for p in products}


def _load_conversation(
    db: Session,
    conversation_id: str,
    current_user: User | None,
    *,
    attach: bool,
) -> AssistantConversation:
    """会話を取得し所有チェックする。存在しない/他人のものは 404。

    - ログインユーザーの会話（user_id あり）→ 本人のみアクセス可（他人は 404）。
    - ゲスト会話（user_id NULL）→ UUID を知っていることが認可。本番想定なら署名付き
      セッション（HttpOnly Cookie 等）で端末に束縛する必要があるが、サンプルのため留める。

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
        # 履歴はどのみち全件引くので、件数はその長さで見る（_history は絞り込みも
        # ページングもしないため COUNT と必ず一致する。別途 COUNT を投げると往復が1回増える）。
        history = _history(db, conv.id)
        if len(history) >= _MAX_MESSAGES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Conversation message limit reached",
            )

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
    # page_context（いま開いている画面）は**メッセージごと**に受け取る。接岸したサイドバーは
    # ページ遷移で閉じないので、1 つの会話の途中で見ている画面が変わる（会話に紐づけると
    # 3 画面渡り歩いたあとの「これ」が最初の商品を指し続ける）。商品の実体はサービス側が
    # product_id から引き直す（クライアントの申告した商品名を信じない）。
    result = assistant.generate_reply(
        db,
        payload.message,
        history,
        user_id=current_user.id if current_user is not None else None,
        page_context=payload.page_context,
    )

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

    return AssistantChatOut(
        conversation_id=conv.id,
        source=result.source,
        reply=result.reply,
        products=product_view.to_item_outs(db, result.products),
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

    # 商品と評価は全メッセージぶんを先に 1 回ずつ引く。メッセージごとに引くと、
    # 会話上限 50（= assistant 行は最大 25）× 提案件数ぶんの往復になる。
    all_ids = [
        pid
        for msg in messages
        if msg.role == "assistant"
        for pid in (msg.product_ids or [])
    ]
    found = _listed_products_by_ids(db, all_ids)
    # カードは商品ごとに 1 回だけ組み、pid で引けるようにする（同じ商品が複数メッセージに
    # 出てきても組み直さない）。評価の引き当ても to_item_outs 内で 1 クエリに畳まれる。
    card_by_id = {
        item.product.id: item
        for item in product_view.to_item_outs(db, [(p, None) for p in found.values()])
    }

    return [
        AssistantMessageOut(
            role=msg.role,
            content=msg.content,
            source=msg.source,
            products=[
                card_by_id[pid]
                for pid in (msg.product_ids or [])
                if msg.role == "assistant" and pid in card_by_id
            ],
            created_at=msg.created_at,
        )
        for msg in messages
    ]
