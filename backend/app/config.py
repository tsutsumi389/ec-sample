import os

# レコメンド機能で使う環境変数を一元管理する。
# Ollama 未起動・未 pull・接続不可でも各サービスはフォールバックで動き続けるため、
# ここではデフォルト値を与えるだけで、存在確認は embedding サービス側で行う。

# Ollama サーバの接続先（backend コンテナから見たホスト名）。
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
# 埋め込み生成モデル（768 次元・多言語）。日本語クエリの分離性能が乏しかった
# nomic-embed-text から差し替えた（全商品が近距離に密集して検索フィルタが効かなかった）。
OLLAMA_EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "embeddinggemma:latest")
# レコメンド理由文を生成するチャットモデル。
OLLAMA_CHAT_MODEL = os.environ.get("OLLAMA_CHAT_MODEL", "gemma4:latest")

# 埋め込みベクトルの次元数。ProductEmbedding の pgvector カラムと一致させること。
EMBED_DIM = 768

# embeddinggemma は用途別プレフィックスを付けると検索精度が上がる（モデルカード推奨）。
# 文書側とクエリ側で異なるプレフィックスを使う（非対称検索）。
EMBED_DOC_PREFIX = "title: none | text: "
EMBED_QUERY_PREFIX = "task: search result | query: "

# セマンティック検索（ハイブリッド検索）の挙動を決めるしきい値。
# 最近傍ですらこの距離より遠いクエリは「意味的にヒットする商品が無い」とみなす絶対上限。
# カタログと無関係なクエリでカタログ全体が引っかかるのを防ぐ最後の砦として効かせる。
SEMANTIC_SEARCH_MAX_DISTANCE = float(os.environ.get("SEMANTIC_SEARCH_MAX_DISTANCE", "0.85"))
# 最近傍距離 d_min からの相対マージン。距離の絶対値はクエリの具体度でスケールが変わる
# （具体的なクエリは全体に近く、抽象的なクエリは全体に遠く出る）ため、絶対閾値だけでは
# 具体的なクエリでノイズを拾い、抽象的なクエリで取りこぼす。そこで「最も近い商品から
# マージン以内」という相対基準で足切りし、クエリごとのスケール差を吸収する。
SEMANTIC_SEARCH_MARGIN = float(os.environ.get("SEMANTIC_SEARCH_MARGIN", "0.08"))
# 意味的ヒットとして採用する最大候補数。しきい値だけだと語彙の広いクエリで大量に
# ヒットし得るため、距離が近い順に上限件数で打ち切って検索結果の質を保つ。
SEMANTIC_SEARCH_CANDIDATES = int(os.environ.get("SEMANTIC_SEARCH_CANDIDATES", "50"))
