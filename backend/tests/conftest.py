"""pytest 設定。backend ルートを import パスに載せて app パッケージを解決する。

ここのテストは DB を張らない純ロジック（SID 照合・履歴切り詰め・プロンプト構築）だけを
対象にする。Ollama・PostgreSQL への接続は行わない。
"""

import os
import sys

# backend/ を sys.path に追加（tests/ の 1 つ上）。
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
