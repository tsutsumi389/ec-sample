"""ORM モデル → 出力スキーマ（DTO）への純変換。

DB アクセスを一切行わない純粋関数だけを置く（引数で受け取った ORM オブジェクトと
集計値をスキーマに詰め替えるだけ）。従来 routers/products.py に置かれ、
home/recommendations/assistant から router 越しに import されていた
`_to_product_out` 相当をここへ集約し、router 間の相互依存を解消する。

平均評価・レビュー数などの集計値は呼び出し側（service / repository）が用意して渡す。
"""

from app.models import CartItem, Product, Review, WishlistItem
from app.schemas import (
    CartItemOut,
    ProductOut,
    RecommendationItemOut,
    ReviewOut,
    WishlistItemOut,
)


def to_product_out(
    product: Product, avg_rating: float | None = None, review_count: int = 0
) -> ProductOut:
    """Product を ProductOut に変換し、集計値（平均評価・レビュー数）を差し込む。"""
    out = ProductOut.model_validate(product)
    return out.model_copy(update={"avg_rating": avg_rating, "review_count": review_count})


def to_recommendation_item(
    product: Product,
    avg_rating: float | None = None,
    review_count: int = 0,
    reason: str | None = None,
) -> RecommendationItemOut:
    """Product + おすすめ理由を RecommendationItemOut（product + reason）に変換する。"""
    return RecommendationItemOut(
        product=to_product_out(product, avg_rating, review_count),
        reason=reason,
    )


def to_review_out(review: Review, user_name: str) -> ReviewOut:
    """Review と投稿者名を ReviewOut に変換する。"""
    return ReviewOut(
        id=review.id,
        product_id=review.product_id,
        user_id=review.user_id,
        user_name=user_name,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )


def to_cart_item_out(item: CartItem) -> CartItemOut:
    """CartItem を CartItemOut に変換する（小計は実売価格 × 数量）。"""
    return CartItemOut(
        id=item.id,
        product=to_product_out(item.product),
        quantity=item.quantity,
        subtotal=item.product.effective_price * item.quantity,
    )


def to_wishlist_item_out(item: WishlistItem) -> WishlistItemOut:
    """WishlistItem を WishlistItemOut に変換する。"""
    return WishlistItemOut(
        id=item.id,
        product=to_product_out(item.product),
        created_at=item.created_at,
    )
