"""レコメンドのプロフィール構築・候補抽出・LLM生成・人気順フォールバック。

LLM 生成はリクエストの同期パスに置かず、generate_for_user を BackgroundTasks で
呼ぶ。Ollama が使えない場合でも get_popular_products の人気順フォールバックで
API は常に応答する。バックグラウンドタスクは自前で DB セッションを開閉する。
"""

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

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
    ProductView,
    RecommendationState,
    Review,
    UserRecommendation,
    WishlistItem,
)
from app.services import llm_catalog

logger = logging.getLogger(__name__)

# 行動種別ごとの重み（プロフィールベクトルの加重平均に使う）。
# view（閲覧）は購入・お気に入りより弱いシグナルなので小さめの重みにする。
_BEHAVIOR_WEIGHTS = {
    "purchase": 3.0,
    "cart": 2.0,
    "wishlist": 2.0,
    "review": 1.0,
    "view": 0.5,
}

# LLM に渡す候補件数。reason の最大長・カタログ整形・SID 照合は llm_catalog に集約。
_CANDIDATE_LIMIT = 20

# プロフィールに反映する閲覧履歴の直近件数。古い閲覧まで無限に効かせず直近に絞る。
_VIEW_LIMIT = 20

# 行動重みの時間減衰パラメータ。半減期 30 日で古い行動ほど軽くする。
_HALF_LIFE_DAYS = 30.0
# 減衰の下限。どれだけ古くてもゼロにはせず、過去の購入もわずかに好みへ反映させる。
_MIN_DECAY = 0.05


def _decay_factor(occurred_at: datetime | None, now: datetime) -> float:
    """行動の発生時刻から時間減衰係数（0〜1）を求める純関数。

    occurred_at が None のときは 1.0（カートなどタイムスタンプを持たない行動は
    「今まさにある関心」とみなして減衰させない）。半減期は _HALF_LIFE_DAYS 日で、
    それだけ経つと重みが半分になる。下限 _MIN_DECAY を設けて古い行動も完全には
    消さない（過去の購入もわずかに好みへ効かせるため）。
    """
    if occurred_at is None:
        return 1.0
    # naive datetime（tzinfo 無し）は UTC とみなして now と比較できるようにする。
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)
    # 経過日数は秒精度で日換算。未来時刻（負の経過）は 0 に丸めて減衰なし扱いにする。
    age_days = max(0.0, (now - occurred_at).total_seconds() / 86400.0)
    return max(_MIN_DECAY, 0.5 ** (age_days / _HALF_LIFE_DAYS))


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


def collect_behaviors(db: Session, user_id: int) -> list[tuple[str, int, float]]:
    """購入・カート・お気に入り・高評価・閲覧を (種別, product_id, weight) で集める。

    各行動の重みは「基本重み × 時間減衰係数」。新しい行動ほど重く、古い行動は
    軽くすることで「今の好み」を優先する。タイムスタンプを持たないカートは減衰なし。
    """
    behaviors: list[tuple[str, int, float]] = []
    now = datetime.now(timezone.utc)

    # 購入（cancelled 以外の注文の明細）。同一商品を複数回買っていることもあるので、
    # product_id ごとに最新の注文時刻（max）で減衰させる。
    purchased_rows = (
        db.query(OrderItem.product_id, func.max(Order.created_at))
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.user_id == user_id, Order.status != "cancelled")
        .group_by(OrderItem.product_id)
        .all()
    )
    for pid, last_ordered_at in purchased_rows:
        weight = _BEHAVIOR_WEIGHTS["purchase"] * _decay_factor(last_ordered_at, now)
        behaviors.append(("purchase", pid, weight))

    # カート内。タイムスタンプを持たない（CartItem に列を足さない方針）ので減衰なし。
    cart_rows = (
        db.query(CartItem.product_id).filter(CartItem.user_id == user_id).all()
    )
    for (pid,) in cart_rows:
        behaviors.append(("cart", pid, _BEHAVIOR_WEIGHTS["cart"]))

    # お気に入り。登録時刻で減衰させる。
    wish_rows = (
        db.query(WishlistItem.product_id, WishlistItem.created_at)
        .filter(WishlistItem.user_id == user_id)
        .all()
    )
    for pid, created_at in wish_rows:
        weight = _BEHAVIOR_WEIGHTS["wishlist"] * _decay_factor(created_at, now)
        behaviors.append(("wishlist", pid, weight))

    # 高評価（rating>=4）レビュー。投稿時刻で減衰させる。
    review_rows = (
        db.query(Review.product_id, Review.created_at)
        .filter(Review.user_id == user_id, Review.rating >= 4)
        .all()
    )
    for pid, created_at in review_rows:
        weight = _BEHAVIOR_WEIGHTS["review"] * _decay_factor(created_at, now)
        behaviors.append(("review", pid, weight))

    # 閲覧履歴。直近 _VIEW_LIMIT 件を最終閲覧時刻の新しい順で拾い、閲覧時刻で減衰させる。
    view_rows = (
        db.query(ProductView.product_id, ProductView.viewed_at)
        .filter(ProductView.user_id == user_id)
        .order_by(ProductView.viewed_at.desc())
        .limit(_VIEW_LIMIT)
        .all()
    )
    for pid, viewed_at in view_rows:
        weight = _BEHAVIOR_WEIGHTS["view"] * _decay_factor(viewed_at, now)
        behaviors.append(("view", pid, weight))

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
    behaviors = collect_behaviors(db, user_id)
    if not behaviors:
        return None

    # profile_hash は種別:product_id をソートして連結した文字列の sha256。
    # 重みや発生時刻は意図的にハッシュに含めない。含めると時間減衰で毎瞬ハッシュが
    # 変わり、行動が増減していなくてもキャッシュが陳腐化し続けて再生成が止まらなくなる。
    # 「どの商品にどの種別で関わったか」の集合が変わったときだけ再生成させる。
    # なお view もハッシュに入るため、新しい商品を閲覧するとキャッシュが陳腐化し
    # LLM 再生成が走る。これは閲覧に追従しておすすめを更新するための意図的な挙動
    # （多重起動は BackgroundTasks + advisory ロック側で防いでいる）。
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
    *,
    category_id: int | None = None,
) -> list[tuple[Product, ProductEmbedding]]:
    """プロフィールベクトルの pgvector コサイン近傍を候補として返す。

    LISTED_STATUSES のみ・exclude_ids 除外。埋め込みが無ければ空リスト。
    category_id を渡すとそのカテゴリ内での近傍に絞る（ホームの category レーン用。
    既存呼び出しに影響しないようキーワード専用の任意引数として足している）。
    """
    stmt = (
        select(Product, ProductEmbedding)
        .join(ProductEmbedding, ProductEmbedding.product_id == Product.id)
        .where(Product.status.in_(LISTED_STATUSES))
    )
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
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


# 「今週の売れ筋」の集計窓（日）。ホームの top10 レーン用。
# 全期間の人気（get_popular_products）は殿堂入り商品が固定化して毎日同じ顔ぶれになるため、
# ランキングとしての鮮度を出すには窓を切る必要がある。7日はEC の需要サイクル（週末に偏る
# 購買を1周期ぶん必ず含む）に合わせた最小の窓。短くすると曜日バイアスが乗る。
_RECENT_POPULAR_WINDOW_DAYS = 7


def get_recent_popular_products(
    db: Session,
    limit: int,
    *,
    window_days: int = _RECENT_POPULAR_WINDOW_DAYS,
    exclude_ids: set[int] | None = None,
) -> list[Product]:
    """直近 window_days 日の購入数ランキングを返す（ホームの top10 レーン用）。

    get_popular_products との違いは集計窓だけ（あちらは全期間）。中身は完全に
    非パーソナライズで、誰が見ても同じ順序になる。並びは購入数 desc → 新着 desc → id desc。
    期間内に購入がゼロの商品は結果に含めない（0 件の商品まで並べると「売れ筋」が
    ただの新着一覧になってしまうため、inner join で購入実績のあるものだけに絞る）。
    """
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    purchase_subq = (
        select(
            OrderItem.product_id.label("product_id"),
            func.coalesce(func.sum(OrderItem.quantity), 0).label("purchased"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(Order.status != "cancelled", Order.created_at >= since)
        .group_by(OrderItem.product_id)
        .subquery()
    )

    stmt = (
        select(Product)
        # inner join: 期間内に1点でも売れた商品だけを対象にする。
        .join(purchase_subq, purchase_subq.c.product_id == Product.id)
        .where(Product.status.in_(LISTED_STATUSES))
    )
    if exclude_ids:
        stmt = stmt.where(Product.id.notin_(exclude_ids))
    stmt = stmt.order_by(
        purchase_subq.c.purchased.desc(),
        Product.created_at.desc(),
        Product.id.desc(),
    ).limit(limit)

    return list(db.execute(stmt).scalars().all())


def get_sale_products(
    db: Session,
    limit: int,
    *,
    profile_vec: np.ndarray | None = None,
    exclude_ids: set[int] | None = None,
) -> list[Product]:
    """セール中（sale_price あり）の商品を返す。

    profile_vec があればプロフィールのコサイン近傍順（＝好みに寄せたセール棚）、
    無ければ割引率の大きい順にフォールバックする。割引率は effective_price を
    price で割った比で、SQL 側では sale_price / price の昇順に等しい
    （sale_price is not null に絞っているので effective_price == sale_price）。
    """
    stmt = select(Product).where(
        Product.status.in_(LISTED_STATUSES),
        Product.sale_price.isnot(None),
    )
    if exclude_ids:
        stmt = stmt.where(Product.id.notin_(exclude_ids))

    if profile_vec is not None:
        stmt = stmt.join(
            ProductEmbedding, ProductEmbedding.product_id == Product.id
        ).order_by(
            ProductEmbedding.embedding.cosine_distance(profile_vec.tolist()),
            Product.id,
        )
    else:
        # 割引率が大きい順。price が 0 の異常データでもゼロ除算しないよう nullif で守る。
        stmt = stmt.order_by(
            (Product.sale_price / func.nullif(Product.price, 0)).asc().nullslast(),
            Product.id,
        )
    return list(db.execute(stmt.limit(limit)).scalars().all())


def get_neighbors_of(
    db: Session,
    product_id: int,
    limit: int,
    *,
    exclude_ids: set[int] | None = None,
) -> list[Product]:
    """指定商品の埋め込みのコサイン近傍を返す（アンカー商品の「これを見た人に」用）。

    products.py の /{product_id}/recommendations と同じ近傍ロジックだが、あちらは
    HTTP 応答（フォールバック込み）まで担うため、ここでは「近傍を引く」だけを切り出す。
    埋め込みが無ければ空リスト（呼び出し側がレーンごと落とす）。
    """
    target = db.get(ProductEmbedding, product_id)
    if target is None:
        return []
    excluded = set(exclude_ids or ())
    excluded.add(product_id)  # アンカー自身は近傍に含めない。
    stmt = (
        select(Product)
        .join(ProductEmbedding, ProductEmbedding.product_id == Product.id)
        .where(
            Product.status.in_(LISTED_STATUSES),
            Product.id.notin_(excluded),
        )
        .order_by(ProductEmbedding.embedding.cosine_distance(target.embedding))
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


# 行動種別 → 履歴プロンプトに出す日本語ラベル。
_BEHAVIOR_LABELS = {
    "purchase": "購入",
    "cart": "カート",
    "wishlist": "お気に入り",
    "review": "高評価",
    "view": "閲覧",
}


def history_prompt_lines(
    db: Session, behaviors: list[tuple[str, int, float]]
) -> list[str]:
    """行動一覧を「[購入] {catalog_line}」形式の履歴プロンプト行に整形する。

    レコメンドとチャットアシスタントの双方から使う共通ビルダー。埋め込み・商品が
    引ける行動のみを behaviors の順序を保って行にする（埋め込みが無い商品は履歴に
    出さない）。avg_ratings はこの関数内で履歴対象 ID について取得する。呼び出し側で
    候補分の avg_ratings と重複クエリになるが、公開 API の単純さ（behaviors を渡すだけ）
    を優先してあえて内部で完結させている。
    """
    history_ids = {pid for _, pid, _ in behaviors}
    if not history_ids:
        return []

    avg_map = llm_catalog.avg_ratings(db, history_ids)
    # 履歴商品の埋め込み（SID 取得用）と商品本体を一括で引く。
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

    lines: list[str] = []
    for kind, pid, _weight in behaviors:
        emb = hist_embeddings.get(pid)
        prod = history_products.get(pid)
        if emb is None or prod is None:
            continue
        label = _BEHAVIOR_LABELS.get(kind, kind)
        sid = emb.semantic_id or f"p{pid}"
        lines.append(
            f"[{label}] {llm_catalog.catalog_line(prod, sid, avg_map.get(pid))}"
        )
    return lines


def _build_messages(
    db: Session,
    profile: Profile,
    candidates: list[tuple[Product, ProductEmbedding]],
) -> tuple[list[dict], dict[str, Product]]:
    """chat 用メッセージと SID→Product の候補マップを組み立てる。"""
    candidate_ids = {p.id for p, _ in candidates}
    avg_map = llm_catalog.avg_ratings(db, candidate_ids)

    # 候補カタログ（SID で列挙）。SID→Product を採用判定に使う。
    sid_to_product: dict[str, Product] = {}
    catalog_lines: list[str] = []
    for product, emb in candidates:
        sid = emb.semantic_id or f"p{product.id}"
        sid_to_product[sid] = product
        catalog_lines.append(llm_catalog.catalog_line(product, sid, avg_map.get(product.id)))

    # 顧客履歴も SID 列で表現する（共通ビルダーに委譲。埋め込みのある商品のみ）。
    history_lines = history_prompt_lines(db, profile.behaviors)

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

        # ハルシネーション対策: 候補集合に存在する SID のものだけ採用（共通ロジック）。
        adopted = llm_catalog.match_products(
            parsed.items, sid_to_product, max_items=8
        )

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
