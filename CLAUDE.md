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
- **未ログインのカートは端末が持つ**: ゲストのカートは `frontend/lib/guestCart.ts` が localStorage（`hibino:guest-cart`）に**商品IDと数量だけ**を保存する。価格・購入可否・在庫の判断は `POST /cart/preview`（`services/cart.py` の `resolve_guest_lines`）が返す値を使い、クライアントで金額を組まないこと（`effective_price` の規律が二重実装になり、必ずどちらかが古くなる）。ログイン・会員登録の直後に `POST /cart/merge` でサーバーのカートへ合算する。**ゲストカートの識別に `visitor_id` を使ってはならない**（計測専用であり、所有の判断には使わない）。
- **カートへの一括投入の在庫判定は1か所**: 再注文（`orders.py` の reorder）とゲストカートのマージは `services/cart.py` の `merge_lines()` を共有する。売り越しに直結する判定を経路ごとに書かないこと。買えない明細はエラーにせず理由付きで見送る（1件の在庫切れで一括投入ごと失敗させない）。
- **ログイン後の戻り先は必ず引き継ぐ**: `?redirect=` を login・register の双方で受け渡す（`lib/redirect.ts`）。新しくログインへ送る導線を足すときは `withRedirect()` で現在地を付け、受け取り側は必ず `safeRedirect()` を通す（先頭 `/` のみ許可＝オープンリダイレクト対策）。「カートに入れた → ログイン → トップに着く」経路を作らないこと。
- **API プレフィックス**: バックエンドの全ルートは `/api` 配下（`main.py` で一括登録）。CORS 許可は `http://localhost:3000` のみ。
- **A/Bテストの割り当ては再計算で決まる**: 割り当ては `visitor_id` と実験の `salt` からの決定論的ハッシュで毎回計算する（`services/experiment.py`）。ただし曝露済みの訪問者は保存済みの `variant_key` を優先する（sticky）。**実施中の実験の `weight` を変更してはならない**（ハッシュ境界が動いて配分が設計とずれ、SRM 警告の原因になる）。配分の変更は `draft` のときだけ API が受け付ける。
- **実験は物理削除しない**: `Experiment` は `status` が唯一の源（`draft`/`running`/`paused`/`completed`）。削除できるのは `draft` のみで、配信済みの実験は `completed` にする。`completed` から他の状態には戻せない。
- **成果計測はサーバー側が正**: 購入は `orders.py`、カート投入は `cart.py` がサーバー側で `analytics_events` に記録する。フロントの `track()` は補助（クリック・表示・page_view）であり、重要指標をフロントだけに依存させないこと。**唯一の例外はゲストのカート投入**で、サーバーを通らないためフロントが `add_to_cart` を記録する。ログイン時のマージ（`POST /cart/merge`）では記録しない（ゲスト時点で1件記録済みなので、足すと同じ投入が二重に数えられる）。
- **ファネルの段**: `page_view → view_item → add_to_cart → view_cart → begin_checkout → purchase`（`services/analytics.py` の `DEFAULT_FUNNEL`）。`view_item`/`view_cart` はフロントだけが記録する（サーバーで確定できる事実ではない）。段を足したら管理画面の `FUNNEL_LABELS`（`app/admin/experiments/[id]/page.tsx`）にも日本語ラベルを追加する。
- **商品カードの計測は器に1つだけ**: クリック・表示は `ProductCard` の `data-track-click="product_card"` / `data-track-view` が全画面ぶん引き受ける（`AnalyticsTracker` が委譲で拾う）。一覧・レコメンド・ホームのレーンなど呼び出し側に個別の計測を書かないこと。
- **イベントログは実験に紐づけない**: `analytics_events` は実験を知らない汎用ログとして貯め、集計時に `experiment_exposures` と `visitor_id` で JOIN する（`services/experiment_report.py`）。実験専用の計測にすると、指標を思いつく前のデータが存在しなくなるため。成果は必ず**曝露時刻以降**のイベントだけを数える。
- **`visitor_id` は計測専用**: `X-Visitor-Id` ヘッダで運ばれる端末の匿名ID。割り当て単位・ログの主キーであり、**認証には一切使わない**。
- **Webフォントは自己ホスト。`next/font/google` は使わない**: 和文は1ウェイトあたり約124個の unicode-range スライスに分割配信され、3書体で500個超になる。frontend コンテナには IPv6 経路が無いため一斉ダウンロードが大量に失敗し、**しかも next/font は失敗してもビルドを通して黙ってフォールバックに落ちる**（見出しが明朝でないことに気づけない）。`make fonts`（= `node frontend/scripts/fetch-fonts.mjs`）でホスト側から1回だけ取得し、`frontend/public/fonts/` と `frontend/app/fonts.css` を生成する。両者は `.gitignore` 済みで、`make up` / `make up-d` が未取得時のみ自動実行する。
- **明朝は 700 のみ・900 を指定しない**: Zen Old Mincho は 700 だけ収録している。持たないウェイトを指定するとブラウザが合成ボールドで太らせ、明朝の線が潰れる。`text-display` も 700 で組む。
- **明朝に `palt` は効かない**: 配信中の Zen Old Mincho サブセットに GSUB/GPOS が無く、`palt`/`pkna`/`kern` はすべて無効（実測済み）。カタカナのアキは `lib/wordBreak.ts` の `withWordBreaks()` が付ける `.kana` と `--kana-track` で詰める。
- **可変長の和文は `withWordBreaks()` を通す**: `word-break: auto-phrase` は Chromium で効かないため、`Intl.Segmenter` で語境界に `<wbr>` を挿すのが唯一の頼り。商品名・カテゴリ名・見出しに素の文字列を直接描画しないこと（語中改行が出る）。
- **テスト**: `backend/tests/`（pytest）に DB 不要の純ロジックテストのみを置く。実行は `docker compose exec backend python -m pytest tests/ -q`。

## 変更時の検証

- フロント変更後は `make lint` を通す。
- バックエンド変更後は `make up-d` → `make logs-backend` で起動エラーがないか確認（起動時にテーブル作成とシードが走る）。
