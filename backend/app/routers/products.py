from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Integer, case, func, literal, or_, select
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_current_user_optional
from app.config import (
    SEMANTIC_SEARCH_CANDIDATES,
    SEMANTIC_SEARCH_MARGIN,
    SEMANTIC_SEARCH_MAX_DISTANCE,
)
from app.database import get_db
from app.models import (
    LISTED_STATUSES,
    Order,
    OrderItem,
    Product,
    ProductEmbedding,
    ProductView,
    Review,
    User,
)
from app.schemas import (
    ProductListOut,
    ProductOut,
    ReviewCreate,
    ReviewOut,
    SuggestOut,
    SuggestProductOut,
)
from app.services import embedding, product_view, recommendation

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=ProductListOut)
def list_products(
    search: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    sort: str | None = Query(default=None),
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=100),
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ProductListOut:
    conditions = [Product.status.in_(LISTED_STATUSES)]
    # 検索はハイブリッド（キーワード + セマンティック）。まずクエリを埋め込み、成功したら
    # 「商品名の部分一致」または「意味的に近い商品」のどちらかにヒットすれば拾う。
    # 部分一致だけでは表記揺れや雰囲気検索（例: 雨の日に便利なもの）を取りこぼすため。
    # Ollama 停止等で埋め込めない場合は query_vec が None になり、従来の ILIKE のみに
    # フォールバックして検索を止めない。
    query_vec = embedding.embed_query(search) if search else None
    # 意味的候補の商品ID（距離の近い順）。空なら意味的候補は使わなかったということで、
    # 絞り込みにも並び順にも効かせない。query_vec があっても最近傍が絶対上限より遠ければ
    # 空のままになるため、query_vec の有無だけでは判定できない。
    semantic_ids: list[int] = []
    if search:
        if query_vec is not None:
            semantic_distance = ProductEmbedding.embedding.cosine_distance(query_vec)
            # 距離の絶対値はクエリの具体度でスケールが変わる（具体的なクエリは全体に近く、
            # 抽象的なクエリは全体に遠く出る）ため、固定閾値だけでは具体的なクエリで
            # ノイズを拾い、抽象的なクエリで取りこぼす。そこで最近傍距離 d_min を測り、
            # 「最も近い商品からマージン以内」の相対基準で足切りする（絶対上限は最後の砦）。
            #
            # 候補は 1 回のスキャンで確定させて ID 列として持つ。ANN インデックスが無く
            # コサイン距離は全件計算なので（0002 に HNSW を張っていない）、min() の測定と
            # 件数クエリと本体クエリでサブクエリを 3 回展開すると同じ全件スキャンを 3 回払う。
            # 距離昇順に並べてあるので先頭が d_min そのものになり、足切りは Python 側で済む。
            rows = db.execute(
                select(ProductEmbedding.product_id, semantic_distance.label("distance"))
                .order_by(semantic_distance)
                .limit(SEMANTIC_SEARCH_CANDIDATES)
            ).all()
            if rows and rows[0].distance <= SEMANTIC_SEARCH_MAX_DISTANCE:
                cutoff = min(
                    rows[0].distance + SEMANTIC_SEARCH_MARGIN, SEMANTIC_SEARCH_MAX_DISTANCE
                )
                semantic_ids = [pid for pid, distance in rows if distance <= cutoff]
        if semantic_ids:
            conditions.append(
                or_(
                    Product.name.ilike(f"%{search}%"),
                    Product.id.in_(semantic_ids),
                )
            )
        else:
            # 埋め込み不可（Ollama 停止等）or 最近傍が遠すぎる → 従来の部分一致のみ。
            conditions.append(Product.name.ilike(f"%{search}%"))
    if category_id is not None:
        conditions.append(Product.category_id == category_id)
    if min_price is not None:
        conditions.append(Product.price >= min_price)
    if max_price is not None:
        conditions.append(Product.price <= max_price)

    total = db.scalar(select(func.count()).select_from(Product).where(*conditions)) or 0

    rating_subq = (
        select(
            Review.product_id.label("product_id"),
            func.avg(Review.rating).label("avg_rating"),
            func.count(Review.id).label("review_count"),
        )
        .group_by(Review.product_id)
        .subquery()
    )

    stmt = (
        select(Product, rating_subq.c.avg_rating, rating_subq.c.review_count)
        .outerjoin(rating_subq, rating_subq.c.product_id == Product.id)
        .where(*conditions)
    )

    if sort == "newest":
        stmt = stmt.order_by(Product.created_at.desc(), Product.id.desc())
    elif sort == "price_asc":
        stmt = stmt.order_by(Product.price.asc(), Product.id)
    elif sort == "price_desc":
        stmt = stmt.order_by(Product.price.desc(), Product.id)
    elif sort == "rating":
        stmt = stmt.order_by(rating_subq.c.avg_rating.desc().nullslast(), Product.id)
    elif sort == "recommended":
        # おすすめ順。ログインユーザーはプロフィールベクトルとのコサイン近傍で並べ替え、
        # プロフィールが作れない場合（未ログイン・行動ゼロ・埋め込み欠損）は人気順に落とす。
        # 一覧なので購入済み商品も除外せず、並び順だけを変える（レコメンド枠の候補抽出とは
        # 目的が違い、ここでは「品揃え全体を好みに寄せて見せる」ため除外しない）。
        # 既知の制約: プロフィールはリクエスト毎に再計算され、時間減衰でベクトルが
        # わずかに動くため、ページ間で近接タイの商品が重複/欠落し得る。厳密な整合には
        # プロフィールの短期キャッシュが要るが、サンプル規模では許容する。
        profile = (
            recommendation.build_profile(db, current_user.id) if current_user else None
        )
        if profile is not None:
            stmt = stmt.outerjoin(
                ProductEmbedding, ProductEmbedding.product_id == Product.id
            ).order_by(
                ProductEmbedding.embedding.cosine_distance(
                    profile.profile_vec.tolist()
                ).nullslast(),
                Product.id,
            )
        else:
            # 人気順フォールバック。「何が売れたか」の定義は get_popular_products と共有する
            # （services/recommendation.py の purchase_count_subquery）。
            # 注文数 desc → 平均評価 desc → 新着 desc。
            popularity_subq = recommendation.purchase_count_subquery()
            stmt = stmt.outerjoin(
                popularity_subq, popularity_subq.c.product_id == Product.id
            ).order_by(
                func.coalesce(popularity_subq.c.purchased, 0).desc(),
                rating_subq.c.avg_rating.desc().nullslast(),
                Product.created_at.desc(),
                Product.id.desc(),
            )
    elif semantic_ids:
        # sort 未指定 かつ 意味的候補を実際に使ったときだけ「関連度順」で並べる。
        # 名前に一致した商品を意味的ヒットより先に見せたいので、まず名前一致(0)を優先し、
        # 次に意味的な近さの順、最後に id で安定化する。
        # 近さは semantic_ids の並び（= 上のスキャンで距離昇順に確定済み）をそのまま使い、
        # ORDER BY で距離を計算し直さない。ここで cosine_distance を書くと、候補を 1 回の
        # スキャンで確定させた意味が消え、しかも OFFSET/LIMIT の前に評価されるので
        # 「返す 12 件」ではなくヒット全件ぶんの 768 次元計算をもう一度払うことになる。
        # 名前だけで一致して意味的候補に入らなかった商品は位置が NULL になり、
        # 名前一致グループの末尾に回る。
        relevance_rank = case((Product.name.ilike(f"%{search}%"), 0), else_=1)
        semantic_rank = func.array_position(
            literal(semantic_ids, ARRAY(Integer)), Product.id
        )
        stmt = stmt.order_by(
            relevance_rank.asc(),
            semantic_rank.asc().nullslast(),
            Product.id,
        )
    else:
        stmt = stmt.order_by(Product.id)

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    rows = db.execute(stmt).all()

    items = [
        product_view.to_product_out(
            product,
            float(avg_rating) if avg_rating is not None else None,
            review_count or 0,
        )
        for product, avg_rating, review_count in rows
    ]

    return ProductListOut(items=items, total=total)


@router.get("/suggest", response_model=SuggestOut)
def suggest_products(
    q: str = Query(default=""),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
) -> SuggestOut:
    """検索サジェスト（キーワード候補 + 商品ダイレクト候補）。

    入力中の高頻度呼び出しに耐えるため、埋め込み等の重い処理は一切使わない。
    出品中（LISTED）商品の名前に対する ILIKE 部分一致だけで、以下の 2 種を返す:
      - suggestions: マッチした検索語（文字列）。前方一致を優先し名前順で安定化。同名は畳む。
      - products: マッチした商品そのもの（最大3件）。クリックで商品ページへ直行させる用途。
    どちらも同じエスケープ済みパターン・同じ関連度順（strpos → 名前長 → 名前）で引く。
    2 文字未満は候補過多になるだけなので即空で返す（DB も引かない）。
    ルート順の都合で /{product_id} より前に定義する（"suggest" が int パスに
    マッチして 422 になるのを避けるため）。
    """
    query = q.strip()
    if len(query) < 2:
        return SuggestOut(suggestions=[])

    # ILIKE のワイルドカード（% _ \）はエスケープしてリテラル一致にする。
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    # 関連度順で並べる（strpos はワイルドカードを特殊扱いしないので生クエリを使う）:
    #   ① マッチ位置が早いほど関連が高い（前方一致は pos=1 で自動的に最上位に来る）
    #   ② 同着なら商品名が短いほどクエリの比重が高く、関連度が高いとみなす
    #   ③ 最後に名前で安定化（ページングやタイの再現性のため）
    match_pos = func.strpos(func.lower(Product.name), query.lower())
    # 2 つのクエリが同じ条件・同じ並びであることを、写し間違いようのない形で担保する
    # （docstring の約束を copy-paste で守らない）。
    matches = (
        Product.status.in_(LISTED_STATUSES),
        Product.name.ilike(f"%{escaped}%", escape="\\"),
    )
    relevance = (
        match_pos.asc(),
        func.char_length(Product.name).asc(),
        Product.name.asc(),
    )
    rows = (
        db.execute(
            select(Product.name)
            .where(*matches)
            .group_by(Product.name)
            .order_by(*relevance)
            .limit(limit)
        )
        .scalars()
        .all()
    )

    # ダイレクト候補（商品本体）。suggestions と同じパターン・同じ関連度順で最大3件。
    # 埋め込みや集計は挟まない軽量クエリのみ。effective_price はモデルのプロパティを使う。
    product_rows = (
        db.execute(select(Product).where(*matches).order_by(*relevance).limit(3))
        .scalars()
        .all()
    )
    products = [SuggestProductOut.model_validate(p) for p in product_rows]
    return SuggestOut(suggestions=list(rows), products=products)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)) -> ProductOut:
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    avg_rating, review_count = product_view.rating_stats(db, product_id)
    return product_view.to_product_out(product, avg_rating, review_count)


@router.post("/{product_id}/view", status_code=status.HTTP_204_NO_CONTENT)
def record_product_view(
    product_id: int,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> None:
    """商品閲覧を記録する（パーソナライズのシグナル収集）。

    ゲスト（未ログイン）は履歴を持たないので何もせず 204 を返す。閲覧記録は
    ProductView に 1 ユーザー × 1 商品で 1 行だけ持ち、再閲覧時は viewed_at 更新 +
    view_count インクリメントで upsert する。並行初回閲覧で発生する一意制約違反は
    on_conflict_do_update で素直に吸収する（IntegrityError を握りつぶすより明快）。
    """
    if current_user is None:
        return None

    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    stmt = (
        pg_insert(ProductView)
        .values(user_id=current_user.id, product_id=product_id)
        .on_conflict_do_update(
            constraint="uq_product_view_user_product",
            set_={
                "viewed_at": func.now(),
                "view_count": ProductView.view_count + 1,
            },
        )
    )
    db.execute(stmt)
    db.commit()
    return None


@router.get("/{product_id}/related", response_model=list[ProductOut])
def list_related_products(product_id: int, db: Session = Depends(get_db)) -> list[ProductOut]:
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    return product_view.to_product_outs(
        db, recommendation.same_category_products(db, product, 4)
    )


@router.get("/{product_id}/recommendations", response_model=list[ProductOut])
def list_product_recommendations(
    product_id: int,
    limit: int = Query(default=4, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[ProductOut]:
    """商品ページ用の関連おすすめ（LLM 不使用・同期）。

    対象商品の埋め込みの pgvector コサイン近傍を返す（自分自身除外・LISTED のみ）。
    埋め込み未生成なら既存 /related と同じ同カテゴリフォールバックに落とす。
    """
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    neighbors = recommendation.get_neighbors_of(db, product_id, limit)
    if neighbors:
        return product_view.to_product_outs(db, neighbors)

    # 埋め込みが無い（または近傍ゼロ）→ /related と同じ同カテゴリフォールバック。
    return product_view.to_product_outs(
        db, recommendation.same_category_products(db, product, limit)
    )


@router.get("/{product_id}/reviews", response_model=list[ReviewOut])
def list_reviews(product_id: int, db: Session = Depends(get_db)) -> list[ReviewOut]:
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    rows = (
        db.query(Review, User.name)
        .join(User, Review.user_id == User.id)
        .filter(Review.product_id == product_id)
        .order_by(Review.created_at.desc(), Review.id.desc())
        .all()
    )
    return [
        ReviewOut(
            id=review.id,
            product_id=review.product_id,
            user_id=review.user_id,
            user_name=user_name,
            rating=review.rating,
            comment=review.comment,
            created_at=review.created_at,
        )
        for review, user_name in rows
    ]


@router.post("/{product_id}/reviews", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
def create_review(
    product_id: int,
    payload: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReviewOut:
    product = db.get(Product, product_id)
    if product is None or not product.is_viewable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    purchased = (
        db.query(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .filter(
            Order.user_id == current_user.id,
            Order.status != "cancelled",
            OrderItem.product_id == product_id,
        )
        .first()
    )
    if purchased is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Purchase required to review"
        )

    existing = (
        db.query(Review)
        .filter(Review.user_id == current_user.id, Review.product_id == product_id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already reviewed")

    review = Review(
        product_id=product_id,
        user_id=current_user.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    return ReviewOut(
        id=review.id,
        product_id=review.product_id,
        user_id=review.user_id,
        user_name=current_user.name,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )
