.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up up-d build down stop restart logs logs-backend logs-frontend ps \
        backend-shell frontend-shell db-shell lint reset clean

help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

## --- 起動・停止 --------------------------------------------------
up: ## ビルドしてフォアグラウンドで起動（ログを表示）
	$(COMPOSE) up --build

up-d: ## ビルドしてバックグラウンドで起動
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

## --- 開発補助 ----------------------------------------------------
lint: ## フロントエンドの Lint を実行
	$(COMPOSE) exec frontend npm run lint

## --- クリーンアップ ----------------------------------------------
reset: ## DB を含めて全て削除して初期状態に戻す（シードデータ再投入）
	$(COMPOSE) down -v
	$(COMPOSE) up --build -d

clean: ## コンテナ・ボリューム・イメージを削除
	$(COMPOSE) down -v --rmi local
