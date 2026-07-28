# CLAUDE.md

Docker 上で動くECサイトのサンプル（Next.js 14 + FastAPI + PostgreSQL 16）。

## コマンド

開発操作はすべて `Makefile` に集約。まず `make help` を見ること。

- `make up` — 起動 / `make down` — 停止 / `make reset` — DB 作り直し＋シード再投入
- `make lint` — フロント Lint（`next lint`）
- `make db-shell` — psql 接続 / `make logs` — ログ追跡
- `make migrate-new m="..."` — マイグレーション生成 / `make migrate` — 適用 / `make migrate-status` — 状況確認

URL・テストアカウント・機能概要は `README.md` を参照。

## コードから読み取れない運用ルール

以下はコードに現れない暗黙の前提。違反しやすいので厳守すること。

- **スキーマ変更は Alembic のリビジョンで行う**: テーブルは `backend/alembic/versions/` のリビジョンが作る。`Base.metadata.create_all` は使わない（`models.py` を直接 DDL に変換すると、DB に何が適用済みかを誰も知らない状態になる）。バックエンド起動時に `alembic upgrade head` が自動で走る（`backend/app/main.py` の lifespan）ので、`make up-d` するだけで DB は最新になる。
- **モデルを変えたら必ずリビジョンを1本足す**: `make migrate-new m="..."` で現在の DB との差分から生成し、**中身を必ず目視で直す**。autogenerate は「テーブル・カラム・インデックスの増減」しか見ておらず、既存行の埋め方（`server_default` を付けずに NOT NULL 列を足す等）やデータ移行は書いてくれない。既存データが入った DB で落ちるのはここ。
- **生成したリビジョンは置いた瞬間に適用される**: backend は `--reload` で動いているため、`alembic/versions/` にファイルが増えるとアプリが再起動し、autogenerate の下書きのまま `upgrade head` が走る。手直しは **`make migrate-down` で戻してから**行い、直したら `make migrate` で流し直すこと（編集後に downgrade すると、適用時とは別のコードで巻き戻すことになり整合しない）。同じ理由でリビジョンを取り消したいときもファイルを消すだけでは駄目で、`alembic_version` が存在しないリビジョンを指したまま残り `alembic` コマンドが軒並み落ちる（復旧は `alembic stamp --purge <戻したい版>`）。
- **適用済みのリビジョンは書き換えない**: 一度でも共有された（= 誰かの DB に適用された）リビジョンを編集しても、その DB には二度と流れない。訂正は必ず新しいリビジョンで行う。同じ理由でリビジョンから `app.models` を import しないこと（リビジョンは「その時点のスキーマ」の凍結写しであり、モデルを参照すると過去のリビジョンが将来のモデル変更で壊れる）。
- **`0001` と `0002` を分けてあるのは pgvector のため**: `0002` は `CREATE EXTENSION vector` と `product_embeddings` だけを持つ。pgvector が無い DB では `0002` だけが失敗し、`0001` までは適用済みのままアプリが起動できる（レコメンドはフォールバック動作）。この分離は `alembic/env.py` の `transaction_per_migration=True` が前提で、これを外すと `0002` の失敗で `0001` ごと巻き戻りアプリが起動しなくなる。
- **Alembic 導入前に作られた DB は自動で stamp される**: `alembic_version` が無く `users` がある DB は、起動時に `0001`（`product_embeddings` があれば `0002`）として記録される（`main.py` の `_stamp_legacy_schema`）。`make reset` は不要。
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
- **アシスタントの開閉は `lib/assistant-context.tsx` を通す**: 開閉状態・prefill・フォーカスの戻し先は provider が持ち、`AssistantWidget` はパネルの描画と背景の `inert` だけを受け持つ。ウィジェット内部の `useState` に戻すと、行き止まりの画面（検索0件など）から `openAssistant()` で相談へ送れなくなる。ページから開くときは `returnFocusTo` に自分のボタンの ref を必ず渡すこと（渡さないと閉じたときフォーカスが画面の反対側の FAB へ飛ぶ）。**閉じた後のフォーカス復帰は effect で当てる**——FAB は開いている間 `display:none` で、`requestAnimationFrame` では再描画のコミット前に走って無言で外れる。`prefill` は入力欄に入れるだけで**自動送信しない**（サジェスト chip と同じ規律。予算や用途を書き足してから送れる状態にしておく）。
- **Webフォントは自己ホスト。`next/font/google` は使わない**: 和文は1ウェイトあたり約124個の unicode-range スライスに分割配信され、3書体で500個超になる。frontend コンテナには IPv6 経路が無いため一斉ダウンロードが大量に失敗し、**しかも next/font は失敗してもビルドを通して黙ってフォールバックに落ちる**（見出しが明朝でないことに気づけない）。`make fonts`（= `node frontend/scripts/fetch-fonts.mjs`）でホスト側から1回だけ取得し、`frontend/public/fonts/` と `frontend/app/fonts.css` を生成する。両者は `.gitignore` 済みで、`make up` / `make up-d` が未取得時のみ自動実行する。
- **明朝は 700 のみ・900 を指定しない**: Zen Old Mincho は 700 だけ収録している。持たないウェイトを指定するとブラウザが合成ボールドで太らせ、明朝の線が潰れる。`text-display` も 700 で組む。
- **明朝に `palt` は効かない**: 配信中の Zen Old Mincho サブセットに GSUB/GPOS が無く、`palt`/`pkna`/`kern` はすべて無効（実測済み）。カタカナのアキは `lib/wordBreak.ts` の `withWordBreaks()` が付ける `.kana` と `--kana-track` で詰める。
- **可変長の和文は `withWordBreaks()` を通す**: `word-break: auto-phrase` は Chromium で効かないため、`Intl.Segmenter` で語境界に `<wbr>` を挿すのが唯一の頼り。商品名・カテゴリ名・見出しに素の文字列を直接描画しないこと（語中改行が出る）。
- **テスト**: `backend/tests/`（pytest）に DB 不要の純ロジックテストのみを置く。実行は `docker compose exec backend python -m pytest tests/ -q`。

## 変更時の検証

- フロント変更後は `make lint` を通す。
- バックエンド変更後は `make up-d` → `make logs-backend` で起動エラーがないか確認（起動時にマイグレーション適用とシードが走る）。
- モデル変更後は `docker compose exec backend alembic check` が「No new upgrade operations detected.」を返すこと。返さない場合はモデルに追随するリビジョンが未作成。
