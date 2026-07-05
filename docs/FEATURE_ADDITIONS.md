# 機能追加設計書 — 一般的なEC標準機能の拡充

現状の Hibino は「商品閲覧・カート・注文・管理」の最小構成。ここに、一般的なECサイトで
標準的に期待される機能を追加する。設計は Opus、実装は Sonnet エージェント（Workflow）が担当。

## 前提・不変条件（CLAUDE.md 準拠）

- マイグレーションツールは導入しない。モデル変更後は `make reset` で DB 再作成（`Base.metadata.create_all` + シード）。
- 商品は論理削除のみ（`is_active=False`）。物理削除禁止。
- 注文明細（`OrderItem`）は注文時点のスナップショット。商品マスタから再計算しない。
- 全 API は `/api` プレフィックス配下。CORS 許可は `http://localhost:3000` のみ。
- フロント変更後は `make lint`、バックエンド変更後は `make up-d` → `make logs-backend` で起動確認。

## 追加機能一覧

| # | 機能 | 概要 |
|---|------|------|
| A | 商品カテゴリ | カテゴリ分類・絞り込み・並び替え・価格帯フィルタ。管理者によるカテゴリCRUD。 |
| B | レビュー・星評価 | 購入者による5段階評価＋コメント。平均評価を一覧/詳細に表示。 |
| C | お気に入り（ウィッシュリスト） | ハートトグルで登録、お気に入り一覧ページ。 |
| D | 配送先住所帳 | 住所の登録・編集・既定設定。チェックアウトで選択。 |
| E | クーポン・割引 | コード適用（定率/定額）。注文に割引額を記録。管理者によるクーポンCRUD。 |
| F | 注文キャンセル | ユーザーが pending/paid の注文をキャンセル（在庫戻し）。 |
| G | プロフィール編集 | 氏名変更・パスワード変更。 |
| H | 関連商品 | 同一カテゴリのおすすめを商品詳細に表示。 |

## データモデル追加

- **Category**(id, name, slug[unique], created_at) — `Product.category_id`(FK, nullable) を追加。
- **Review**(id, product_id[FK], user_id[FK], rating[1-5], comment[Text,null], created_at) — `UniqueConstraint(user_id, product_id)`。
- **WishlistItem**(id, user_id[FK], product_id[FK], created_at) — `UniqueConstraint(user_id, product_id)`。
- **Address**(id, user_id[FK], recipient_name, postal_code, prefecture, city, address_line, phone, is_default[bool], created_at)。
- **Coupon**(id, code[unique], discount_type['percent'|'fixed'], discount_value, min_order_amount, is_active, expires_at[null], created_at)。
- **Order** に列追加: `discount_amount`(int, default 0), `coupon_code`(str, null)。`total_amount` は割引後の金額。

レビュー投稿の資格: 当該ユーザーが cancelled 以外の注文で当該商品を購入済みであること。

## API 追加（すべて `/api` 配下）

- カテゴリ: `GET /categories`、商品一覧に `category_id`/`sort(newest|price_asc|price_desc|rating)`/`min_price`/`max_price` を追加。
- レビュー: `GET /products/{id}/reviews`、`POST /products/{id}/reviews`。商品出力に `avg_rating`/`review_count` を付与。
- 関連商品: `GET /products/{id}/related`。
- お気に入り: `GET /wishlist`、`POST /wishlist/items`、`DELETE /wishlist/items/{product_id}`。
- 住所帳: `GET/POST /addresses`、`PUT/DELETE /addresses/{id}`。
- クーポン: `POST /coupons/validate`（コード＋小計→割引プレビュー）。注文作成が `coupon_code`/`address_id` を受理。
- 注文キャンセル: `POST /orders/{id}/cancel`。
- プロフィール: `PUT /auth/me`（氏名）、`PUT /auth/me/password`。
- 管理: `GET/POST/PUT/DELETE /admin/categories`、`GET/POST/PUT/DELETE /admin/coupons`。

## 実装フェーズ（Workflow）

1. **Backend** — モデル/スキーマ/ルーター/シード/登録を単一エージェントで一貫実装。API仕様を `docs/NEW_FEATURES_API.md` に出力。
2. **Frontend 基盤** — `types.ts`/`api.ts`/`Header` と共有UI（`RatingStars`/`WishlistButton`）を整備。
3. **Frontend 各画面（並列）** — 一覧絞り込み・商品詳細レビュー・お気に入り・アカウント・カート/クーポン・注文キャンセル・管理画面をファイル分担で並列実装。
4. **検証** — `make reset` で起動、`make lint`、ログのエラー確認。問題があれば修正。
