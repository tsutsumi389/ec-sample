"""商品のアプリケーションサービス（一覧・詳細・関連・レビュー・閲覧記録）。

一覧検索は「クエリを埋め込むか」「相対カットオフでどこまで意味的候補を採るか」という
業務判断だけをここで行い、クエリ組み立て・実行は repositories.product に委譲する
（ハイブリッド検索の詳細は product_repo.search_listing を参照）。
可視性判定（is_viewable）は Product.status から導出する単一の情報源に従う。
"""

from sqlalchemy.orm import Session

from app.config import (
    SEMANTIC_SEARCH_CANDIDATES,
    SEMANTIC_SEARCH_MARGIN,
    SEMANTIC_SEARCH_MAX_DISTANCE,
)
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.presenters import to_product_out, to_review_out
from app.models import Product, Review, User
from app.repositories import order as order_repo
from app.repositories import product as product_repo
from app.repositories import review as review_repo
from app.schemas import ProductListOut, ProductOut, ReviewCreate, ReviewOut, SuggestOut
from app.services import embedding, recommendation


def _get_viewable(db: Session, product_id: int) -> Product:
    """商品ページとして閲覧可能な商品を取得する。不可なら 404。"""
    product = product_repo.get(db, product_id)
    if product is None or not product.is_viewable:
        raise NotFoundError("Product not found")
    return product


def list_products(
    db: Session,
    *,
    search: str | None,
    category_id: int | None,
    sort: str | None,
    min_price: int | None,
    max_price: int | None,
    page: int,
    limit: int,
    current_user: User | None,
) -> ProductListOut:
    # 検索はハイブリッド（キーワード + セマンティック）。クエリを埋め込み、成功したら
    # 「名前の部分一致」または「意味的に近い商品」を拾う。Ollama 停止等で埋め込めない場合は
    # query_vec が None になり、従来の ILIKE のみへフォールバックして検索を止めない。
    query_vec = embedding.embed_query(search) if search else None

    # 意味的候補を実際に採るか。距離の絶対値はクエリの具体度でスケールが変わるため、
    # 最近傍距離 d_min を測り「最も近い商品からマージン以内」の相対基準で足切りする
    # （絶対上限 MAX_DISTANCE は最後の砦）。採らないときは semantic_ids=None のまま。
    semantic_ids: list[int] | None = None
    if search and query_vec is not None:
        d_min = product_repo.min_semantic_distance(db, query_vec)
        if d_min is not None and d_min <= SEMANTIC_SEARCH_MAX_DISTANCE:
            cutoff = min(d_min + SEMANTIC_SEARCH_MARGIN, SEMANTIC_SEARCH_MAX_DISTANCE)
            semantic_ids = product_repo.semantic_candidate_ids(
                db, query_vec, cutoff, SEMANTIC_SEARCH_CANDIDATES
            )

    # recommended ソートはログインユーザーのプロフィールベクトルで並べ替える。
    # プロフィールが作れない（未ログイン・行動ゼロ・埋め込み欠損）なら人気順に落とす。
    profile_vec = None
    if sort == "recommended" and current_user is not None:
        profile = recommendation.build_profile(db, current_user.id)
        if profile is not None:
            profile_vec = profile.profile_vec.tolist()

    rows, total = product_repo.search_listing(
        db,
        search=search,
        category_id=category_id,
        min_price=min_price,
        max_price=max_price,
        sort=sort,
        page=page,
        limit=limit,
        semantic_ids=semantic_ids,
        query_vec=query_vec,
        profile_vec=profile_vec,
    )
    items = [to_product_out(product, avg, count) for product, avg, count in rows]
    return ProductListOut(items=items, total=total)


def suggest(db: Session, q: str, limit: int) -> SuggestOut:
    """検索サジェスト。2 文字未満は候補過多になるだけなので即空で返す（DB も引かない）。"""
    query = q.strip()
    if len(query) < 2:
        return SuggestOut(suggestions=[])
    return SuggestOut(suggestions=product_repo.suggest_names(db, query, limit))


def get_product(db: Session, product_id: int) -> ProductOut:
    product = _get_viewable(db, product_id)
    avg_rating, review_count = review_repo.rating_stats(db, product_id)
    return to_product_out(product, avg_rating, review_count)


def record_view(db: Session, user: User | None, product_id: int) -> None:
    """商品閲覧を記録する。ゲスト（未ログイン）は履歴を持たないので何もしない。"""
    if user is None:
        return
    _get_viewable(db, product_id)
    product_repo.upsert_view(db, user.id, product_id)
    db.commit()


def list_related(db: Session, product_id: int) -> list[ProductOut]:
    product = _get_viewable(db, product_id)
    if product.category_id is None:
        return []
    related = product_repo.related_by_category(db, product.category_id, product_id, 4)
    return [to_product_out(p, *review_repo.rating_stats(db, p.id)) for p in related]


def list_recommendations(db: Session, product_id: int, limit: int) -> list[ProductOut]:
    """商品ページ用の関連おすすめ（LLM 不使用）。

    対象商品の埋め込みのコサイン近傍を返す。未生成/近傍ゼロなら同カテゴリにフォールバック。
    """
    product = _get_viewable(db, product_id)

    target_emb = product_repo.get_embedding(db, product_id)
    if target_emb is not None:
        neighbors = product_repo.neighbors_by_embedding(
            db, target_emb.embedding, product_id, limit
        )
        if neighbors:
            return [
                to_product_out(p, *review_repo.rating_stats(db, p.id))
                for p in neighbors
            ]

    if product.category_id is None:
        return []
    related = product_repo.related_by_category(
        db, product.category_id, product_id, limit
    )
    return [to_product_out(p, *review_repo.rating_stats(db, p.id)) for p in related]


def list_reviews(db: Session, product_id: int) -> list[ReviewOut]:
    _get_viewable(db, product_id)
    rows = review_repo.list_for_product(db, product_id)
    return [to_review_out(review, user_name) for review, user_name in rows]


def create_review(
    db: Session, user: User, product_id: int, payload: ReviewCreate
) -> ReviewOut:
    _get_viewable(db, product_id)

    if not order_repo.has_user_purchased_product(db, user.id, product_id):
        raise ForbiddenError("Purchase required to review")

    if review_repo.get_user_review(db, user.id, product_id) is not None:
        raise ConflictError("Already reviewed")

    review = Review(
        product_id=product_id,
        user_id=user.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    review_repo.add(db, review)
    db.commit()
    db.refresh(review)
    return to_review_out(review, user.name)
