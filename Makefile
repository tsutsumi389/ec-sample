.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up up-d build down stop restart logs logs-backend logs-frontend ps \
        backend-shell frontend-shell db-shell lint reset clean fonts secret \
        migrate migrate-new migrate-down migrate-status mcp-check

help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

## --- フォント ----------------------------------------------------
# Webフォントは自己ホスト。frontend コンテナには IPv6 経路が無く next/font の
# 一斉ダウンロードが大量に失敗する（しかも黙ってフォールバックに落ちる）ため、
# ホスト側で1回だけ取得して public/fonts/ に置く。詳細は scripts/fetch-fonts.mjs。
fonts: frontend/app/fonts.css ## Webフォントを取得（未取得のときだけ走る）

frontend/app/fonts.css:
	node frontend/scripts/fetch-fonts.mjs

## --- シークレット ------------------------------------------------
# JWT の署名鍵はデプロイごとに違う乱数でなければならない。HS256（対称鍵）なので、
# リポジトリに入った鍵は共有された時点で誰でも管理者トークンを偽造できる。
# compose は同ディレクトリの .env を自動で読むので、無ければここで作る（.gitignore 済み）。
secret: .env ## JWT 署名鍵を .env に生成（未生成のときだけ走る）

.env:
	@umask 077 && printf 'SECRET_KEY=%s\n' "$$(openssl rand -hex 32)" > $@
	@echo "SECRET_KEY を $@ に生成しました（コミットしないこと）"

## --- 起動・停止 --------------------------------------------------
up: fonts secret ## ビルドしてフォアグラウンドで起動（ログを表示）
	$(COMPOSE) up --build

up-d: fonts secret ## ビルドしてバックグラウンドで起動
	$(COMPOSE) up --build -d

build: ## イメージをビルド
	$(COMPOSE) build

down: ## コンテナを停止して削除
	$(COMPOSE) down

stop: ## コンテナを停止（削除はしない）
	$(COMPOSE) stop

restart: ## コンテナを再起動
	$(COMPOSE) restart

## --- 監視 --------------------------------------------------------
ps: ## コンテナの状態を表示
	$(COMPOSE) ps

logs: ## 全サービスのログを追跡
	$(COMPOSE) logs -f

logs-backend: ## バックエンドのログを追跡
	$(COMPOSE) logs -f backend

logs-frontend: ## フロントエンドのログを追跡
	$(COMPOSE) logs -f frontend

## --- コンテナ操作 ------------------------------------------------
backend-shell: ## バックエンドコンテナでシェルを開く
	$(COMPOSE) exec backend bash

frontend-shell: ## フロントエンドコンテナでシェルを開く
	$(COMPOSE) exec frontend sh

db-shell: ## PostgreSQL に psql で接続
	$(COMPOSE) exec db psql -U ec -d ecdb

## --- DB マイグレーション ------------------------------------------
# バックエンド起動時に自動で `upgrade head` が走るため、通常は make up-d だけでよい。
# 以下は手で流したいとき・新しいリビジョンを作るときに使う。
migrate: ## 未適用のマイグレーションを適用（alembic upgrade head）
	$(COMPOSE) exec backend alembic upgrade head

migrate-new: ## モデルの差分からリビジョンを生成（例: make migrate-new m="add product tags"）
	@test -n "$(m)" || { echo 'メッセージが必要です: make migrate-new m="add product tags"'; exit 1; }
	$(COMPOSE) exec backend alembic revision --autogenerate -m "$(m)"

migrate-down: ## マイグレーションを1つ戻す（alembic downgrade -1）
	$(COMPOSE) exec backend alembic downgrade -1

migrate-status: ## 適用済みリビジョンと履歴を表示
	$(COMPOSE) exec backend alembic current
	$(COMPOSE) exec backend alembic history

## --- MCP サーバー ------------------------------------------------
# /mcp は REST ではないので Swagger（/docs）に載らず、画面から壊れたことに気づけない。
# MCP 用の依存（mcp / sse-starlette）を足した直後は再ビルドが要り、`make restart` では
# ModuleNotFoundError のまま直らない——その取り違えをここで検出する。
# ホストから叩くこと。transport security の allowed_hosts に compose のサービス名
# （backend:8000）は入れていないので、コンテナ内から叩くと 421 になる。
mcp-check: ## MCP サーバー(/mcp)の疎通確認（ツール一覧を表示）
	@curl -sS -X POST http://localhost:8000/mcp \
		-H 'Content-Type: application/json' \
		-H 'Accept: application/json, text/event-stream' \
		-d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
		| sed -n 's/^data: //p' \
		| python3 -c 'import json,sys; t=json.load(sys.stdin)["result"]["tools"]; print(f"{len(t)} tools:"); [print("  -", x["name"]) for x in t]' \
		|| { echo '--- /mcp のツール一覧を取得できませんでした。上のエラーが原因です。まず make logs-backend に MCP の読み込みエラーが出ていないか、依存を足したあと make up-d でイメージを作り直したかを確認してください'; exit 1; }

## --- 開発補助 ----------------------------------------------------
lint: ## フロントエンドの Lint を実行
	$(COMPOSE) exec frontend npm run lint

## --- クリーンアップ ----------------------------------------------
reset: secret ## DB を含めて全て削除して初期状態に戻す（シードデータ再投入）
	$(COMPOSE) down -v
	$(COMPOSE) up --build -d

clean: ## コンテナ・ボリューム・イメージを削除
	$(COMPOSE) down -v --rmi local
