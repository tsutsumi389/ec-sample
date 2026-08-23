# CLAUDE.md

Docker 上で動くECサイトのサンプル（Next.js 14 + FastAPI + PostgreSQL 16）。

## コマンド

開発操作はすべて `Makefile` に集約。まず `make help` を見ること。URL・テストアカウント・機能概要は `README.md`。

## 破ってはならない不変条件

コードに現れない暗黙の前提のうち、**どこを触っていても効くもの**だけをここに置く。各項目の背景と実装の詳細は下の「規律の在り処」にある。

- **商品の可視性・購入可否は `Product.status` が唯一の源**（6状態。個別の真偽フラグを増やさない）。**外から任意に指定できる商品IDを引くクエリには必ず status を添える**——絞り忘れると `draft` の商品名が外へ出る。
- **商品は物理削除しない**。`status="archived"` にする。
- **実売価格は `effective_price`**（`sale_price` があればそれ、なければ `price`）。`price` を直接使わない。**金額をクライアントで組まない**。
- **`OrderItem` は注文時点のスナップショット**。商品マスタから再計算しない。
- **`visitor_id`（`X-Visitor-Id`）は計測専用**。認証にも所有の判断にも一切使わない。
- **成果計測はサーバー側が正**。重要指標をフロントの `track()` だけに依存させない。
- **アシスタントへ送る「いま見ている画面」は `route` と `product_id` だけ**。商品名・価格をクライアントから受け取らない。
- **ログインへ送る導線は `?redirect=` で現在地を引き継ぎ、受け側は必ず `safeRedirect()` を通す**（オープンリダイレクト対策）。
- **スキーマ変更は Alembic のリビジョンだけ**（`Base.metadata.create_all` は使わない）。**適用済みのリビジョンは書き換えない**——訂正は新しいリビジョンで。
- **`SECRET_KEY` はリポジトリに置かない・既定値を持たせない**（`make secret` が `.env` に生成）。`docker-compose.yml` に実値を書き戻さない。
- **バックエンドの全ルートは `/api` 配下**。例外は `/mcp` の1本だけ。CORS 許可は `http://localhost:3000` のみ。
- **同じ判定を経路ごとに書かない**。在庫・金額・計測は必ず1か所に寄せる（`merge_lines()`・`get_neighbors_of()`・`ProductCard` の `data-track-*`）。

## 規律の在り処

触るディレクトリの CLAUDE.md がそのとき読み込まれる。**上の不変条件と食い違ったら、詳細側が唯一の源**。

| 場所 | 中身 |
|---|---|
| `backend/CLAUDE.md` | 商品・価格・注文、カート、アシスタントの画面契約、計測と A/Bテスト、認証、ルーティング |
| `backend/alembic/CLAUDE.md` | マイグレーションの運用（生成・手直し・巻き戻し、`0001`〜`0004` の役割）。モデルを変えるときも読む |
| `backend/app/mcp_server/CLAUDE.md` | `/mcp` の実装（ルーター委譲・`confirm_token`・Apps UI の登録順序と排他・フォールバック） |
| `frontend/CLAUDE.md` | アシスタントの開閉と幅、ゲストカート、戻り先、計測の器、Webフォントと和文組版 |
| `mcp-apps/CLAUDE.md` | `/mcp` の View（TypeScript + React + Vite の別コンテナ） |

## 変更時の検証

| 変えたもの | 通すもの |
|---|---|
| フロント（`frontend/`） | `make lint` |
| バックエンド（`backend/`） | `make up-d` → `make logs-backend`（起動時にマイグレーションとシードが走る） |
| モデル（`app/models.py`） | 追随するリビジョンを1本足し、`docker compose exec backend alembic check` が「No new upgrade operations detected.」 |
| バックエンドの純ロジック | `docker compose exec backend python -m pytest tests/ -q`（`backend/tests/` は DB 不要のテストのみ） |
| MCP Apps の View（`mcp-apps/`） | `mcp-apps/CLAUDE.md` の「検証」（`make mcp-deps` / `mcp-typecheck` / `mcp-check`） |
