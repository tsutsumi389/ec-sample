# ec-sample

シンプルなECサイトのサンプルアプリケーションです。商品閲覧、カート、注文、管理者による商品・注文管理機能を備えています。

## 技術スタック

- **フロントエンド**: Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **バックエンド**: Python 3.12 + FastAPI + SQLAlchemy 2.0 + Pydantic v2
- **データベース**: PostgreSQL 16
- すべて Docker コンテナ上で動作します。

## 起動方法

事前に [Docker](https://www.docker.com/) がインストールされている必要があります。

```bash
docker compose up --build
```

初回起動時に PostgreSQL のテーブル作成と初期データ（管理者/一般ユーザー、商品10件）の投入が自動的に行われます。

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
- 商品一覧・検索・詳細閲覧
- カートへの追加・数量変更・削除
- 注文（在庫チェック付き）
- 注文履歴の確認

### 管理者向け

- 商品の登録・編集・削除（論理削除）
- 全注文の確認・ステータス変更
- ユーザー一覧の確認

## ディレクトリ構成

```
ec-sample/
├── docker-compose.yml
├── backend/    # FastAPI アプリケーション
└── frontend/   # Next.js アプリケーション
```
