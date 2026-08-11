"""MCP サーバーのパッケージ。**ここには何も書かない（import も置かない）。**

server を再輸出すると `app.mcp_server.confirm` を触っただけで `app.auth` が芋づるで
読まれ、SECRET_KEY を持たない環境（= backend/tests/）で確認トークンの純ロジックテストが
起動できなくなる。パッケージの入口を空に保つことがその独立性を守っている。
"""
