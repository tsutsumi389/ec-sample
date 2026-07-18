"""AI ショッピングアシスタントの会話フロー（永続化・所有チェック・履歴復元）。

LLM 応答の生成そのものは services/assistant.generate_reply に委譲し、ここは
会話の作成/継続、メッセージの永続化、所有チェック、履歴復元といった
アプリケーションフローとトランザクション境界を担う。
"""

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.presenters import to_recommendation_item
from app.models import (
    LISTED_STATUSES,
    AssistantConversation,
    AssistantMessage,
    Product,
    User,
)
from app.repositories import assistant as assistant_repo
from app.repositories import product as product_repo
from app.repositories import review as review_repo
from app.schemas import (
    AssistantChatIn,
    AssistantChatOut,
    AssistantMessageOut,
    RecommendationItemOut,
)
from app.services import assistant

# 1 会話あたりのメッセージ上限（会話の肥大化・コンテキスト溢れ防止）。
_MAX_MESSAGES = 50


def _rec_item(db: Session, product: Product, reason: str | None) -> RecommendationItemOut:
    avg_rating, review_count = review_repo.rating_stats(db, product.id)
    return to_recommendation_item(product, avg_rating, review_count, reason)


def _load_conversation(
    db: Session,
    conversation_id: str,
    current_user: User | None,
    *,
    attach: bool,
) -> AssistantConversation:
    """会話を取得し所有チェックする。存在しない/他人のものは 404（存在を秘匿）。

    - ログインユーザーの会話（user_id あり）→ 本人のみアクセス可（他人は 404）。
    - ゲスト会話（user_id NULL）→ UUID を知っていることが認可（サンプルアプリとして許容）。
    attach=True かつログイン済みのとき、ゲスト会話に user_id を紐付けて引き継ぐ。
    """
    conv = assistant_repo.get_conversation(db, conversation_id)
    if conv is None:
        raise NotFoundError("Conversation not found")
    if conv.user_id is not None:
        if current_user is None or current_user.id != conv.user_id:
            raise NotFoundError("Conversation not found")
    elif attach and current_user is not None:
        # ゲスト会話中にログインした。以降は本人の会話として紐付ける（引き継ぎ）。
        conv.user_id = current_user.id
    return conv


def chat(
    db: Session, current_user: User | None, payload: AssistantChatIn
) -> AssistantChatOut:
    # 会話の取得/作成。conversation_id が null なら新規作成する。
    if payload.conversation_id is None:
        conv = AssistantConversation(
            id=str(uuid.uuid4()),
            user_id=current_user.id if current_user is not None else None,
        )
        assistant_repo.add(db, conv)
        db.flush()  # id を確定させてから以降のメッセージで参照する。
        history: list[tuple[str, str]] = []
    else:
        conv = _load_conversation(
            db, payload.conversation_id, current_user, attach=True
        )
        if assistant_repo.message_count(db, conv.id) >= _MAX_MESSAGES:
            raise BusinessRuleError("Conversation message limit reached")
        history = assistant_repo.history_pairs(db, conv.id)

    # ユーザーメッセージを永続化する。
    assistant_repo.add(
        db,
        AssistantMessage(
            conversation_id=conv.id,
            role="user",
            content=payload.message,
            product_ids=[],
            source=None,
        ),
    )

    # LLM 応答（失敗時はフォールバック）を生成する。ここは 500 を出さない。
    result = assistant.generate_reply(
        db,
        payload.message,
        history,
        user_id=current_user.id if current_user is not None else None,
    )

    # assistant メッセージを永続化する（提案商品IDと生成元を保存）。
    product_ids = [p.id for p, _ in result.products]
    assistant_repo.add(
        db,
        AssistantMessage(
            conversation_id=conv.id,
            role="assistant",
            content=result.reply,
            product_ids=product_ids,
            source=result.source,
        ),
    )
    db.commit()

    products = [_rec_item(db, p, reason) for p, reason in result.products]
    return AssistantChatOut(
        conversation_id=conv.id,
        source=result.source,
        reply=result.reply,
        products=products,
    )


def list_messages(
    db: Session, conversation_id: str, current_user: User | None
) -> list[AssistantMessageOut]:
    """会話履歴を復元する。assistant 行は product_ids から商品を引き直し、
    LISTED_STATUSES を再確認して非公開化された商品はカードから落とす。
    """
    conv = _load_conversation(db, conversation_id, current_user, attach=False)

    messages = assistant_repo.list_messages(db, conv.id)

    out: list[AssistantMessageOut] = []
    for msg in messages:
        products: list[RecommendationItemOut] = []
        if msg.role == "assistant" and msg.product_ids:
            # 保存順を維持しつつ商品を引き直す。
            found = {p.id: p for p in product_repo.list_by_ids(db, msg.product_ids)}
            for pid in msg.product_ids:
                product = found.get(pid)
                # 生成後に非公開化された商品はカードから除外する（可視性の再確認）。
                if product is None or product.status not in LISTED_STATUSES:
                    continue
                products.append(_rec_item(db, product, None))
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
