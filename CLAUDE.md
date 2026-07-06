# CLAUDE.md

Docker 上で動くECサイトのサンプル（Next.js 14 + FastAPI + PostgreSQL 16）。

## コマンド

開発操作はすべて `Makefile` に集約。まず `make help` を見ること。

- `make up` — 起動 / `make down` — 停止 / `make reset` — DB 作り直し＋シード再投入
- `make lint` — フロント Lint（`next lint`）
- `make db-shell` — psql 接続 / `make logs` — ログ追跡

URL・テストアカウント・機能概要は `README.md` を参照。

## コードから読み取れない運用ルール

以下はコードに現れない暗黙の前提。違反しやすいので厳守すること。

- **マイグレーションツール未導入**: テーブルは `Base.metadata.create_all`（`backend/app/main.py` の lifespan）で自動生成。モデルを変更したら `make reset` で DB を作り直さないと反映されない。Alembic 等は入れない前提。
- **商品は論理削除のみ**: `Product` を物理削除してはならない。`status="archived"` にする（旧 `is_active` フラグは廃止済み）。
- **商品の可視性・購入可否は `Product.status` が唯一の源**: `draft`/`coming_soon`/`on_sale`/`suspended`/`discontinued`/`archived` の6状態。一覧表示・商品ページ表示・購入可否はすべて status から導出する（`models.py` の `is_listed`/`is_viewable`/`purchasable` プロパティ、`LISTED_STATUSES`/`VIEWABLE_STATUSES`）。個別の真偽フラグを増やさないこと。
- **実売価格は `effective_price`**: `sale_price` があればそれ、なければ `price`。カート小計・注文金額・`OrderItem` スナップショットはすべて `effective_price` を使う（`price` を直接使わない）。
- **注文明細はスナップショット**: `OrderItem` は注文時点の `product_name`/`price` を保持する。商品マスタを参照して再計算しないこと。
- **API プレフィックス**: バックエンドの全ルートは `/api` 配下（`main.py` で一括登録）。CORS 許可は `http://localhost:3000` のみ。
- **テスト未整備**: テストコードは無い。追加する場合は `backend/`（pytest 想定）から。

## 変更時の検証

- フロント変更後は `make lint` を通す。
- バックエンド変更後は `make up-d` → `make logs-backend` で起動エラーがないか確認（起動時にテーブル作成とシードが走る）。
