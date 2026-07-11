"""LLM に渡すカタログ整形と、返ってきた SID の正規化・照合の共通ロジック。

レコメンド（recommendation.py）とショッピングアシスタント（assistant.py）で
同じ「候補カタログの 1 行表現」「SID→Product 照合によるハルシネーション対策」を
使うため、重複実装せずここに集約する。PII（氏名・メール等）は一切含めない。
"""

from typing import Protocol

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Product, Review

# LLM が返した reason を保存する際の最大長（保険の切り詰め）。
REASON_MAX_LEN = 200


class _HasSidReason(Protocol):
    """match_products が受け取る要素の最小インターフェース（sid / reason を持つ）。"""

    sid: str
    reason: str


def _format_price(price: int) -> str:
    return f"¥{price:,}"


def catalog_line(product: Product, sid: str, avg_rating: float | None) -> str:
    """候補・履歴を LLM に渡す 1 行表現。PII は一切含めない。

    価格は必ず effective_price（セール価格があればそれ）を使う。
    """
    category = product.category.name if product.category is not None else "その他"
    rating = f"★{avg_rating:.1f}" if avg_rating is not None else "★-"
    return (
        f"SID {sid}: {product.name} / {category} / "
        f"{_format_price(product.effective_price)} / {rating}"
    )


def avg_ratings(db: Session, product_ids: set[int]) -> dict[int, float]:
    """商品IDごとの平均評価を返す（レビューが無い商品は含めない）。"""
    if not product_ids:
        return {}
    rows = (
        db.query(Review.product_id, func.avg(Review.rating))
        .filter(Review.product_id.in_(product_ids))
        .group_by(Review.product_id)
        .all()
    )
    return {pid: float(avg) for pid, avg in rows if avg is not None}


def normalize_sid(raw_sid: str) -> str:
    """LLM が返した SID 文字列を候補マップ照合用に正規化する。

    モデルがカタログの "SID 4-0-2:" 表記を真似て "SID 4-0-2" のようにラベル付きで
    返すことがあるため、先頭の "SID " を除去してから照合する。
    """
    s = (raw_sid or "").strip()
    if s[:4].upper() == "SID ":
        s = s[4:].strip()
    return s


def match_products(
    items: list[_HasSidReason],
    sid_to_product: dict[str, Product],
    *,
    max_items: int,
    reason_max_len: int = REASON_MAX_LEN,
) -> list[tuple[Product, str | None]]:
    """LLM の返した items を候補マップと照合し、採用した (Product, reason) を返す。

    ハルシネーション対策: 候補集合に存在する SID のものだけ採用する。SID は正規化
    （"SID " プレフィックス除去）してから照合し、元の文字列でも一度引く。重複商品は
    除外し、reason は reason_max_len で切り詰める（空なら None）。max_items 件で打ち切る。
    """
    adopted: list[tuple[Product, str | None]] = []
    seen_products: set[int] = set()
    for item in items:
        raw_sid = getattr(item, "sid", None)
        product = sid_to_product.get(normalize_sid(raw_sid or "")) or sid_to_product.get(
            raw_sid
        )
        if product is None or product.id in seen_products:
            continue
        seen_products.add(product.id)
        reason = (getattr(item, "reason", "") or "").strip()[:reason_max_len] or None
        adopted.append((product, reason))
        if len(adopted) >= max_items:
            break
    return adopted
