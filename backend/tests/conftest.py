"""pytest 設定。backend ルートを import パスに載せて app パッケージを解決する。

ここのテストは DB を張らない純ロジックだけを対象にする（PostgreSQL・Ollama へ接続しない）。
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
