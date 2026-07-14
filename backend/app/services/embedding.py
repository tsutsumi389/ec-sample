"""商品テキストの埋め込み生成と ProductEmbedding の差分同期。

Ollama が未起動・未 pull・接続不可でも例外を握って警告ログを出すだけで静かに戻る。
埋め込みが 1 件も無くてもレコメンドは人気順フォールバックで動き続けるため、
ここでのエラーはアプリの起動や API の応答を絶対に止めない。
"""

import hashlib
import logging

import ollama
from sqlalchemy.orm import Session

from app.config import (
    EMBED_DIM,
    EMBED_DOC_PREFIX,
    EMBED_QUERY_PREFIX,
    OLLAMA_BASE_URL,
    OLLAMA_CHAT_MODEL,
    OLLAMA_EMBED_MODEL,
)
from app.models import Product, ProductEmbedding
from app.services import semantic_id

logger = logging.getLogger(__name__)

# archived は完全に対象外。それ以外（draft 含む）は将来公開に備えて埋め込んでおく。
_EMBED_TARGET_EXCLUDED = ("archived",)


def _client() -> ollama.Client:
    return ollama.Client(host=OLLAMA_BASE_URL, timeout=60)


def build_product_text(product: Product) -> str:
    """埋め込み元テキスト。名前・カテゴリ名・説明・価格帯を結合する。"""
    category_name = product.category.name if product.category is not None else "その他"
    price = product.effective_price
    # 価格帯をざっくり言語化して、近い価格の商品が近いベクトルになりやすくする。
    if price < 2000:
        price_band = "手頃な価格帯"
    elif price < 6000:
        price_band = "中価格帯"
    elif price < 15000:
        price_band = "やや高価格帯"
    else:
        price_band = "高価格帯"

    parts = [
        f"商品名: {product.name}",
        f"カテゴリ: {category_name}",
        f"説明: {product.description or ''}",
        f"価格帯: {price_band}（¥{price:,}）",
    ]
    return "\n".join(parts)


def _source_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Ollama で複数テキストを埋め込む。失敗時は例外を送出（呼び出し側で握る）。"""
    client = _client()
    response = client.embed(model=OLLAMA_EMBED_MODEL, input=texts)
    # ollama>=0.4 は typed オブジェクト（属性）/ 旧版は dict。両対応で取り出す。
    embeddings = getattr(response, "embeddings", None)
    if embeddings is None:
        embeddings = response["embeddings"]
    return [list(vec) for vec in embeddings]


def embed_query(text: str) -> list[float] | None:
    """検索クエリ文字列を 1 本のベクトルに埋め込む（セマンティック検索用）。

    商品埋め込みと同じモデルでクエリを埋め込み、pgvector のコサイン距離で近傍を引く。
    Ollama 未起動・未 pull・接続不可なら例外を握って警告ログを出し None を返す。
    呼び出し側は None のとき ILIKE の部分一致だけにフォールバックして検索を止めない。
    """
    try:
        # クエリ側プレフィックスを付けて埋め込む（文書側と非対称・モデルカード推奨）。
        vectors = _embed_texts([EMBED_QUERY_PREFIX + text])
    except Exception as exc:  # noqa: BLE001 - Ollama 未起動/未pull は静かに戻る
        logger.warning(
            "検索クエリの埋め込みに失敗しました（ILIKE 部分一致にフォールバックします）: %s / "
            "ホストの Ollama が起動しているか、対象モデルが pull 済みか確認してください",
            exc,
        )
        return None

    vector = vectors[0]
    if len(vector) != EMBED_DIM:
        logger.warning(
            "検索クエリの埋め込み次元が想定外です got=%s expected=%s（ILIKE のみで検索します）",
            len(vector),
            EMBED_DIM,
        )
        return None
    return vector


def check_ollama_health() -> bool:
    """埋め込み・チャットの 2 モデルが pull 済みかを確認して bool を返す（起動ログ用）。"""
    try:
        client = _client()
        listed = client.list()
        # ollama>=0.4 は typed オブジェクトを返すため属性アクセスで名前を集める。
        models = getattr(listed, "models", None)
        if models is None:
            models = listed["models"]
        names = {getattr(m, "model", None) or getattr(m, "name", None) for m in models}
        # タグ違い（:latest 省略など）も許容するため前方一致で判定する。
        def _present(target: str) -> bool:
            base = target.split(":")[0]
            return any(n and (n == target or n.split(":")[0] == base) for n in names)

        return _present(OLLAMA_EMBED_MODEL) and _present(OLLAMA_CHAT_MODEL)
    except Exception as exc:  # noqa: BLE001 - health check は失敗しても落とさない
        logger.warning("Ollama ヘルスチェック失敗: %s（ホストの Ollama が起動しているか、対象モデルが pull 済みか確認してください）", exc)
        return False


def sync_embeddings(db: Session, *, force: bool = False) -> int:
    """全商品（archived 除く）の埋め込みを差分同期する。

    ProductEmbedding が無い / source_hash 不一致 / embed_model 不一致のものだけ
    再埋め込みして upsert する。force=True なら全件を強制再計算する（rebuild 用）。
    1 件でも変化があれば semantic_id を全体再割り当てする。
    戻り値は再埋め込みした件数。
    """
    products = (
        db.query(Product)
        .filter(Product.status.notin_(_EMBED_TARGET_EXCLUDED))
        .order_by(Product.id)
        .all()
    )
    existing = {e.product_id: e for e in db.query(ProductEmbedding).all()}

    # (product, text, hash) の並びで再埋め込みが必要なものだけ集める。
    pending: list[tuple[Product, str, str]] = []
    for product in products:
        text = build_product_text(product)
        digest = _source_hash(text)
        current = existing.get(product.id)
        needs = (
            force
            or current is None
            or current.source_hash != digest
            or current.embed_model != OLLAMA_EMBED_MODEL
        )
        if needs:
            pending.append((product, text, digest))

    if not pending:
        return 0

    try:
        # 文書側プレフィックスを付けて埋め込む（非対称検索・モデルカード推奨）。
        # source_hash は生テキストから計算するので差分検知には影響しない。
        vectors = _embed_texts([EMBED_DOC_PREFIX + text for _, text, _ in pending])
    except Exception as exc:  # noqa: BLE001 - Ollama 未起動/未pull は静かに戻る
        logger.warning(
            "埋め込み生成に失敗しました（フォールバック動作を継続します）: %s / "
            "ホストの Ollama が起動しているか、対象モデルが pull 済みか確認してください",
            exc,
        )
        return 0

    for (product, _text, digest), vector in zip(pending, vectors):
        if len(vector) != EMBED_DIM:
            logger.warning(
                "埋め込み次元が想定外です product_id=%s got=%s expected=%s",
                product.id,
                len(vector),
                EMBED_DIM,
            )
            continue
        current = existing.get(product.id)
        if current is None:
            db.add(
                ProductEmbedding(
                    product_id=product.id,
                    embedding=vector,
                    source_hash=digest,
                    embed_model=OLLAMA_EMBED_MODEL,
                )
            )
        else:
            current.embedding = vector
            current.source_hash = digest
            current.embed_model = OLLAMA_EMBED_MODEL
    db.commit()

    # 埋め込み集合が変化したのでセマンティックIDを全体再割り当てする。
    try:
        semantic_id.reassign_semantic_ids(db)
    except Exception as exc:  # noqa: BLE001 - SID 再割り当ての失敗も落とさない
        logger.warning("セマンティックID再割り当てに失敗しました: %s", exc)

    return len(pending)


def refresh_product_embedding(db: Session, product_id: int) -> None:
    """単一商品の再埋め込み + セマンティックID再割り当て（商品作成/更新から呼ぶ）。

    失敗しても本体処理に影響させないよう、例外は握って警告ログのみ出す。
    """
    product = db.get(Product, product_id)
    if product is None or product.status in _EMBED_TARGET_EXCLUDED:
        return

    text = build_product_text(product)
    digest = _source_hash(text)
    try:
        # 文書側プレフィックスを付けて埋め込む（sync_embeddings と同じ扱い）。
        vectors = _embed_texts([EMBED_DOC_PREFIX + text])
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "商品 %s の埋め込み更新に失敗しました（無視して継続）: %s / "
            "ホストの Ollama が起動しているか、対象モデルが pull 済みか確認してください",
            product_id,
            exc,
        )
        return

    vector = vectors[0]
    if len(vector) != EMBED_DIM:
        logger.warning("埋め込み次元が想定外です product_id=%s", product_id)
        return

    current = db.get(ProductEmbedding, product_id)
    if current is None:
        db.add(
            ProductEmbedding(
                product_id=product_id,
                embedding=vector,
                source_hash=digest,
                embed_model=OLLAMA_EMBED_MODEL,
            )
        )
    else:
        current.embedding = vector
        current.source_hash = digest
        current.embed_model = OLLAMA_EMBED_MODEL
    db.commit()

    try:
        semantic_id.reassign_semantic_ids(db)
    except Exception as exc:  # noqa: BLE001
        logger.warning("セマンティックID再割り当てに失敗しました: %s", exc)
