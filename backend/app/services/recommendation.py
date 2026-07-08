"""レコメンドのプロフィール構築・候補抽出・LLM生成・人気順フォールバック。

LLM 生成はリクエストの同期パスに置かず、generate_for_user を BackgroundTasks で
呼ぶ。Ollama が使えない場合でも get_popular_products の人気順フォールバックで
API は常に応答する。バックグラウンドタスクは自前で DB セッションを開閉する。
"""

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL
from app.models import (
    LISTED_STATUSES,
    CartItem,
    Order,
    OrderItem,
    Product,
    ProductEmbedding,
    RecommendationState,
    Review,
    UserRecommendation,
    WishlistItem,
)

logger = logging.getLogger(__name__)

# 行動種別ごとの重み（プロフィールベクトルの加重平均に使う）。
_BEHAVIOR_WEIGHTS = {
    "purchase": 3.0,
    "cart": 2.0,
    "wishlist": 2.0,
    "review": 1.0,
}

# LLM に渡す候補件数と保存する reason の最大長。
_CANDIDATE_LIMIT = 20
_REASON_MAX_LEN = 200


@dataclass
class Profile:
    """ユーザの行動から作ったプロフィール。"""

    profile_hash: str
    profile_vec: np.ndarray
    # (種別, product_id, weight) の行動一覧（履歴プロンプト用）。
    behaviors: list[tuple[str, int, float]] = field(default_factory=list)
    # 候補から除外する商品（購入済み + カート内）。
    exclude_ids: set[int] = field(default_factory=set)


class _LLMRecItem(BaseModel):
    sid: str
    reason: str


class _LLMRecResponse(BaseModel):
    items: list[_LLMRecItem]


def _collect_behaviors(db: Session, user_id: int) -> list[tuple[str, int, float]]:
    """購入・カート・お気に入り・高評価レビューを (種別, product_id, weight) で集める。"""
    behaviors: list[tuple[str, int, float]] = []

    # 購入（cancelled 以外の注文の明細）。
    purchased_rows = (
        db.query(OrderItem.product_id)
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.user_id == user_id, Order.status != "cancelled")
        .distinct()
        .all()
    )
    for (pid,) in purchased_rows:
        behaviors.append(("purchase", pid, _BEHAVIOR_WEIGHTS["purchase"]))

    # カート内。
    cart_rows = (
        db.query(CartItem.product_id).filter(CartItem.user_id == user_id).all()
    )
    for (pid,) in cart_rows:
        behaviors.append(("cart", pid, _BEHAVIOR_WEIGHTS["cart"]))

    # お気に入り。
    wish_rows = (
        db.query(WishlistItem.product_id)
        .filter(WishlistItem.user_id == user_id)
        .all()
    )
    for (pid,) in wish_rows:
        behaviors.append(("wishlist", pid, _BEHAVIOR_WEIGHTS["wishlist"]))

    # 高評価（rating>=4）レビュー。
    review_rows = (
        db.query(Review.product_id)
        .filter(Review.user_id == user_id, Review.rating >= 4)
        .all()
    )
    for (pid,) in review_rows:
        behaviors.append(("review", pid, _BEHAVIOR_WEIGHTS["review"]))

    return behaviors


def get_exclude_ids(db: Session, user_id: int) -> set[int]:
    """人気順フォールバックで除外する商品（購入済み + カート内）。お気に入りは除外しない。"""
    purchased = (
        db.query(OrderItem.product_id)
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.user_id == user_id, Order.status != "cancelled")
        .distinct()
        .all()
    )
    cart = db.query(CartItem.product_id).filter(CartItem.user_id == user_id).all()
    return {pid for (pid,) in purchased} | {pid for (pid,) in cart}


def build_profile(db: Session, user_id: int) -> Profile | None:
    """ユーザ行動からプロフィールを構築する。行動ゼロ・埋め込み欠損時は None。"""
    behaviors = _collect_behaviors(db, user_id)
    if not behaviors:
        return None

    # profile_hash は種別:product_id をソートして連結した文字列の sha256。
    keys = sorted(f"{kind}:{pid}" for kind, pid, _ in behaviors)
    profile_hash = hashlib.sha256("|".join(keys).encode("utf-8")).hexdigest()

    # 除外集合（購入済み + カート内）。お気に入りは除外しない。
    exclude_ids = {pid for kind, pid, _ in behaviors if kind in ("purchase", "cart")}

    # 対象商品の埋め込みを引いて加重平均でプロフィールベクトルを作る。
    product_ids = {pid for _, pid, _ in behaviors}
    embeddings = {
        e.product_id: np.array(e.embedding, dtype=np.float64)
        for e in db.query(ProductEmbedding)
        .filter(ProductEmbedding.product_id.in_(product_ids))
        .all()
    }
    if not embeddings:
        return None

    weighted_sum = None
    total_weight = 0.0
    for _kind, pid, weight in behaviors:
        vec = embeddings.get(pid)
        if vec is None:
            continue
        weighted_sum = vec * weight if weighted_sum is None else weighted_sum + vec * weight
        total_weight += weight

    if weighted_sum is None or total_weight == 0.0:
        return None

    profile_vec = weighted_sum / total_weight
    return Profile(
        profile_hash=profile_hash,
        profile_vec=profile_vec,
        behaviors=behaviors,
        exclude_ids=exclude_ids,
    )


def get_candidates(
    db: Session,
    profile_vec: np.ndarray,
    exclude_ids: set[int],
    limit: int = _CANDIDATE_LIMIT,
) -> list[tuple[Product, ProductEmbedding]]:
    """プロフィールベクトルの pgvector コサイン近傍を候補として返す。

    LISTED_STATUSES のみ・exclude_ids 除外。埋め込みが無ければ空リスト。
    """
    stmt = (
        select(Product, ProductEmbedding)
        .join(ProductEmbedding, ProductEmbedding.product_id == Product.id)
        .where(Product.status.in_(LISTED_STATUSES))
    )
    if exclude_ids:
        stmt = stmt.where(Product.id.notin_(exclude_ids))
    stmt = stmt.order_by(
        ProductEmbedding.embedding.cosine_distance(profile_vec.tolist())
    ).limit(limit)
    return db.execute(stmt).all()


def get_popular_products(
    db: Session, limit: int, exclude_ids: set[int] | None = None
) -> list[Product]:
    """人気順の商品を返す（LLM フォールバック / 未ログイン時に使う）。

    集計: status != 'cancelled' の注文の order_items を集計し
    購入数 desc → 平均評価 desc → Product.created_at desc。
    LISTED_STATUSES のみ。exclude_ids は購入済み + カート内を想定。
    """
    purchase_subq = (
        select(
            OrderItem.product_id.label("product_id"),
            func.coalesce(func.sum(OrderItem.quantity), 0).label("purchased"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(Order.status != "cancelled")
        .group_by(OrderItem.product_id)
        .subquery()
    )
    rating_subq = (
        select(
            Review.product_id.label("product_id"),
            func.avg(Review.rating).label("avg_rating"),
        )
        .group_by(Review.product_id)
        .subquery()
    )

    stmt = (
        select(Product)
        .outerjoin(purchase_subq, purchase_subq.c.product_id == Product.id)
        .outerjoin(rating_subq, rating_subq.c.product_id == Product.id)
        .where(Product.status.in_(LISTED_STATUSES))
    )
    if exclude_ids:
        stmt = stmt.where(Product.id.notin_(exclude_ids))
    stmt = stmt.order_by(
        func.coalesce(purchase_subq.c.purchased, 0).desc(),
        rating_subq.c.avg_rating.desc().nullslast(),
        Product.created_at.desc(),
        Product.id.desc(),
    ).limit(limit)

    return list(db.execute(stmt).scalars().all())


def _format_price(price: int) -> str:
    return f"¥{price:,}"


def _catalog_line(product: Product, sid: str, avg_rating: float | None) -> str:
    """候補・履歴を LLM に渡す 1 行表現。PII は一切含めない。"""
    category = product.category.name if product.category is not None else "その他"
    rating = f"★{avg_rating:.1f}" if avg_rating is not None else "★-"
    return (
        f"SID {sid}: {product.name} / {category} / "
        f"{_format_price(product.effective_price)} / {rating}"
    )


def _avg_ratings(db: Session, product_ids: set[int]) -> dict[int, float]:
    if not product_ids:
        return {}
    rows = (
        db.query(Review.product_id, func.avg(Review.rating))
        .filter(Review.product_id.in_(product_ids))
        .group_by(Review.product_id)
        .all()
    )
    return {pid: float(avg) for pid, avg in rows if avg is not None}


def _build_messages(
    db: Session,
    profile: Profile,
    candidates: list[tuple[Product, ProductEmbedding]],
) -> tuple[list[dict], dict[str, Product]]:
    """chat 用メッセージと SID→Product の候補マップを組み立てる。"""
    candidate_ids = {p.id for p, _ in candidates}
    history_ids = {pid for _, pid, _ in profile.behaviors}
    avg_map = _avg_ratings(db, candidate_ids | history_ids)

    # 候補カタログ（SID で列挙）。SID→Product を採用判定に使う。
    sid_to_product: dict[str, Product] = {}
    catalog_lines: list[str] = []
    for product, emb in candidates:
        sid = emb.semantic_id or f"p{product.id}"
        sid_to_product[sid] = product
        catalog_lines.append(_catalog_line(product, sid, avg_map.get(product.id)))

    # 顧客履歴も SID 列で表現する（埋め込みのある商品のみ）。
    hist_embeddings = {
        e.product_id: e
        for e in db.query(ProductEmbedding)
        .filter(ProductEmbedding.product_id.in_(history_ids))
        .all()
    }
    history_products = {
        p.id: p
        for p in db.query(Product).filter(Product.id.in_(history_ids)).all()
    }
    history_lines: list[str] = []
    for kind, pid, _weight in profile.behaviors:
        emb = hist_embeddings.get(pid)
        prod = history_products.get(pid)
        if emb is None or prod is None:
            continue
        label = {
            "purchase": "購入",
            "cart": "カート",
            "wishlist": "お気に入り",
            "review": "高評価",
        }.get(kind, kind)
        sid = emb.semantic_id or f"p{pid}"
        history_lines.append(f"[{label}] {_catalog_line(prod, sid, avg_map.get(pid))}")

    system = (
        "あなたは生活道具店『Hibino』のベテラン店員です。"
        "お客様の購入・お気に入り履歴から好みを読み取り、在庫のある候補商品の中から"
        "おすすめを選び、その理由を親しみやすい一言で添えてください。"
        "必ず候補カタログに載っている SID の商品だけを選び、"
        "存在しない商品を作り出してはいけません。理由は日本語で 80 字以内、簡潔に。"
    )
    user = (
        "【お客様のこれまでの行動】\n"
        + ("\n".join(history_lines) if history_lines else "（履歴なし）")
        + "\n\n【おすすめ候補カタログ】\n"
        + "\n".join(catalog_lines)
        + "\n\nこの中から相性の良い商品を最大 8 件、rank 順（おすすめ度が高い順）で"
        " 選び、それぞれ sid と reason を返してください。"
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    return messages, sid_to_product


def generate_for_user(db_session_factory: sessionmaker, user_id: int) -> None:
    """BackgroundTasks から呼ぶ LLM 生成本体。自前でセッションを開閉する。

    state を generating にし、候補取得 → Ollama chat → 検証 → UserRecommendation を
    丸ごと差し替え → state ready。例外時は state failed + 警告ログ。
    """
    import ollama  # 遅延 import（Ollama 未導入環境でも起動時に落とさない）

    db = db_session_factory()
    try:
        profile = build_profile(db, user_id)
        if profile is None:
            # 行動が無い/埋め込み欠損。生成不能なので failed にしてフォールバック継続。
            _set_state(db, user_id, status="failed", profile_hash=None)
            return

        _set_state(db, user_id, status="generating", profile_hash=profile.profile_hash)

        candidates = get_candidates(db, profile.profile_vec, profile.exclude_ids)
        if not candidates:
            _set_state(db, user_id, status="failed", profile_hash=profile.profile_hash)
            return

        messages, sid_to_product = _build_messages(db, profile, candidates)

        client = ollama.Client(host=OLLAMA_BASE_URL, timeout=120)
        response = client.chat(
            model=OLLAMA_CHAT_MODEL,
            messages=messages,
            format=_LLMRecResponse.model_json_schema(),
            options={"temperature": 0.3},
        )
        # ollama>=0.4 は typed オブジェクト / 旧版は dict。両対応で content を取る。
        message = getattr(response, "message", None)
        if message is None:
            message = response["message"]
        content = getattr(message, "content", None)
        if content is None:
            content = message["content"]
        parsed = _LLMRecResponse.model_validate_json(content)

        # ハルシネーション対策: 候補集合に存在する SID のものだけ採用。
        adopted: list[tuple[Product, str]] = []
        seen_products: set[int] = set()
        for item in parsed.items:
            # モデルがカタログの "SID 4-0-2:" 表記を真似て "SID 4-0-2" のように
            # ラベル付きで返すことがあるため、先頭の "SID " を除去して照合する。
            raw_sid = (item.sid or "").strip()
            if raw_sid[:4].upper() == "SID ":
                raw_sid = raw_sid[4:].strip()
            product = sid_to_product.get(raw_sid) or sid_to_product.get(item.sid)
            if product is None or product.id in seen_products:
                continue
            seen_products.add(product.id)
            reason = (item.reason or "").strip()[:_REASON_MAX_LEN] or None
            adopted.append((product, reason))
            if len(adopted) >= 8:
                break

        if not adopted:
            # 採用ゼロ。failed 扱いでフォールバックを継続させる。
            _set_state(db, user_id, status="failed", profile_hash=profile.profile_hash)
            return

        # 当該ユーザの旧キャッシュを削除して差し替える。
        db.query(UserRecommendation).filter(
            UserRecommendation.user_id == user_id
        ).delete()
        for rank, (product, reason) in enumerate(adopted):
            db.add(
                UserRecommendation(
                    user_id=user_id,
                    product_id=product.id,
                    reason=reason,
                    rank=rank,
                )
            )
        _set_state(
            db,
            user_id,
            status="ready",
            profile_hash=profile.profile_hash,
            generated_at=datetime.now(timezone.utc),
        )
        logger.info("レコメンド生成完了 user_id=%s 件数=%s", user_id, len(adopted))
    except Exception as exc:  # noqa: BLE001 - 生成失敗はフォールバックで吸収する
        logger.warning(
            "レコメンド生成に失敗しました user_id=%s: %s / "
            "ホストの Ollama が起動しているか、対象モデルが pull 済みか確認してください",
            user_id,
            exc,
        )
        db.rollback()
        try:
            _set_state(db, user_id, status="failed")
        except Exception:  # noqa: BLE001
            db.rollback()
    finally:
        db.close()


def mark_generating(db: Session, user_id: int, profile_hash: str) -> None:
    """リクエストパスから同期的に generating を確定させる（多重起動防止用）。

    レスポンス返却後に走る BackgroundTasks が generating をコミットするより前に、
    並行リクエストが古い state を見て二重生成をスケジュールするのを防ぐ。
    """
    _set_state(db, user_id, status="generating", profile_hash=profile_hash)


def _set_state(
    db: Session,
    user_id: int,
    *,
    status: str,
    profile_hash: str | None = None,
    generated_at: datetime | None = None,
) -> None:
    """RecommendationState を upsert する（commit は呼び出し側または本関数内で行う）。"""
    state = db.get(RecommendationState, user_id)
    if state is None:
        state = RecommendationState(user_id=user_id)
        db.add(state)
    state.status = status
    if profile_hash is not None:
        state.profile_hash = profile_hash
    if generated_at is not None:
        state.generated_at = generated_at
    # 他リクエストからの多重起動防止判定にすぐ効くよう、状態はその場で確定させる。
    # ready 時は直前に追加した UserRecommendation 行もまとめてコミットされる。
    db.commit()
