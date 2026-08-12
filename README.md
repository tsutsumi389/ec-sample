# Hibino (ec-sample)

「Hibino — 日々の暮らしの道具店」を題材にしたECサイトのサンプルアプリケーションです。商品閲覧、カート、注文、管理者による商品・注文管理機能を備えています。

## 技術スタック

- **フロントエンド**: Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **バックエンド**: Python 3.12 + FastAPI + SQLAlchemy 2.0 + Pydantic v2
- **データベース**: PostgreSQL 16（pgvector 拡張）
- **AIレコメンド**: Ollama + pgvector + セマンティックID（商品埋め込みの残差量子化）
- すべて Docker コンテナ上で動作します。

## 起動方法

事前に [Docker](https://www.docker.com/) がインストールされている必要があります。

```bash
docker compose up --build
```

初回起動時に PostgreSQL のテーブル作成（マイグレーション適用）と初期データ（管理者/一般ユーザー、商品10件）の投入が自動的に行われます。

### 既存環境からの更新時（DBイメージの変更に注意）

AIレコメンド機能の追加に伴い、DB イメージを `postgres:16-alpine` から `pgvector/pgvector:pg16` に変更しました。alpine 系から debian 系への切り替えでデータボリュームに互換性がないため、既存環境から更新する場合は一度 DB を作り直す必要があります。

```bash
make reset
```

### AIレコメンド（LLM機能）の有効化

トップページのおすすめ理由などの LLM 生成機能は、**ホストPCで Ollama が稼働しており、`embeddinggemma:latest` / `gemma4:latest` が pull 済みであること**を前提とします。コンテナ内のバックエンドは `http://host.docker.internal:11434` 経由でホストの Ollama に接続します。

```bash
ollama pull embeddinggemma
ollama pull gemma4
```

Ollama が未稼働でも人気順フォールバックで動作するため、サイトの全機能はモデル未取得のままでも利用できます。

## DBマイグレーション

スキーマ変更は [Alembic](https://alembic.sqlalchemy.org/) のリビジョン（`backend/alembic/versions/`）で管理します。バックエンド起動時に未適用のリビジョンが自動で適用されるため、通常は起動するだけで DB が最新になります。

| コマンド | 内容 |
|---|---|
| `make migrate` | 未適用のマイグレーションを適用 |
| `make migrate-new m="..."` | モデルの差分からリビジョンを生成 |
| `make migrate-down` | マイグレーションを1つ戻す |
| `make migrate-status` | 適用済みリビジョンと履歴を表示 |

モデル（`backend/app/models.py`）を変更したら、必ずリビジョンを1本追加してください。生成されたファイルは自動生成の下書きなので、既存データの埋め方（NOT NULL 列を足すときの初期値など）は手で補います。

なお backend は `--reload` で動いているため、生成したリビジョンはファイルを置いた時点で自動適用されます。手直しするときは `make migrate-down` で戻してから編集し、`make migrate` で流し直してください。

Alembic 導入前に作成した DB は、起動時に現在のスキーマに対応するリビジョンとして自動的に記録されるため、作り直しは不要です。

## アクセスURL

| サービス | URL |
|---|---|
| フロントエンド | http://localhost:3000 |
| バックエンドAPI | http://localhost:8000 |
| APIドキュメント (Swagger UI) | http://localhost:8000/docs |
| MCPサーバー | http://localhost:8000/mcp（REST ではないため Swagger には載りません。後述の「MCP サーバー」を参照） |

## テストアカウント

| 種別 | メールアドレス | パスワード |
|---|---|---|
| 管理者 | admin@example.com | admin123 |
| 一般ユーザー | user@example.com | user123 |

## 主な機能

### 一般ユーザー向け

- 会員登録・ログイン（JWT認証）
- プロフィール編集（氏名変更・パスワード変更）
- 商品一覧・検索・詳細閲覧
- カテゴリ絞り込み・並び替え（新着／価格／評価）・価格帯フィルタ
- 商品レビュー・星評価（購入者のみ投稿可）／平均評価表示
- 関連商品の表示
- お気に入り（ウィッシュリスト）登録・一覧
- AIレコメンド（トップページのおすすめ・類似商品。Ollama + pgvector + セマンティックID）
- パーソナライズ（閲覧履歴の収集、行動の時間減衰つきプロフィール、商品一覧の「おすすめ順」、AIアシスタントへの購買履歴反映。いずれもログイン時）
- カートへの追加・数量変更・削除（**未ログインでも利用可**。端末に保存され、ログイン・会員登録時にサーバーのカートへ合算される）
- 配送先住所帳（登録・編集・既定設定）
- クーポン・割引コードの適用
- 注文（在庫チェック付き）・注文履歴の確認・注文キャンセル

### 管理者向け

- 商品の登録・編集・削除（論理削除）・カテゴリ割り当て
- カテゴリの管理（登録・編集・削除）
- クーポンの管理（登録・編集・削除）
- 全注文の確認・ステータス変更
- A/Bテスト（実験の作成・開始/停止、枝ごとのCVR・リフト・信頼区間・p値、ファネル、サンプル比率ミスマッチ検査）
- ユーザー一覧の確認

## MCP サーバー

Claude Code などの MCP クライアントから、商品検索・カート操作・購入までを会話で行えます。バックエンドに `/mcp` として同居しており（ポートは 8000 のまま）、在庫・価格・購入可否はサイト本体と同じコード（`backend/app/routers/` と `backend/app/services/cart.py`）が判定します。

### 登録

MCP 用に依存（`mcp` / `sse-starlette`）が増えたため、**既存環境からの更新時は必ずイメージを作り直してください**。`make restart` では `ModuleNotFoundError: No module named 'mcp'` のまま直りません。

```bash
make up-d      # --build 付きで起動（イメージを作り直す）
make mcp-check # /mcp が応答し、ツールが 11 本見えることを確認
```

`search_products` は MCP Apps 対応のホスト（例: Claude Code）で使うと、検索結果をカード一覧（画像・価格・評価・在庫状況）で表示できます。表示にはクライアント側の UI SDK が要るため、`make mcp-app-sdk` を一度実行して `backend/app/mcp_server/ui/vendor/mcp-app-sdk.js` を取得してください（`.gitignore` 済みなのでリポジトリには含まれません）。未取得のままでも `/mcp` は起動し、ツールは 11 本とも従来どおりテキストの `structuredContent` で動作します（カード UI だけが付きません）。

カート操作と購入にはログインが必要です。トークンは REST の `POST /api/auth/login` で取得します（MCP 側に login ツールはありません。会話ログにパスワードを残さないためです）。

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"user123"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

claude mcp add --transport http hibino http://localhost:8000/mcp \
  --header "Authorization: Bearer $TOKEN"
```

`claude mcp list` が `hibino: http://localhost:8000/mcp (HTTP) - ✔ Connected` を返せば接続できています。トークンの有効期限は 24 時間で、パスワード変更でも失効します。切れたら取り直して `claude mcp remove hibino` → 上のコマンドで登録し直してください。

ヘッダを付けずに登録することもできます。その場合は商品検索・商品詳細だけが使え、それ以外は「この操作にはログインが必要です」というエラーになります。

### 提供ツール

| ツール | 内容 | 認証 |
|---|---|---|
| `search_products` | 商品検索（キーワード・カテゴリ名・価格帯・並び順・ページング） | 不要（任意） |
| `get_product` | 商品詳細（説明・仕様・実売価格・在庫・購入可否） | 不要 |
| `get_cart` | カートの中身と合計金額 | 必要 |
| `add_to_cart` | カートに追加（既にあれば数量を加算） | 必要 |
| `update_cart_item` | 数量を指定した数に置き換え | 必要 |
| `remove_cart_item` | カートから取り除く | 必要 |
| `list_addresses` | 登録済み配送先の一覧（新規登録はできません） | 必要 |
| `preview_checkout` | 注文内容の下見と `confirm_token` の発行 | 必要 |
| `place_order` | `confirm_token` と引き換えに注文を確定 | 必要 |
| `list_orders` | 注文履歴（新しい順） | 必要 |
| `get_order` | 注文 1 件の詳細 | 必要 |

`search_products` はトークンがあれば `sort="recommended"` がその人向けの並びになります。金額はすべて実売価格（`effective_price`）です。MCP の戻り値は会話ログに残るため、配送先の電話番号は伏字にして返し（`preview_checkout` / `get_order`）、`list_addresses` は番地を出しません。

### 購入は 2 段階

購入は `preview_checkout` → `place_order` の順に必ず 2 回に分かれます。

1. **`preview_checkout`** — 明細・小計・割引・支払額・配送先を返し、同時に `confirm_token` を発行します。DB には何も書きません。配送先は `address_id`（`list_addresses` の id）か `shipping_address`（文字列）で指定し、どちらも省略すると既定の配送先を使います。注文へ進めない事情（カートが空・在庫不足・販売終了・配送先が無い）はエラーではなく `blockers` に入り、その場合 `confirm_token` は発行されません。クーポンが無効なときも `blockers` に入りますが、割引 0 として注文自体は通ります（`confirm_token` は発行されます）。
2. **`place_order`** — 引数は `confirm_token` ただ 1 つです。金額も住所もクーポンも受け取りません。

**`place_order` が金額や配送先を引数に持たないことが安全弁の本体です。** 引数として渡せる値が無ければ、モデルがそれを書き換える経路そのものがありません。トークンは「下見でユーザーに見せた買い物の姿」を署名で綴じ込んだもので、次のいずれかで無効になります。

- 発行から 10 分経過
- カートの商品・数量・単価が変わった（一度空にして同じものを入れ直した場合も無効）
- 支払額・クーポン・配送先の文字列が変わった
- **その間に注文が 1 件でも確定した**（＝同じトークンを 2 回使っても二重注文にならない）
- 発行を受けたのとは別のユーザーが使おうとした

なお、この仕組みが保証するのは「下見の内容と確定する内容が同一であること」だけで、**ユーザーの同意そのものではありません**。人間が挟まるのは MCP クライアント側のツール承認 UI なので、`place_order` を常時許可にすると関門が無くなります。

### テストアカウントで試す

テストアカウント（`user@example.com` / `user123`）には配送先が登録されていません。購入まで試すときは、`preview_checkout` の `shipping_address` に「宛名 / 郵便番号 / 住所 / 電話番号」を含む文字列を渡すか、ブラウザで http://localhost:3000 にログインしてマイページから配送先を登録してください（MCP からは配送先を作成できません）。

上のトークン付きで登録したうえで、Claude Code に次のように頼むのが一連の流れです。

```
ケトルを探して、いちばん安いものをカートに入れて。
そのあと注文内容を確認して、問題なければ注文を確定して。
（配送先は「日比野太郎 / 150-0001 / 東京都渋谷区神宮前1-2-3 / TEL: 03-1234-5678」）
```

MCP 経由の操作は行動ログ（`analytics_events`）に記録されません。MCP クライアントは計測用の `visitor_id` を持たないため、A/B テストのファネルや CV には現れません。

## ディレクトリ構成

```
ec-sample/
├── docker-compose.yml
├── backend/    # FastAPI アプリケーション
└── frontend/   # Next.js アプリケーション
```
