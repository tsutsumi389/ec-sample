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

初回起動時に PostgreSQL のテーブル作成と初期データ（管理者/一般ユーザー、商品10件）の投入が自動的に行われます。

### 既存環境からの更新時（DBイメージの変更に注意）

AIレコメンド機能の追加に伴い、DB イメージを `postgres:16-alpine` から `pgvector/pgvector:pg16` に変更しました。alpine 系から debian 系への切り替えでデータボリュームに互換性がないため、既存環境から更新する場合は一度 DB を作り直す必要があります。

```bash
make reset
```

### AIレコメンド（LLM機能）の有効化

トップページのおすすめ理由などの LLM 生成機能は、**ホストPCで Ollama が稼働しており、`nomic-embed-text:latest` / `gemma4:latest` が pull 済みであること**を前提とします。コンテナ内のバックエンドは `http://host.docker.internal:11434` 経由でホストの Ollama に接続します。

```bash
ollama pull nomic-embed-text
ollama pull gemma4
```

Ollama が未稼働でも人気順フォールバックで動作するため、サイトの全機能はモデル未取得のままでも利用できます。

## アクセスURL

| サービス | URL |
|---|---|
| フロントエンド | http://localhost:3000 |
| バックエンドAPI | http://localhost:8000 |
| APIドキュメント (Swagger UI) | http://localhost:8000/docs |

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
- カートへの追加・数量変更・削除
- 配送先住所帳（登録・編集・既定設定）
- クーポン・割引コードの適用
- 注文（在庫チェック付き）・注文履歴の確認・注文キャンセル

### 管理者向け

- 商品の登録・編集・削除（論理削除）・カテゴリ割り当て
- カテゴリの管理（登録・編集・削除）
- クーポンの管理（登録・編集・削除）
- 全注文の確認・ステータス変更
- ユーザー一覧の確認

## ディレクトリ構成

```
ec-sample/
├── docker-compose.yml
├── backend/    # FastAPI アプリケーション
└── frontend/   # Next.js アプリケーション
```
