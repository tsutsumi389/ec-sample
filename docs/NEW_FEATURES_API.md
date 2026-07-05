# 追加機能 API 仕様

`docs/FEATURE_ADDITIONS.md` に基づき追加したバックエンド API の一覧。すべて `/api` プレフィックス配下。
認可は `Authorization: Bearer <token>` ヘッダ（`app.auth.get_current_user` / `get_current_admin`）。

型名は `backend/app/schemas.py` に対応する Pydantic モデル。

---

## カテゴリ

### GET /categories
- 認可: 不要
- レスポンス: `CategoryOut[]` — `{ id, name, slug, created_at }`
- 並び順: `name` 昇順

### GET /products （拡張）
- 認可: 不要
- 追加クエリパラメータ（既存の `search`, `page`, `limit` と併用可）:
  - `category_id: int | None`
  - `sort: "newest" | "price_asc" | "price_desc" | "rating" | None`（未指定時は従来通り `id` 昇順）
  - `min_price: int | None`（`ge=0`）
  - `max_price: int | None`（`ge=0`）
- レスポンス: `ProductListOut` = `{ items: ProductOut[], total: int }`
- `ProductOut` 追加フィールド: `category_id: int | None`, `avg_rating: float | None`, `review_count: int`

### GET /products/{id} （拡張）
- レスポンス `ProductOut` に `avg_rating` / `review_count` を含む。
- エラー: 404 `detail="Product not found"`（存在しない or `is_active=false`）

---

## レビュー

### GET /products/{id}/reviews
- 認可: 不要
- レスポンス: `ReviewOut[]`（新しい順） = `{ id, product_id, user_id, user_name, rating, comment, created_at }`
- エラー: 404 `detail="Product not found"`

### POST /products/{id}/reviews
- 認可: 必須（ログインユーザー）
- リクエスト: `ReviewCreate` = `{ rating: int(1-5), comment?: string }`
- レスポンス: `ReviewOut`（201）
- エラー:
  - 404 `detail="Product not found"`
  - 403 `detail="Purchase required to review"` — cancelled 以外の注文で当該商品を購入済みでない場合
  - 400 `detail="Already reviewed"` — 既に当該ユーザーがレビュー済みの場合

---

## 関連商品

### GET /products/{id}/related
- 認可: 不要
- レスポンス: `ProductOut[]`（同一カテゴリの `is_active` な他商品、最大4件、`id` 昇順）
- `category_id` が null の商品は空配列を返す
- エラー: 404 `detail="Product not found"`

---

## お気に入り（ウィッシュリスト）

### GET /wishlist
- 認可: 必須
- レスポンス: `WishlistItemOut[]`（登録が新しい順） = `{ id, product: ProductOut, created_at }`

### POST /wishlist/items
- 認可: 必須
- リクエスト: `WishlistItemCreate` = `{ product_id: int }`
- レスポンス: `WishlistItemOut`（201）
- 既に登録済みの場合はエラーにせず、既存のレコードをそのまま返す（409を避ける仕様）
- エラー: 404 `detail="Product not found"`（存在しない or `is_active=false`）

### DELETE /wishlist/items/{product_id}
- 認可: 必須
- レスポンス: 204 No Content
- 未登録の場合も 204（冪等）

---

## 住所帳

### GET /addresses
- 認可: 必須
- レスポンス: `AddressOut[]`（`is_default` 優先、`id` 降順）
  - `AddressOut` = `{ id, recipient_name, postal_code, prefecture, city, address_line, phone, is_default, created_at }`

### POST /addresses
- 認可: 必須
- リクエスト: `AddressCreate` = `{ recipient_name, postal_code, prefecture, city, address_line, phone, is_default?: bool(default false) }`
- レスポンス: `AddressOut`（201）
- `is_default=true` の場合、同ユーザーの他の住所の `is_default` を自動的に `false` にする

### PUT /addresses/{id}
- 認可: 必須（本人の住所のみ）
- リクエスト: `AddressUpdate`（すべて任意フィールド、部分更新）
- レスポンス: `AddressOut`
- `is_default=true` に更新した場合は他の住所を自動的に解除
- エラー: 404 `detail="Address not found"`（存在しない or 他人の住所）

### DELETE /addresses/{id}
- 認可: 必須（本人の住所のみ）
- レスポンス: 204 No Content
- エラー: 404 `detail="Address not found"`

---

## クーポン

### POST /coupons/validate
- 認可: 不要
- リクエスト: `CouponValidateRequest` = `{ code: string, subtotal: int }`
- レスポンス: `CouponValidateResponse` = `{ valid: bool, discount_amount: int, message: string }`
  - 割引額は `subtotal` を超えない
  - 無効時のメッセージ例:
    - `"Invalid coupon code"` — コードが存在しない or `is_active=false`
    - `"Coupon has expired"` — `expires_at` が過去
    - `"Minimum order amount is {min_order_amount}"` — 最低注文額未達
  - 有効時: `message="Coupon applied"`

---

## 注文作成の拡張（POST /orders）

- リクエスト `OrderCreate` に以下を追加（後方互換維持）:
  - `shipping_address: string | None` — 従来通り直接指定も可能
  - `address_id: int | None` — 指定時は本人の住所帳から取得し、整形して `shipping_address` に自動スナップショット保存
  - `coupon_code: string | None` — 指定時はクーポンを検証し割引を適用
- `shipping_address` と `address_id` のどちらも未指定の場合: 400 `detail="Shipping address is required"`
- `address_id` が本人の住所として存在しない場合: 404 `detail="Address not found"`
- クーポンの条件未達・無効の場合: 400 `detail="<evaluate_coupon() のメッセージ>"`（例: `"Invalid coupon code"`, `"Coupon has expired"`, `"Minimum order amount is {n}"`）
- レスポンス `OrderSummaryOut` / `OrderDetailOut` に `discount_amount: int`, `coupon_code: string | None` を追加
- `total_amount` は割引後の金額（`total_amount = subtotal - discount_amount`）
- 既存の在庫ロック（`with_for_update`）、在庫不足・カート空の日本語 detail はそのまま維持

---

## 注文キャンセル

### POST /orders/{id}/cancel
- 認可: 必須（本人の注文のみ）
- 条件: `status` が `pending` または `paid` のときのみキャンセル可
- 処理: 該当商品の在庫を `with_for_update` でロックして戻し、`status="cancelled"` に更新
- レスポンス: `OrderDetailOut`
- エラー:
  - 404 `detail="Order not found"`
  - 400 `detail="Cannot cancel this order"` — 対象外ステータス（shipped/delivered/cancelled 等）

---

## プロフィール

### PUT /auth/me
- 認可: 必須
- リクエスト: `UserUpdate` = `{ name: string }`
- レスポンス: `UserOut`

### PUT /auth/me/password
- 認可: 必須
- リクエスト: `PasswordUpdate` = `{ current_password: string, new_password: string(min 6文字) }`
- レスポンス: 204 No Content
- エラー: 400 `detail="Current password is incorrect"`

---

## 管理: カテゴリ CRUD

すべて `get_current_admin` 依存（管理者のみ）。

### GET /admin/categories
- レスポンス: `CategoryOut[]`（`id` 昇順）

### POST /admin/categories
- リクエスト: `CategoryCreate` = `{ name, slug }`
- レスポンス: `CategoryOut`（201）
- エラー: 400 `detail="Slug already exists"`

### PUT /admin/categories/{id}
- リクエスト: `CategoryUpdate`（任意フィールドの部分更新）
- レスポンス: `CategoryOut`
- エラー: 404 `detail="Category not found"` / 400 `detail="Slug already exists"`

### DELETE /admin/categories/{id}
- レスポンス: `CategoryOut`（削除前の内容を返す）
- 副作用: 該当カテゴリに属する商品の `category_id` を `NULL` にする（商品自体は削除しない）
- エラー: 404 `detail="Category not found"`

---

## 管理: クーポン CRUD

すべて `get_current_admin` 依存（管理者のみ）。

### GET /admin/coupons
- レスポンス: `CouponOut[]`（`id` 昇順）
  - `CouponOut` = `{ id, code, discount_type, discount_value, min_order_amount, is_active, expires_at, created_at }`

### POST /admin/coupons
- リクエスト: `CouponCreate` = `{ code, discount_type: "percent"|"fixed", discount_value: int(ge=0), min_order_amount?: int(default 0), is_active?: bool(default true), expires_at?: datetime|null }`
- レスポンス: `CouponOut`（201）
- エラー: 400 `detail="Coupon code already exists"`

### PUT /admin/coupons/{id}
- リクエスト: `CouponUpdate`（任意フィールドの部分更新）
- レスポンス: `CouponOut`
- エラー: 404 `detail="Coupon not found"` / 400 `detail="Coupon code already exists"`

### DELETE /admin/coupons/{id}
- レスポンス: `CouponOut`（削除前の内容を返す）
- エラー: 404 `detail="Coupon not found"`

---

## 追加した英語 detail 文字列 一覧（フロント訳語対応用）

- `"Product not found"`（既存を再利用）
- `"Purchase required to review"`
- `"Already reviewed"`
- `"Address not found"`
- `"Shipping address is required"`
- `"Invalid coupon code"`
- `"Coupon has expired"`
- `"Minimum order amount is {n}"`（`{n}` は実際の最低注文額に置換される、例: `"Minimum order amount is 5000"`）
- `"Cannot cancel this order"`
- `"Current password is incorrect"`
- `"Slug already exists"`
- `"Coupon code already exists"`
- `"Order not found"`（既存を再利用、cancel でも使用）

（注: 既存踏襲のカート/注文まわりの一部 detail は日本語のまま維持しています。例: `"カートが空です"`, `"在庫が不足しています: {name}"`, `"商品が見つかりません: {id}"`）
