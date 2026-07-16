"""ホーム画面のレーン構成（Netflix 型）を組み立てるサービス。

設計の柱は 2 つ。

1. **レーンビルダー方式** — 「1 レーン = 1 アルゴリズム」を型と登録レジストリで構造的に
   強制する。各ビルダーは HomeContext を受け取り候補レーンを 0 本以上返すだけの関数で、
   ページ全体の都合（何本載るか・重複したか）を一切知らない。1 本のレーンの中身が複数
   アルゴリズムの混合物になることを設計上できなくするのが狙い。

2. **stage-wise 貪欲法** — 各レーンを独立にスコアリングして上から並べる row-ranking では
   なく、「すでに選んだレーン・すでに載せた商品」との関係を込みでスコアリングし、1 本
   選ぶたびに残り全候補を再スコアリングする。ページは行の集合ではなく行の系列であり、
   n 本目の価値は 1..n-1 本目に依存するという前提に立つ。

多層フォールバック: pgvector 不在・Ollama 停止・埋め込み 0 件・プロフィール構築不能の
いずれでも例外を外に出さず、載せられるレーンだけでページを組んで 200 を返す。各ビルダーは
_safe_build で個別に隔離してあり、1 本のレーンの失敗がページ全体を落とさない。
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    LISTED_STATUSES,
    CartItem,
    Category,
    Order,
    OrderItem,
    Product,
    ProductEmbedding,
    ProductView,
    RecommendationState,
    UserRecommendation,
)
from app.services import recommendation
from app.services.recommendation import Profile

logger = logging.getLogger(__name__)


# ---------- 定数（値の根拠を必ずコメントで残す）----------

# layout ごとの最小件数。契約の不変条件3。これを満たせないレーンはページに載せない。
# hero は 1 枚絵なので 1 件。lane は横スクロールの棚で、4 件を割ると「棚」に見えず
# 中途半端な余白になるため 4 件を下限にする（フロントの最小カラム数と揃えた値）。
# ranked は「今週の売れ筋 Top10」として体をなす最低ラインとして 4 件。
_MIN_ITEMS_BY_LAYOUT = {"hero": 1, "ranked": 4, "lane": 4}

# layout ごとの最大件数。ranked は契約どおり 10 件（Netflix Top 10 と同じ）。
# hero は 1 件。lane は横スクロールで 12 件を超えると最後まで到達されないため打ち止め。
_MAX_ITEMS_BY_LAYOUT = {"hero": 1, "ranked": 10, "lane": 12}

# byw（アンカー近傍）レーンのアンカー数上限。直近閲覧・購入から最大 3 商品。
# 3 を超えると「〇〇を見たあなたに」ばかりでページが埋まり、レーン種別の多様性が死ぬ。
# 1 では直近 1 商品への過適合（たまたま踏んだ 1 商品でホームが乗っ取られる）が起きる。
_MAX_ANCHORS = 3

# category レーンの本数上限。同上の理由でユーザーの上位 3 カテゴリまで。
_MAX_CATEGORY_LANES = 3

# 各ビルダーが取ってくる候補件数。重複排除で痩せるぶんを見越して最大表示数より多めに引く。
# stage-wise では先に選ばれたレーンに商品を奪われるため、_MAX_ITEMS ちょうどしか引かないと
# 後続レーンが軒並み min_items 割れで落ちてページが短くなる。倍取っておく。
_FETCH_MULTIPLIER = 2

# ページに載せる最終スコアの下限。これを下回るレーンは「載せないほうがマシ」として捨てる。
# スコアの尺度は relevance(0.5〜1.0) × prior(0.7〜3.0) × novelty(0.35〜1.0)。
# 最弱の組み合わせ（新着 0.7 × 中立 0.5 × novelty 満額 1.0 = 0.35）は通し、
# 「弱いレーンかつ既出カテゴリと丸かぶり」（0.7 × 0.5 × 0.35 = 0.1225）は落とす、
# という線引きで 0.20 に置いた。max_lanes の上限より先にこの閾値で止まることを許容する
# （水増しされた 9 本より、意味のある 5 本のほうがページとして強い）。
_SCORE_THRESHOLD = 0.20

# レーン種別ごとの事前重み（prior）。関連度だけで並べるとページが「わずかに違う自分の
# 興味」で埋まり、A/B で非パーソナライズの人気行に負ける、というのが Netflix の知見。
# ゆえに top10 のような非パーソナライズ行にも健全な重みを与える。
_LANE_PRIORS = {
    # hero は必ずページ先頭に来てほしい。貪欲法は 1 本目に最大スコアのレーンを選ぶので、
    # 他レーンの理論上最大スコア（for_you 1.30 × relevance 1.0 × novelty 1.0 = 1.30）を
    # 下回り得ない値にする。billboard の最低スコアは 3.0 × 0.5 × 1.0 = 1.50 > 1.30。
    # 「hero が 1 本目」を目的関数の外側の if 文で特別扱いせず、prior の大小で表現している。
    "billboard": 3.0,
    # 買い忘れは意図が最も明確な信号（自分でカートに入れた）。パーソナライズ行で最強。
    "cart_reminder": 1.40,
    # LLM がユーザー履歴を読んで選んだ行。理由文が付くぶん体験価値も高い。
    "for_you": 1.30,
    # 非パーソナライズだが「健全な量の人気」を必ず混ぜる枠。パーソナライズ行の中位と
    # competitive になるよう意図的に高めに置いている。ここを下げるとページが自分の
    # 興味の反響室になり、Netflix が A/B で観測した負けパターンに入る。
    "top10": 1.15,
    # アンカーが明示的（直近見た商品）なので文脈が伝わりやすい。
    "byw": 1.00,
    # 履歴の再掲。便利だが新しい発見はゼロなので中位。
    "recently_viewed": 0.95,
    # セールは購買動機として強いが、好みとの一致は byw ほど確かではない。
    "sale": 0.90,
    # カテゴリ棚は粒度が粗く、byw の下位互換になりがち。
    "category": 0.85,
    # 非パーソナライズかつ購買実績の裏付けも無い。最下位だが、コールドスタート時に
    # ページを空にしないための最後の砦なので閾値は超えられる値にしてある。
    "new_arrivals": 0.75,
}

# プロフィールが無い（コールドスタート）ときの relevance。
# cos 類似度を (1+cos)/2 で [0,1] に写すので、無情報＝中立は 0.5。
_NEUTRAL_RELEVANCE = 0.5

# novelty の減点の強さ。既出レーンとカテゴリ分布が完全一致かつ 1 カテゴリに集中していても
# 1 - 0.65 × 1.0 = 0.35 までしか落とさない（= _NOVELTY_FLOOR）。
# 1.0 にすると完全一致レーンのスコアが 0 になり「同カテゴリの棚は二度と出せない」という
# 強すぎる制約になる。0.65 は「かぶったら prior 1 段ぶん相当のハンデ」を意図した値。
_NOVELTY_STRENGTH = 0.65
_NOVELTY_FLOOR = 0.35

# ゲスト（recently_viewed_ids）のプロフィールベクトルを作るときの位置減衰。
# i 番目（0 が最新）の重み = _GUEST_VIEW_DECAY ** i。0.85 なら 10 件目で約 0.23 まで落ちる。
# ゲストは行動時刻を持たない（ID の並びしか無い）ため、時間減衰の代わりに順位で減衰させる。
_GUEST_VIEW_DECAY = 0.85

# recently_viewed_ids から採用する上限。契約どおり先頭 10 件。
_MAX_RECENTLY_VIEWED_IDS = 10


# ---------- 型 ----------


@dataclass
class Lane:
    """候補レーン 1 本。ビルダーの出力であり、ページ構築の入力。

    items は (Product, reason) の列。reason は LLM 由来のときだけ入り、それ以外は None。
    kind は prior 表の引き当てキーで、key（"byw:42" のような一意識別子）とは別に持つ。
    """

    key: str
    title: str | None
    layout: str  # "hero" | "ranked" | "lane"
    kind: str  # _LANE_PRIORS のキー
    items: list[tuple[Product, str | None]]
    # このレーンがユーザー固有の信号（行動 or recently_viewed_ids）に基づくか。
    # source の "personalized" / "popular" 判定に使う。
    personalized: bool

    @property
    def min_items(self) -> int:
        return _MIN_ITEMS_BY_LAYOUT[self.layout]

    @property
    def max_items(self) -> int:
        return _MAX_ITEMS_BY_LAYOUT[self.layout]


@dataclass
class HomeContext:
    """1 リクエスト内で全ビルダーが共有する読み取り専用の文脈。

    重要: profile はここで **1 回だけ** 構築して全ビルダーで使い回す。build_profile は
    行動収集 + 埋め込み取得を伴うため、ビルダーごとに呼ぶとレーン本数ぶん重複実行される。
    同様に LLM キャッシュの鮮度判定（billboard と for_you が共に必要とする）もここで 1 回。
    """

    db: Session
    user_id: int | None
    profile: Profile | None
    # 候補から除外する商品（購入済み + カート内）。cart_reminder だけは意図的に無視する。
    exclude_ids: set[int]
    # ゲストの閲覧履歴（新しい順）。ログイン時は空（product_views を使うため）。
    recently_viewed_ids: list[int]
    # LLM キャッシュ（state=ready かつ profile_hash 一致のときだけ中身が入る）。
    llm_rows: list[UserRecommendation] = field(default_factory=list)
    # キャッシュが陳腐化していて再生成を起動すべきか（router が BackgroundTasks で起動）。
    needs_generation: bool = False
    # byw のアンカー商品（直近閲覧・購入。新しい順、最大 _MAX_ANCHORS 件）。
    anchor_ids: list[int] = field(default_factory=list)
    # カテゴリID → ユーザーの関心の強さ（行動重みの合計）。降順に使う。
    category_weights: dict[int, float] = field(default_factory=dict)


# ビルダーの型: 文脈を受け取り候補レーンを 0 本以上返す純粋な関数。
Builder = Callable[[HomeContext], list[Lane]]


# ---------- 文脈の構築 ----------


def _guest_profile(db: Session, viewed_ids: list[int]) -> Profile | None:
    """ゲストの recently_viewed_ids から擬似プロフィールベクトルを作る。

    ログインユーザーの build_profile と同じ「埋め込みの加重平均」だが、行動時刻が無いので
    時間減衰の代わりに ID 列の順位で減衰させる（先頭ほど新しい前提）。これにより
    ゲストでも byw / category / sale をパーソナライズでき、契約の source="personalized"
    （「ログインの行動 or recently_viewed_ids に基づく」）を満たせる。
    profile_hash は LLM 生成キャッシュ用の値でゲストには無関係なので空文字を入れる。
    """
    if not viewed_ids:
        return None
    embeddings = {
        e.product_id: np.array(e.embedding, dtype=np.float64)
        for e in db.query(ProductEmbedding)
        .filter(ProductEmbedding.product_id.in_(viewed_ids))
        .all()
    }
    if not embeddings:
        return None

    weighted_sum = None
    total_weight = 0.0
    behaviors: list[tuple[str, int, float]] = []
    for i, pid in enumerate(viewed_ids):
        weight = _GUEST_VIEW_DECAY**i
        behaviors.append(("view", pid, weight))
        vec = embeddings.get(pid)
        if vec is None:
            continue
        weighted_sum = vec * weight if weighted_sum is None else weighted_sum + vec * weight
        total_weight += weight

    if weighted_sum is None or total_weight == 0.0:
        return None
    return Profile(
        profile_hash="",
        profile_vec=weighted_sum / total_weight,
        behaviors=behaviors,
        exclude_ids=set(),
    )


def _load_llm_cache(
    db: Session, user_id: int, profile: Profile | None
) -> tuple[list[UserRecommendation], bool]:
    """LLM 生成キャッシュを鮮度判定つきで読む。

    判定条件は recommendations.py の /recommendations/home と同一（state=ready かつ
    profile_hash が現在の行動ハッシュと一致）。戻り値は (rank 順の行, 再生成が必要か)。
    キャッシュが使えるなら再生成は不要、使えないなら（プロフィールがある場合に限り）必要。
    """
    state = db.get(RecommendationState, user_id)
    fresh = (
        profile is not None
        and state is not None
        and state.status == "ready"
        and state.profile_hash == profile.profile_hash
    )
    if not fresh:
        # プロフィールが作れないなら生成しても失敗するだけなので起動しない。
        return [], profile is not None

    rows = (
        db.query(UserRecommendation)
        .filter(UserRecommendation.user_id == user_id)
        .order_by(UserRecommendation.rank, UserRecommendation.id)
        .all()
    )
    # 生成後に status が変わった商品を弾く（可視性の唯一の源は Product.status）。
    rows = [r for r in rows if r.product is not None and r.product.status in LISTED_STATUSES]
    # キャッシュが全滅（全部非表示化）したら再生成させる。
    return rows, not rows


def _login_anchor_ids(db: Session, user_id: int) -> list[int]:
    """ログインユーザーの byw アンカー候補を新しい順で返す。

    直近閲覧（product_views.viewed_at 降順）を主軸に、足りなければ直近購入で埋める。
    閲覧のほうが「今の関心」を強く表すのでアンカーとして優先する。
    """
    ids: list[int] = [
        pid
        for (pid,) in db.query(ProductView.product_id)
        .filter(ProductView.user_id == user_id)
        .order_by(ProductView.viewed_at.desc())
        .limit(_MAX_ANCHORS)
        .all()
    ]
    if len(ids) < _MAX_ANCHORS:
        purchased = (
            db.query(OrderItem.product_id)
            .join(Order, OrderItem.order_id == Order.id)
            .filter(Order.user_id == user_id, Order.status != "cancelled")
            .order_by(Order.created_at.desc())
            .limit(_MAX_ANCHORS * 2)
            .all()
        )
        for (pid,) in purchased:
            if pid not in ids:
                ids.append(pid)
            if len(ids) >= _MAX_ANCHORS:
                break
    return ids[:_MAX_ANCHORS]


def _category_weights(db: Session, behaviors: list[tuple[str, int, float]]) -> dict[int, float]:
    """行動一覧を「カテゴリID → 関心の強さ」に畳み込む。

    行動の重み（種別 × 時間減衰）をそのままカテゴリに足し上げる。購入 3.0 / 閲覧 0.5 の
    差がカテゴリ順位にも効くので、「たくさん見ただけ」より「買った」カテゴリが上に来る。
    """
    if not behaviors:
        return {}
    pids = {pid for _, pid, _ in behaviors}
    cat_of = {
        pid: cid
        for pid, cid in db.query(Product.id, Product.category_id)
        .filter(Product.id.in_(pids))
        .all()
        if cid is not None
    }
    weights: dict[int, float] = {}
    for _kind, pid, weight in behaviors:
        cid = cat_of.get(pid)
        if cid is None:
            continue
        weights[cid] = weights.get(cid, 0.0) + weight
    return weights


def build_context(
    db: Session, user_id: int | None, recently_viewed_ids: list[int]
) -> HomeContext:
    """全ビルダーが共有する文脈を 1 回だけ構築する。

    ここで作った profile を全ビルダーが使い回すのが性能上の要。build_profile は
    行動収集 + 埋め込み一括取得を行うため、レーンごとに呼ぶと同じ計算が 9 回走る。

    TODO(Phase 3): product_embeddings.embedding に ANN インデックス（HNSW）が無いため、
    ベクトル近傍を引くレーン（billboard/for_you/byw/category/sale）ごとに全件コサイン
    スキャンが走る。商品数が数千を超えたら
        CREATE INDEX ON product_embeddings USING hnsw (embedding vector_cosine_ops);
    を追加すること。マイグレーションツール未導入のため、追加時は create_all 後の
    DDL 実行として main.py の lifespan に入れる形になる。
    """
    viewed = recently_viewed_ids[:_MAX_RECENTLY_VIEWED_IDS]

    if user_id is None:
        profile = _safe(db, "guest_profile", lambda: _guest_profile(db, viewed))
        return HomeContext(
            db=db,
            user_id=None,
            profile=profile,
            exclude_ids=set(),
            recently_viewed_ids=viewed,
            anchor_ids=viewed[:_MAX_ANCHORS],
            category_weights=(
                _safe(db, "guest_categories", lambda: _category_weights(db, profile.behaviors))
                or {}
                if profile is not None
                else {}
            ),
        )

    profile = _safe(db, "profile", lambda: recommendation.build_profile(db, user_id))
    exclude_ids = _safe(db, "exclude_ids", lambda: recommendation.get_exclude_ids(db, user_id)) or set()
    llm_rows, needs_generation = _safe(
        db, "llm_cache", lambda: _load_llm_cache(db, user_id, profile)
    ) or ([], False)
    return HomeContext(
        db=db,
        user_id=user_id,
        profile=profile,
        exclude_ids=exclude_ids,
        # ログイン時は product_views が正となるので、クエリ由来の ID 列は使わない。
        recently_viewed_ids=[],
        llm_rows=llm_rows,
        needs_generation=needs_generation,
        anchor_ids=_safe(db, "anchors", lambda: _login_anchor_ids(db, user_id)) or [],
        category_weights=(
            _safe(db, "categories", lambda: _category_weights(db, profile.behaviors)) or {}
            if profile is not None
            else {}
        ),
    )


def _safe(db: Session, label: str, fn):
    """DB 由来の処理を隔離して実行する（pgvector 不在・埋め込み欠損などを吸収）。

    失敗したら None を返し、必ず rollback する。失敗したステートメントを rollback せずに
    残すと以後そのセッションの全クエリが InFailedSqlTransaction で落ち、フォールバック
    しようとした後続レーンまで巻き添えで死ぬ。
    """
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 - ホームは何があっても 200 を返す
        logger.warning("ホームの %s の取得に失敗しました（スキップして継続）: %s", label, exc)
        db.rollback()
        return None


# ---------- レーンビルダー（1 レーン = 1 アルゴリズム）----------
#
# 各ビルダーは HomeContext だけを見て候補レーンを 0 本以上返す。ページに何本載るか・
# 他レーンと重複したかは一切関知しない（それは build_page の責務）。


def _fetch_limit(layout: str) -> int:
    return _MAX_ITEMS_BY_LAYOUT[layout] * _FETCH_MULTIPLIER


def build_billboard(ctx: HomeContext) -> list[Lane]:
    """hero 枠。LLM キャッシュがあればその 1 位（理由文つき）、無ければ人気 1 位。

    理由文が付けられるかどうかで hero の説得力が変わるので、LLM キャッシュを最優先する。
    """
    if ctx.llm_rows:
        row = ctx.llm_rows[0]
        return [
            Lane(
                key="billboard",
                title=None,
                layout="hero",
                kind="billboard",
                items=[(row.product, row.reason)],
                personalized=True,
            )
        ]
    # フォールバック: 全期間の人気 1 位。理由文は付かない（LLM 由来ではないため）。
    products = recommendation.get_popular_products(ctx.db, 1, exclude_ids=ctx.exclude_ids)
    if not products:
        return []
    return [
        Lane(
            key="billboard",
            title=None,
            layout="hero",
            kind="billboard",
            items=[(products[0], None)],
            personalized=False,
        )
    ]


def build_cart_reminder(ctx: HomeContext) -> list[Lane]:
    """カートに残っている商品（ログインのみ）。

    exclude_ids（購入済み + カート内）は意図的に無視する。このレーンの存在意義が
    まさに「カート内の商品を見せる」ことなので、除外を適用すると必ず空になる。
    """
    if ctx.user_id is None:
        return []
    products = [
        p
        for p in ctx.db.query(Product)
        .join(CartItem, CartItem.product_id == Product.id)
        .filter(CartItem.user_id == ctx.user_id, Product.status.in_(LISTED_STATUSES))
        .order_by(CartItem.id.desc())
        .limit(_MAX_ITEMS_BY_LAYOUT["lane"])
        .all()
    ]
    if not products:
        return []
    return [
        Lane(
            key="cart_reminder",
            title="買い忘れはありませんか",
            layout="lane",
            kind="cart_reminder",
            items=[(p, None) for p in products],
            personalized=True,
        )
    ]


def build_recently_viewed(ctx: HomeContext) -> list[Lane]:
    """最近見た商品。ログインは product_views、ゲストは recently_viewed_ids の順序を保持。"""
    if ctx.user_id is not None:
        products = [
            p
            for p in ctx.db.query(Product)
            .join(ProductView, ProductView.product_id == Product.id)
            .filter(ProductView.user_id == ctx.user_id, Product.status.in_(LISTED_STATUSES))
            .order_by(ProductView.viewed_at.desc())
            .limit(_MAX_ITEMS_BY_LAYOUT["lane"])
            .all()
        ]
    else:
        if not ctx.recently_viewed_ids:
            return []
        found = {
            p.id: p
            for p in ctx.db.query(Product)
            .filter(
                Product.id.in_(ctx.recently_viewed_ids),
                Product.status.in_(LISTED_STATUSES),
            )
            .all()
        }
        # IN 句は順序を保証しないので、クエリ文字列で受け取った順序を Python 側で復元する。
        # 「最近見た商品」は新しい順であることが意味なので、順序は仕様の一部。
        products = [found[pid] for pid in ctx.recently_viewed_ids if pid in found]
    if not products:
        return []
    return [
        Lane(
            key="recently_viewed",
            title="最近見た商品",
            layout="lane",
            kind="recently_viewed",
            items=[(p, None) for p in products],
            personalized=True,
        )
    ]


def build_for_you(ctx: HomeContext) -> list[Lane]:
    """LLM が生成したおすすめ（理由文つき）。ログインのみ。

    billboard が 1 位を持っていくので、ここは 2 位以降を使う。同じ商品が hero と棚に
    二重に出るのは stage-wise の重複排除でも防がれるが、そもそも意味のない重複なので
    ビルダーの段階で 1 位を外しておく。
    """
    if len(ctx.llm_rows) <= 1:
        return []
    rows = ctx.llm_rows[1:]
    return [
        Lane(
            key="for_you",
            title="あなたへのおすすめ",
            layout="lane",
            kind="for_you",
            items=[(r.product, r.reason) for r in rows],
            personalized=True,
        )
    ]


def build_because_you_watched(ctx: HomeContext) -> list[Lane]:
    """アンカー商品ごとのベクトル近傍レーン（byw:{product_id}）。最大 _MAX_ANCHORS 本。

    「あなたの好み全体」の平均であるプロフィールベクトルと違い、こちらは 1 商品を基点に
    するので文脈が具体的で、見出しで理由を説明できる（＝なぜこれが出ているか伝わる）。
    """
    if not ctx.anchor_ids:
        return []
    anchors = {
        p.id: p
        for p in ctx.db.query(Product).filter(Product.id.in_(ctx.anchor_ids)).all()
    }
    lanes: list[Lane] = []
    for pid in ctx.anchor_ids:
        anchor = anchors.get(pid)
        if anchor is None:
            continue
        neighbors = recommendation.get_neighbors_of(
            ctx.db,
            pid,
            _fetch_limit("lane"),
            # アンカー自身とカート/購入済みを除く。除外は get_neighbors_of 側でも
            # アンカーを足しているが、ここでは購入済みを渡す。
            exclude_ids=ctx.exclude_ids,
        )
        if not neighbors:
            continue
        lanes.append(
            Lane(
                key=f"byw:{pid}",
                title=f"「{anchor.name}」を見たあなたに",
                layout="lane",
                kind="byw",
                items=[(p, None) for p in neighbors],
                personalized=True,
            )
        )
    return lanes


def build_top10(ctx: HomeContext) -> list[Lane]:
    """今週の売れ筋 Top10（ranked）。

    中身は完全に非パーソナライズ（誰が見ても同じ順序）。パーソナライズされるのは
    「ページ内のどの位置に出るか」だけ。Netflix Top 10 と同じ設計で、ランキングの
    社会的証明としての価値は「みんなが見ているもの」であることに由来するため、
    中身を個人化するとその価値が消える。exclude_ids（購入済み）も適用しない。
    """
    products = recommendation.get_recent_popular_products(
        ctx.db, _MAX_ITEMS_BY_LAYOUT["ranked"]
    )
    if not products:
        return []
    return [
        Lane(
            key="top10",
            title="今週の売れ筋",
            layout="ranked",
            kind="top10",
            items=[(p, None) for p in products],
            personalized=False,
        )
    ]


def build_categories(ctx: HomeContext) -> list[Lane]:
    """ユーザーの関心上位カテゴリ × プロフィール近傍（category:{category_id}）。

    プロフィールが無ければ何も返さない（カテゴリ順位そのものが行動由来なので、
    行動が無いときはこのレーンに意味が無い）。
    """
    if ctx.profile is None or not ctx.category_weights:
        return []
    top_cids = [
        cid
        for cid, _w in sorted(
            ctx.category_weights.items(), key=lambda kv: kv[1], reverse=True
        )[:_MAX_CATEGORY_LANES]
    ]
    names = {
        c.id: c.name for c in ctx.db.query(Category).filter(Category.id.in_(top_cids)).all()
    }
    lanes: list[Lane] = []
    for cid in top_cids:
        name = names.get(cid)
        if name is None:
            continue
        rows = recommendation.get_candidates(
            ctx.db,
            ctx.profile.profile_vec,
            ctx.exclude_ids,
            _fetch_limit("lane"),
            category_id=cid,
        )
        if not rows:
            continue
        lanes.append(
            Lane(
                key=f"category:{cid}",
                title=f"{name}のおすすめ",
                layout="lane",
                kind="category",
                items=[(product, None) for product, _emb in rows],
                personalized=True,
            )
        )
    return lanes


def build_sale(ctx: HomeContext) -> list[Lane]:
    """セール中の商品をプロフィール近傍で並べた棚。

    プロフィールが無ければ割引率順（get_sale_products のフォールバック）になるため、
    コールドスタートでも成立する。その場合は personalized=False。
    """
    profile_vec = ctx.profile.profile_vec if ctx.profile is not None else None
    products = recommendation.get_sale_products(
        ctx.db,
        _fetch_limit("lane"),
        profile_vec=profile_vec,
        exclude_ids=ctx.exclude_ids,
    )
    if not products:
        return []
    return [
        Lane(
            key="sale",
            title="セール中のあなた向け" if profile_vec is not None else "セール中の商品",
            layout="lane",
            kind="sale",
            items=[(p, None) for p in products],
            personalized=profile_vec is not None,
        )
    ]


def build_new_arrivals(ctx: HomeContext) -> list[Lane]:
    """新着（created_at 降順）。非パーソナライズ。コールドスタートの最後の砦。"""
    products = list(
        ctx.db.execute(
            select(Product)
            .where(Product.status.in_(LISTED_STATUSES))
            .order_by(Product.created_at.desc(), Product.id.desc())
            .limit(_fetch_limit("lane"))
        )
        .scalars()
        .all()
    )
    if not products:
        return []
    return [
        Lane(
            key="new_arrivals",
            title="新着アイテム",
            layout="lane",
            kind="new_arrivals",
            items=[(p, None) for p in products],
            personalized=False,
        )
    ]


# ビルダーレジストリ。ここに関数を足すだけで新しいレーンが増える。
# 並び順はページ上の順序とは無関係（順序は stage-wise の貪欲法が決める）。
BUILDERS: list[Builder] = [
    build_billboard,
    build_cart_reminder,
    build_recently_viewed,
    build_for_you,
    build_because_you_watched,
    build_top10,
    build_categories,
    build_sale,
    build_new_arrivals,
]


# ---------- スコアリング ----------


def _category_distribution(lane: Lane) -> dict[int, float]:
    """レーンのカテゴリ分布（正規化済み）。novelty の計算に使う。"""
    counts: dict[int, float] = {}
    for product, _reason in lane.items:
        cid = product.category_id
        if cid is None:
            continue
        counts[cid] = counts.get(cid, 0.0) + 1.0
    total = sum(counts.values())
    if total == 0:
        return {}
    return {cid: c / total for cid, c in counts.items()}


def _dist_similarity(a: dict[int, float], b: dict[int, float]) -> float:
    """2 つのカテゴリ分布のコサイン類似度（0〜1）。"""
    if not a or not b:
        return 0.0
    dot = sum(v * b.get(cid, 0.0) for cid, v in a.items())
    na = sum(v * v for v in a.values()) ** 0.5
    nb = sum(v * v for v in b.values()) ** 0.5
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _relevance(
    lane: Lane, profile_vec: np.ndarray | None, embeddings: dict[int, np.ndarray]
) -> float:
    """レーンとユーザーの適合度を [0,1] で返す。

    レーン内商品の埋め込みとプロフィールベクトルのコサイン類似度の平均を (1+cos)/2 で
    [0,1] に写す。プロフィールが無い / 埋め込みが 1 つも無いときは中立値。
    平均を取るのは「レーンとしての適合度」を見たいため（先頭 1 件だけ近い棚より、
    全体が近い棚のほうがスクロールされる）。
    """
    if profile_vec is None or not embeddings:
        return _NEUTRAL_RELEVANCE
    norm_p = float(np.linalg.norm(profile_vec))
    if norm_p == 0.0:
        return _NEUTRAL_RELEVANCE
    sims: list[float] = []
    for product, _reason in lane.items:
        vec = embeddings.get(product.id)
        if vec is None:
            continue
        norm_v = float(np.linalg.norm(vec))
        if norm_v == 0.0:
            continue
        sims.append(float(np.dot(profile_vec, vec)) / (norm_p * norm_v))
    if not sims:
        return _NEUTRAL_RELEVANCE
    return (1.0 + sum(sims) / len(sims)) / 2.0


def _concentration(dist: dict[int, float]) -> float:
    """カテゴリ分布の集中度（ハーフィンダール指数 Σp²）。1 カテゴリなら 1.0、k 均等なら 1/k。

    「レーンが特定の興味に寄っているか、それとも品揃え全体を薄く広く見せているか」を測る。
    エントロピーでも表せるが、カテゴリが 1 つしか無いレーンで log(1)=0 のゼロ除算を
    避ける必要があり、Σp² なら場合分け無しに (0, 1] に収まるのでこちらを使う。
    """
    return sum(p * p for p in dist.values())


def _novelty(lane: Lane, page: list[Lane]) -> float:
    """すでに選んだレーン群に対する新規性（0.35〜1.0）。

    既出レーンとカテゴリ分布が近いほど減点する。これが無いと「わずかに違う自分の興味」
    だけでページが埋まり、多様性の概念がページに存在しなくなる（Netflix の指摘そのもの）。
    最も似ている 1 本（max）を基準にするのは、5 本中 1 本でも丸かぶりなら十分に冗長だから
    （平均にすると、無関係なレーンが増えるほど冗長さが薄まって見えてしまう）。

    減点は候補レーンの「集中度」で重み付けする。ここが要点で、分布の近さだけで減点すると
    全カテゴリに薄く広がったレーン（例: 全カテゴリから売れ筋を集めた top10）の分布が
    ほぼ一様になり、一様分布は他のあらゆる分布とコサイン類似度が高いため、
    「広いレーンが 1 本載った瞬間に後続の全レーンが冗長判定される」という誤検知が起きる。
    実際 top10（5カテゴリ）を選んだ直後に sale/new_arrivals が閾値割れで落ち、
    コールドスタートのゲストがレーン 2 本のホームになる事故が出た。
    「多くのカテゴリを含む」ことと「このレーンと同じ興味の焼き直し」は別物であり、
    罰したいのは後者だけ。集中度を掛けることで、興味が特定カテゴリに寄ったレーンが
    既出レーンと丸かぶりのときにだけ減点が効くようにしている。
    """
    if not page:
        return 1.0
    dist = _category_distribution(lane)
    if not dist:
        return 1.0
    worst = max(
        (_dist_similarity(dist, _category_distribution(chosen)) for chosen in page),
        default=0.0,
    )
    penalty = _NOVELTY_STRENGTH * worst * _concentration(dist)
    return max(_NOVELTY_FLOOR, 1.0 - penalty)


def _score(
    lane: Lane,
    page: list[Lane],
    profile_vec: np.ndarray | None,
    embeddings: dict[int, np.ndarray],
) -> float:
    """stage-wise のスコア関数。

    relevance（ユーザーとの適合） × prior（レーン種別の事前重み） × novelty（既出との差異）。
    加算ではなく乗算にしているのは、どれか 1 つが致命的に低いレーンを他の要素で救済させない
    ため（関連度ゼロの棚を prior で押し込む、既出と丸かぶりの棚を関連度で押し込む、が起きない）。
    novelty は page に依存するので、この関数は「レーン単体の価値」ではなく
    「この位置にこのレーンを置く価値」を返す。ゆえに 1 本選ぶたびに再計算が要る。
    """
    prior = _LANE_PRIORS.get(lane.kind, 1.0)
    return _relevance(lane, profile_vec, embeddings) * prior * _novelty(lane, page)


def _load_embeddings(db: Session, lanes: list[Lane]) -> dict[int, np.ndarray]:
    """全候補レーンに登場する商品の埋め込みを 1 クエリでまとめて引く。

    relevance をレーンごとにクエリして計算すると候補レーン本数ぶん往復するので、
    候補が出そろった時点で一括取得して以後はメモリ上で計算する。
    """
    pids = {p.id for lane in lanes for p, _ in lane.items}
    if not pids:
        return {}
    rows = (
        db.query(ProductEmbedding.product_id, ProductEmbedding.embedding)
        .filter(ProductEmbedding.product_id.in_(pids))
        .all()
    )
    return {pid: np.array(vec, dtype=np.float64) for pid, vec in rows}


# ---------- ページ構築（stage-wise 貪欲法）----------


def _safe_build(builder: Builder, ctx: HomeContext) -> list[Lane]:
    """1 本のビルダーの失敗をページ全体に波及させない。"""
    try:
        return builder(ctx)
    except Exception as exc:  # noqa: BLE001 - ホームは何があっても 200 を返す
        logger.warning(
            "ホームのレーン生成に失敗しました builder=%s（このレーンを飛ばして継続）: %s",
            getattr(builder, "__name__", builder),
            exc,
        )
        ctx.db.rollback()
        return []


def build_page(ctx: HomeContext, max_lanes: int) -> tuple[list[Lane], str]:
    """候補レーンから stage-wise 貪欲法でページを組む。

    row-ranking（各行を独立にスコアして上から並べる）ではなく、「すでに選んだ行」と
    「すでに載せた商品」を込みでスコアし、1 行選ぶたびに残り全候補を再スコアする。
    再スコアこそがこの方式の本体で、静的ランキングとの唯一の差になる。

    重複排除は目的関数から創発させず、明示的なフィルタ工程として持つ。スコアの中に
    重複ペナルティを埋め込むと「少しだけ重複した強い行」が通ってしまい、契約の
    不変条件2（同じ商品が2セクションに出現しない）が保証ではなく傾向に落ちるため。
    """
    candidates: list[Lane] = []
    for builder in BUILDERS:
        candidates.extend(_safe_build(builder, ctx))

    embeddings = _safe(ctx.db, "embeddings", lambda: _load_embeddings(ctx.db, candidates)) or {}
    profile_vec = ctx.profile.profile_vec if ctx.profile is not None else None

    page: list[Lane] = []
    seen: set[int] = set()

    while len(page) < max_lanes and candidates:
        best: Lane | None = None
        best_score = 0.0
        survivors: list[Lane] = []

        for lane in candidates:
            # 工程1: 重複排除（明示的なフィルタ。目的関数の外側）。
            lane.items = [(p, r) for p, r in lane.items if p.id not in seen]
            # 工程2: 痩せたレーンを落とす。前のレーンに商品を奪われて min_items を
            # 割ったレーンは、ページに載せる価値が無いのでこの時点で候補から消える。
            if len(lane.items) < lane.min_items:
                continue
            survivors.append(lane)
            # 工程3: 再スコアリング。novelty が page に依存するため、直前に選ばれた
            # レーンを踏まえて毎イテレーション全候補を計算し直す。
            score = _score(lane, page, profile_vec, embeddings)
            if score > best_score:
                best, best_score = lane, score

        candidates = survivors
        if best is None or best_score < _SCORE_THRESHOLD:
            break

        best.items = best.items[: best.max_items]
        page.append(best)
        seen |= {p.id for p, _ in best.items}
        candidates = [lane for lane in candidates if lane is not best]

    # source: パーソナライズされたレーンが 1 本でも載れば personalized。
    source = "personalized" if any(lane.personalized for lane in page) else "popular"
    return page, source
