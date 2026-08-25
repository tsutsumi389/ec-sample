.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up up-d build down stop restart logs logs-backend logs-frontend ps \
        logs-mcp-apps backend-shell frontend-shell mcp-apps-shell db-shell \
        lint reset clean fonts secret \
        migrate migrate-new migrate-down migrate-status mcp-check mcp-ui-build \
        mcp-typecheck mcp-deps

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

logs-mcp-apps: ## MCP Apps（/mcp の画面部分）のビルドログを追跡
	$(COMPOSE) logs -f mcp-apps

## --- コンテナ操作 ------------------------------------------------
backend-shell: ## バックエンドコンテナでシェルを開く
	$(COMPOSE) exec backend bash

frontend-shell: ## フロントエンドコンテナでシェルを開く
	$(COMPOSE) exec frontend sh

mcp-apps-shell: ## MCP Apps コンテナでシェルを開く
	$(COMPOSE) exec mcp-apps sh

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
mcp-check: ## MCP サーバー(/mcp)の疎通確認（新旧プロトコル・ツール一覧・UIリソースの有無を表示）
	@curl -sS -X POST http://localhost:8000/mcp \
		-H 'Content-Type: application/json' \
		-H 'Accept: application/json, text/event-stream' \
		-d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
		| sed -n 's/^data: //p' \
		| python3 -c 'import json,sys; t=json.load(sys.stdin)["result"]["tools"]; print(f"{len(t)} tools:"); [print("  -", x["name"]) for x in t]' \
		|| { echo '--- /mcp のツール一覧を取得できませんでした。上のエラーが原因です。まず make logs-backend に MCP の読み込みエラーが出ていないか、依存を足したあと make up-d でイメージを作り直したかを確認してください'; exit 1; }
	@echo
	@# search_products / get_product は、mcp-apps コンテナがビルドした View
	@# （backend/app/mcp_server/ui/dist/{search,product}.html）を backend が読めたときだけ
	@# UI 付きで登録され、text/html;profile=mcp-app の ui:// リソースが resources/list に
	@# 載る。読めないときは apps_ui.py が素のツール登録にフォールバックする正常な状態
	@# （ツールは 11 本のまま）なので、ここは「なし」を表示するだけで exit 1 にはしない
	@# （mcp-check 自体を失敗させない）。dist は backend の import 時に一度だけ読まれる
	@# ので、ビルドが後から通った場合は backend の再起動が要る点にも注意。
	@curl -sS -X POST http://localhost:8000/mcp \
		-H 'Content-Type: application/json' \
		-H 'Accept: application/json, text/event-stream' \
		-d '{"jsonrpc":"2.0","id":2,"method":"resources/list"}' \
		| sed -n 's/^data: //p' \
		| python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]["resources"]; ui=[x["uri"] for x in r if x.get("mimeType")=="text/html;profile=mcp-app"]; print("UIリソース:", ", ".join(ui) if ui else "なし（make logs-mcp-apps でビルドの状況を確認できます）")'
	@echo
	@# ここから下は 2026-07-28（stateless core・ヘッダルーティング・server/discover）の経路。
	@# **上の2本が通っても、新仕様側が壊れていないことの証明にはならない。** SDK は
	@# MCP-Protocol-Version ヘッダ「だけ」を見て新旧を振り分けており（mcp 2.0.0 の
	@# streamable_http_manager が、既知のハンドシェイク版以外を _streamable_http_modern
	@# へ回す）、ヘッダを送らない上の2本は必ず旧経路（2025-11-25 でネゴシエート）を通る。
	@# 新仕様の要求は2つあり、どちらを欠いても 400 になる:
	@#   - method（tools/call なら name も）を mcp-method / mcp-name ヘッダに複製する。
	@#     本文と食い違うと -32020。
	@#   - params._meta に io.modelcontextprotocol/protocolVersion と
	@#     .../clientCapabilities の封筒を入れる（initialize が無くなった代わり）。
	@# **応答は素の JSON で返る**（SSE ではない）ので、上の2本の sed でのフレーム剥がしは
	@# ここには要らない。逆に足すと空を食わせることになる。
	@curl -sS -X POST http://localhost:8000/mcp \
		-H 'Content-Type: application/json' \
		-H 'Accept: application/json, text/event-stream' \
		-H 'MCP-Protocol-Version: 2026-07-28' \
		-H 'mcp-method: server/discover' \
		-d '{"jsonrpc":"2.0","id":3,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' \
		| python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; ext=list(r.get("capabilities",{}).get("extensions",{})); print("2026-07-28 server/discover: OK  拡張:", ", ".join(ext) if ext else "なし")' \
		|| { echo '--- 2026-07-28 の経路で server/discover に失敗しました。旧経路（上の tools/list）が通っているならツール登録は無事で、壊れているのは新仕様側の口です。mcp SDK を上げた直後なら、要求されるヘッダ・封筒の形が変わっていないか確認してください'; exit 1; }
	@# ツール本数が旧経路（上の tools/list）と食い違っていたら、どちらかの経路にだけ
	@# 登録が漏れている。並べて出しているのはそれを目で拾うため。
	@curl -sS -X POST http://localhost:8000/mcp \
		-H 'Content-Type: application/json' \
		-H 'Accept: application/json, text/event-stream' \
		-H 'MCP-Protocol-Version: 2026-07-28' \
		-H 'mcp-method: tools/list' \
		-d '{"jsonrpc":"2.0","id":4,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' \
		| python3 -c 'import json,sys; t=json.load(sys.stdin)["result"]["tools"]; ui=[x["name"] for x in t if x.get("_meta",{}).get("ui")]; print(f"2026-07-28 tools/list: {len(t)} tools（UI付き: " + (", ".join(ui) if ui else "なし") + "）")' \
		|| { echo '--- 2026-07-28 の経路で tools/list に失敗しました'; exit 1; }

## --- MCP Apps（/mcp の画面部分） ----------------------------------
# View（検索結果カード一覧・商品詳細パネル）は mcp-apps コンテナが watch ビルド
# （`npm run dev`）で常時作り直しているので、通常このターゲットは要らない。取りこぼしたときや、
# 依存を入れ替えた直後に手で流し直すためのもの。出力先は
# backend/app/mcp_server/ui/dist/{search,product}.html。
# **up / up-d の前提条件には入れないこと**（fonts / secret とは違う）。フォントを
# ホスト側の前提条件にしてあるのは「コンテナから取りに行くと失敗するから」であって、
# View のビルドはコンテナの中で完結する——ここに前提条件を足すと、ホストに Node が
# 必要という環境依存を復活させることになる。
mcp-ui-build: ## MCP Apps の View を1回だけビルドし直す
	$(COMPOSE) run --rm mcp-apps npm run build

# **ビルドは型を見ない。** Vite 8 は rolldown/oxc で型注釈を落とすだけで検査しないので、
# 型エラーがあっても `npm run build` は成功し、logs-mcp-apps にも何も出ない（実行時まで
# 残る）。フロントの `make lint` にあたるものがここに無いと、mcp-apps だけが素通りになる。
# ホストで `npm run typecheck` を叩かせないのは mcp-ui-build と同じ理由——ホストに Node が
# 必要という環境依存を復活させないため。
mcp-typecheck: ## MCP Apps の View を型検査（tsc --noEmit）
	$(COMPOSE) run --rm mcp-apps npm run typecheck

# **mcp-apps/package.json に依存を足したら、`make up-d` では反映されない。**
# node_modules は匿名ボリュームでコンテナ側に隔離してあり（docker-compose.yml の
# コメント参照）、`docker compose up` は**コンテナを作り直しても匿名ボリュームは
# 引き継ぐ**ため、イメージを新しくしても中身は古いままになる。そのまま watch ビルドが
# 走ると、解決できなかった依存が `import ... from "react-dom/client"` の形で残った
# HTML が dist へ書き出され（ビルドは非ゼロ終了するがファイルは書かれた後）、backend が
# それを読んで白画面の View を配る。実際に踏んだ経路で、いまは
# scripts/check-dist.ts がこの形の成果物を書く前に落とす。
# -V（--renew-anon-volumes）が匿名ボリュームをイメージの中身で作り直す。
mcp-deps: ## MCP Apps の依存を入れ直す（package.json を変えたら必ず）
	$(COMPOSE) up -d --build -V mcp-apps

## --- 開発補助 ----------------------------------------------------
lint: ## フロントエンドの Lint を実行
	$(COMPOSE) exec frontend npm run lint

## --- クリーンアップ ----------------------------------------------
reset: secret ## DB を含めて全て削除して初期状態に戻す（シードデータ再投入）
	$(COMPOSE) down -v
	$(COMPOSE) up --build -d

clean: ## コンテナ・ボリューム・イメージを削除
	$(COMPOSE) down -v --rmi local
