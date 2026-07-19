"""商品ページの購入前Q&A API。

GET /products/{id}/questions は公開（未ログインでも蓄積された Q&A を閲覧できる）。
POST /products/{id}/questions は要ログインで、AI 回答を同期生成して永続化する。
Ollama 失敗時も source="fallback" で 201 応答し、この API がユーザーに 500 を返すことはない
（assistant と同じ設計思想）。可視性は Product.is_viewable に従う。
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Product, ProductQuestion, User
from app.schemas import ProductQuestionCreate, ProductQuestionOut
from app.services import product_qa

router = APIRouter(prefix="/products", tags=["product-qa"])

# 1 商品あたりに返す Q&A の上限（読み込み負荷の抑制）。
_MAX_QUESTIONS = 100


def _to_out(question: ProductQuestion, asker_name: str) -> ProductQuestionOut:
    return ProductQuestionOut(
        id=question.id,
        question=question.question,
        answer=question.answer,
        source=question.source,
        answerable=question.answerable,
        asker_name=asker_name,
        created_at=question.created_at,
    )


@router.get("/{product_id}/questions", response_model=list[ProductQuestionOut])
def list_questions(
    product_id: int, db: Session = Depends(get_db)
) -> list[ProductQuestionOut]:
    """商品の Q&A を新しい順に返す（公開・未ログインでも閲覧可）。"""
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )

    rows = (
        db.query(ProductQuestion, User.name)
        .join(User, ProductQuestion.user_id == User.id)
        .filter(ProductQuestion.product_id == product_id)
        .order_by(ProductQuestion.created_at.desc())
        .limit(_MAX_QUESTIONS)
        .all()
    )
    return [_to_out(question, asker_name) for question, asker_name in rows]


@router.post(
    "/{product_id}/questions",
    response_model=ProductQuestionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_question(
    product_id: int,
    payload: ProductQuestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProductQuestionOut:
    """質問を投稿し、その商品の説明文・レビューを根拠に AI 回答を同期生成して保存する。"""
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )

    # AI 回答を生成する（Ollama 失敗時は source="fallback" で返る。500 は出さない）。
    result = product_qa.answer_question(db, product, payload.question)

    question = ProductQuestion(
        id=str(uuid.uuid4()),
        product_id=product_id,
        user_id=current_user.id,
        question=payload.question,
        answer=result.answer,
        source=result.source,
        answerable=result.answerable,
    )
    db.add(question)
    db.commit()
    db.refresh(question)

    return _to_out(question, current_user.name)
