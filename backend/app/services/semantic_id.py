"""残差量子化（RQ-KMeans）による商品セマンティックIDの割り当て。

商品埋め込みを 3 階層で量子化し、各階層のクラスタ番号を並べた "a-b-c" 形式の
文字列をセマンティックIDとする。各階層はひとつ前の階層の残差（元ベクトルから
割り当てセントロイドを引いたもの）に対して KMeans をかける。
セントロイドは SemanticIdCodebook に世代管理で保存する。

商品数が極端に少ない場合でもクラッシュしないよう縮退処理を持つ。
"""

import logging

import numpy as np
from sklearn.cluster import KMeans
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import ProductEmbedding, SemanticIdCodebook

logger = logging.getLogger(__name__)

# 量子化の階層数と 1 階層あたりの最大クラスタ数。
_NUM_LEVELS = 3
_MAX_K = 8
_RANDOM_STATE = 42
# reassign を直列化するための advisory ロックキー（任意の固定値）。
_REASSIGN_LOCK_KEY = 918273645


def _fit_level(residuals: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
    """1 階層分の KMeans。クラスタ割当（labels）とセントロイド配列を返す。"""
    model = KMeans(n_clusters=k, n_init="auto", random_state=_RANDOM_STATE)
    labels = model.fit_predict(residuals)
    return labels, model.cluster_centers_


def reassign_semantic_ids(db: Session) -> None:
    """全 ProductEmbedding に対しセマンティックIDを再割り当てし、コードブックを保存する。

    埋め込みが 0 件なら何もしない。1 件だけ等 n<2 のときは "0-0-0" ベースの
    縮退 SID を割り当てて衝突回避のみ行う。

    商品の作成/更新ごとに並行して呼ばれ得るため、advisory ロックで直列化する。
    これがないと generation の採番（_next_generation の read→insert）が衝突して
    PK 重複になったり、複数タスクが全商品の semantic_id を相互に上書きし合う。
    """
    # トランザクション終了（commit / close）で自動解放される advisory ロックで直列化する。
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _REASSIGN_LOCK_KEY})

    embeddings = (
        db.query(ProductEmbedding).order_by(ProductEmbedding.product_id).all()
    )
    n = len(embeddings)
    if n == 0:
        return

    vectors = np.array([e.embedding for e in embeddings], dtype=np.float64)

    # 各階層の 3 コードを商品ごとに保持する。
    codes = np.zeros((n, _NUM_LEVELS), dtype=int)
    centroids_per_level: list[list[list[float]]] = []

    if n < 2:
        # クラスタリング不能。全商品を "0-0-0" に寄せ、後段のサフィックスで一意化する。
        for level in range(_NUM_LEVELS):
            centroids_per_level.append([vectors[0].tolist()] if level == 0 else [[0.0] * vectors.shape[1]])
    else:
        residuals = vectors.copy()
        for level in range(_NUM_LEVELS):
            k = min(_MAX_K, max(2, n))
            labels, centers = _fit_level(residuals, k)
            codes[:, level] = labels
            centroids_per_level.append(centers.tolist())
            # 残差を次階層へ渡す（元ベクトル − 割り当てセントロイド）。
            residuals = residuals - centers[labels]

    # "a-b-c" 文字列を作り、衝突は第 3 コードに連番サフィックスを付けて一意化する。
    seen: dict[str, int] = {}
    assignments: list[str] = []
    for i in range(n):
        base = f"{codes[i, 0]}-{codes[i, 1]}-{codes[i, 2]}"
        if base in seen:
            seen[base] += 1
            # 例: "2-4-1" が再出現したら "2-4-1-2", "2-4-1-3" ... と機械的に伸ばす。
            sid = f"{base}-{seen[base]}"
        else:
            seen[base] = 1
            sid = base
        assignments.append(sid)

    # コードブックを新世代として保存し、その generation を各行に刻む。
    generation = _next_generation(db)
    db.add(SemanticIdCodebook(generation=generation, centroids=centroids_per_level))

    for emb, sid in zip(embeddings, assignments):
        emb.semantic_id = sid
        emb.codebook_generation = generation

    # 旧世代のコードブックは参照されないため、最新世代だけ残して削除する。
    # 商品編集のたびに K×EMBED_DIM の centroids 行が単調増加してテーブルが肥大化するのを防ぐ。
    db.query(SemanticIdCodebook).filter(
        SemanticIdCodebook.generation != generation
    ).delete(synchronize_session=False)

    db.commit()
    logger.info("セマンティックID再割り当て完了: %s件 / generation=%s", n, generation)


def _next_generation(db: Session) -> int:
    latest = (
        db.query(SemanticIdCodebook)
        .order_by(SemanticIdCodebook.generation.desc())
        .first()
    )
    return (latest.generation + 1) if latest is not None else 1
