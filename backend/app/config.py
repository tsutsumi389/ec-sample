import os

# レコメンド機能で使う環境変数を一元管理する。
# Ollama 未起動・未 pull・接続不可でも各サービスはフォールバックで動き続けるため、
# ここではデフォルト値を与えるだけで、存在確認は embedding サービス側で行う。

# Ollama サーバの接続先（backend コンテナから見たホスト名）。
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
# 埋め込み生成モデル（768 次元）。
OLLAMA_EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text:latest")
# レコメンド理由文を生成するチャットモデル。
OLLAMA_CHAT_MODEL = os.environ.get("OLLAMA_CHAT_MODEL", "gemma4:latest")

# 埋め込みベクトルの次元数。ProductEmbedding の pgvector カラムと一致させること。
EMBED_DIM = 768
