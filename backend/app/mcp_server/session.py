"""MCP ツールの実行環境（DB セッション ＋ エラー変換）。

セッションと例外変換を **1 つの with にまとめてある**。分けて置くと、片方を書き忘れた
ツールから SQLAlchemy の例外文（接続文字列・テーブル名・SQL 断片）がそのままモデルへ
出る——errors.py が存在する理由そのものが破れる。しかも忘れたことに気づけるのは、その
ツールが実際に例外を吐いたときだけなので、取り違えようがない形にしておく。

ツール本体は SDK がワーカースレッドで走らせるので、この中は普通の同期コードでよい。

**ORM を返す既存関数（create_order / list_orders / get_order / list_addresses）の戻り値は、
この with を抜ける前に Pydantic へ変換すること。** Order.items は遅延ロードなので、
セッションを閉じた後に触ると DetachedInstanceError になる。

**接続を掴んだまま Ollama を待たないこと。** search_products が呼ぶ list_products は最初の
DB クエリより前に embed_query（Ollama への同期 HTTP、タイムアウト 60 秒）を踏む。その前に
別のクエリを打つと接続がプールから確保済みになり、1 リクエストが最大 60 秒プール枠を
占有する。プールは pool_size=5 + max_overflow=10 の計 15 で、anyio のワーカースレッド上限は
40。**未認証で叩ける** search_products を 15 本並べるだけで /api 側（商品一覧・カート）まで
巻き込んでコネクション待ちにできる。ローカル開発の範囲を出るなら、engine に pool_timeout を
明示して詰まりを伝播させるか、検索用途の embed_query のタイムアウトを短くすること。
"""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy.orm import Session

from app.database import session_scope
from app.mcp_server.errors import domain_errors


@contextmanager
def tool_session() -> Iterator[Session]:
    """ツール本体はこれだけを使う。DB セッションと例外変換は必ず対で付く。"""
    with session_scope() as db, domain_errors():
        yield db
