import os

# Ollama 未起動・未 pull・接続不可でも各サービスはフォールバックで動き続ける。
# ここは既定値を与えるだけで、存在確認は embedding サービス側で行う。

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
# 768 次元・多言語。日本語クエリの分離性能が乏しいモデル（nomic-embed-text で踏んだ）だと
# 全商品のベクトルが近距離に密集し、検索フィルタが効かなくなる。
OLLAMA_EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "embeddinggemma:latest")
OLLAMA_CHAT_MODEL = os.environ.get("OLLAMA_CHAT_MODEL", "gemma4:latest")

# ProductEmbedding の pgvector カラムと一致させること。
EMBED_DIM = 768

# embeddinggemma は用途別プレフィックスで検索精度が上がる（モデルカード推奨）。
# 文書側とクエリ側で異なるものを使う（非対称検索）。
EMBED_DOC_PREFIX = "title: none | text: "
EMBED_QUERY_PREFIX = "task: search result | query: "

# 最近傍ですらこの距離より遠いクエリは「意味的にヒットする商品が無い」とみなす絶対上限。
# カタログと無関係なクエリでカタログ全体が引っかかるのを防ぐ最後の砦。
SEMANTIC_SEARCH_MAX_DISTANCE = float(os.environ.get("SEMANTIC_SEARCH_MAX_DISTANCE", "0.85"))
# 最近傍距離 d_min からの相対マージン。距離の絶対値はクエリの具体度でスケールが変わるため、
# 絶対閾値だけでは具体的なクエリでノイズを拾い、抽象的なクエリで取りこぼす。
SEMANTIC_SEARCH_MARGIN = float(os.environ.get("SEMANTIC_SEARCH_MARGIN", "0.08"))
# しきい値だけだと語彙の広いクエリで大量にヒットし得るため、近い順に打ち切る上限。
SEMANTIC_SEARCH_CANDIDATES = int(os.environ.get("SEMANTIC_SEARCH_CANDIDATES", "50"))

# main.py の CORS 許可、mcp_server/errors.py の案内文、mcp_server/ui_assets.py の
# 画像URL・商品ページURLの組み立てがこの1箇所を参照する。環境変数にしていないのは、
# fail closed 検査・.env の管理・compose の受け渡しをもう1本増やす価値が無いため。
FRONTEND_ORIGIN = "http://localhost:3000"
