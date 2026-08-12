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
- **商品の可視性・購入可否は `Product.status` が唯一の源**: `draft`/`coming_soon`/`on_sale`/`suspended`/`discontinued`/`archived` の6状態。一覧表示・商品ページ表示・購入可否はすべて status から導出する（`models.py` の `is_listed`/`is_viewable`/`purchasable` プロパティ、`LISTED_STATUSES`/`VIEWABLE_STATUSES`）。個別の真偽フラグを増やさないこと。**外から渡された商品IDの集合を引くクエリには必ず status を添える**——`?recently_viewed_ids=` のように任意のIDを指定できる入り口があるので、絞り忘れると `draft`（未公開）の商品名が見出しに載って外へ出る（`home_page.py` の `build_because_you_watched` が実際にこれを踏んだ。近傍側だけ絞ってアンカーを絞っていなかった）。
- **実売価格は `effective_price`**: `sale_price` があればそれ、なければ `price`。カート小計・注文金額・`OrderItem` スナップショットはすべて `effective_price` を使う（`price` を直接使わない）。
- **注文明細はスナップショット**: `OrderItem` は注文時点の `product_name`/`price` を保持する。商品マスタを参照して再計算しないこと。
- **商品の「モノの事実」は `product_specs`**: サイズ・重量・素材・保証などは `ProductSpec`（label / value / sort_order）に1行1項目で持つ。商品ページの「仕様」欄はこの行をそのまま出し、末尾に商品コードとカテゴリを添える。**在庫・価格・販売状態をここに入れないこと**——あれは状態であって仕様ではなく、並べると `StockLabel`（残りN点）と同じ数字が同一画面に二度出る（価格行が席を1つに絞っているのと同じ規律）。項目名はカテゴリを跨いで使い回す（重量・素材・本体サイズ・保証期間 等）。値は単位まで含んだ表示用の文字列で、絞り込みに使う設計ではない。
- **仕様は埋め込み原文にも入る**: `services/embedding.py` の `build_product_text` が仕様を1行に連ねてベクトル化する（素材・容量が description の書きぶりに左右されず検索に乗るようにするため）。この関数の出力を変えると `source_hash` が全商品ぶん変わり、次の起動で全件が再埋め込みされる。仕様が空の商品では「仕様:」の行ごと落とす（空見出しを残すと「仕様が無い」商品どうしがベクトル上近づく）。
- **仕様のデモデータは「新規 DB はシード / 既存 DB はリビジョン」**: `0003` がテーブルを作り、`0004` が **SKU を手がかりに既存の商品行へ仕様を流し込む**（`make reset` は要らない）。新しい DB では商品がまだ無い状態で `0004` が走る（マイグレーション → シードの順）ので何も入らず、直後の `seed_data()` が `seed.py` の `PRODUCT_SPECS` で仕様つきの商品を作る。二重には入らない。`0004` の `SPECS_BY_SKU` は **seed.py からの凍結した写し**であり、`app.seed` を import しないこと（過去のリビジョンの挙動が将来のシード変更で変わってはならない。`app.models` を import しないのと同じ理由）。以後シードの仕様を直しても `0004` は追随しない——それが正しい。
- **レビューの星の分布はフロントで数える**: `GET /products/{id}/reviews` はページングせず全件返すので、`ReviewSection` が取得済みの配列を数えて分布を出す（集計APIを足さない）。件数が数百を超えてサーバー集計が要る規模になったら、その前に一覧そのものを直すこと。
- **未ログインのカートは端末が持つ**: ゲストのカートは `frontend/lib/guestCart.ts` が localStorage（`hibino:guest-cart`）に**商品IDと数量だけ**を保存する。価格・購入可否・在庫の判断は `POST /cart/preview`（`services/cart.py` の `resolve_guest_lines`）が返す値を使い、クライアントで金額を組まないこと（`effective_price` の規律が二重実装になり、必ずどちらかが古くなる）。ログイン・会員登録の直後に `POST /cart/merge` でサーバーのカートへ合算する。**ゲストカートの識別に `visitor_id` を使ってはならない**（計測専用であり、所有の判断には使わない）。
- **カートへの一括投入の在庫判定は1か所**: 再注文（`orders.py` の reorder）とゲストカートのマージは `services/cart.py` の `merge_lines()` を共有する。売り越しに直結する判定を経路ごとに書かないこと。買えない明細はエラーにせず理由付きで見送る（1件の在庫切れで一括投入ごと失敗させない）。
- **ログイン後の戻り先は必ず引き継ぐ**: `?redirect=` を login・register の双方で受け渡す（`lib/redirect.ts`）。新しくログインへ送る導線を足すときは `withRedirect()` で現在地を付け、受け取り側は必ず `safeRedirect()` を通す（先頭 `/` のみ許可＝オープンリダイレクト対策）。「カートに入れた → ログイン → トップに着く」経路を作らないこと。
- **API プレフィックス**: バックエンドの全ルートは `/api` 配下（`main.py` で一括登録）。CORS 許可は `http://localhost:3000` のみ。
- **`SECRET_KEY` はリポジトリに置かない・既定値を持たせない**: JWT は HS256（対称鍵）なので、鍵を知ることは管理者トークンを発行できることと同義。`app/auth.py` の `_load_secret_key()` は未設定・32文字未満・既知の弱い値なら `RuntimeError` で起動を止める（fail closed）。鍵は `make secret` が `.env` に生成し（`.gitignore` 済み、`make up` / `make up-d` / `make reset` が未生成時のみ自動実行）、compose が `${SECRET_KEY}` で読む。**`docker-compose.yml` に鍵の実値を書き戻さないこと**。漏洩したらパスワード変更では締め出せない——失効判定は `iat` と `password_changed_at` の比較で `iat` は発行側が選べるため、復旧は鍵のローテーションのみ。
- **A/Bテストの割り当ては再計算で決まる**: 割り当ては `visitor_id` と実験の `salt` からの決定論的ハッシュで毎回計算する（`services/experiment.py`）。ただし曝露済みの訪問者は保存済みの `variant_key` を優先する（sticky）。**実施中の実験の `weight` を変更してはならない**（ハッシュ境界が動いて配分が設計とずれ、SRM 警告の原因になる）。配分の変更は `draft` のときだけ API が受け付ける。
- **実験は物理削除しない**: `Experiment` は `status` が唯一の源（`draft`/`running`/`paused`/`completed`）。削除できるのは `draft` のみで、配信済みの実験は `completed` にする。`completed` から他の状態には戻せない。
- **成果計測はサーバー側が正**: 購入は `orders.py`、カート投入は `cart.py` がサーバー側で `analytics_events` に記録する。フロントの `track()` は補助（クリック・表示・page_view）であり、重要指標をフロントだけに依存させないこと。**唯一の例外はゲストのカート投入**で、サーバーを通らないためフロントが `add_to_cart` を記録する。ログイン時のマージ（`POST /cart/merge`）では記録しない（ゲスト時点で1件記録済みなので、足すと同じ投入が二重に数えられる）。
- **ファネルの段**: `page_view → view_item → add_to_cart → view_cart → begin_checkout → purchase`（`services/analytics.py` の `DEFAULT_FUNNEL`）。`view_item`/`view_cart` はフロントだけが記録する（サーバーで確定できる事実ではない）。段を足したら管理画面の `FUNNEL_LABELS`（`app/admin/experiments/[id]/page.tsx`）にも日本語ラベルを追加する。
- **商品カードの計測は器に1つだけ**: クリック・表示は `ProductCard` の `data-track-click="product_card"` / `data-track-view` が全画面ぶん引き受ける（`AnalyticsTracker` が委譲で拾う）。一覧・レコメンド・ホームのレーンなど呼び出し側に個別の計測を書かないこと。
- **イベントログは実験に紐づけない**: `analytics_events` は実験を知らない汎用ログとして貯め、集計時に `experiment_exposures` と `visitor_id` で JOIN する（`services/experiment_report.py`）。実験専用の計測にすると、指標を思いつく前のデータが存在しなくなるため。成果は必ず**曝露時刻以降**のイベントだけを数える。
- **`visitor_id` は計測専用**: `X-Visitor-Id` ヘッダで運ばれる端末の匿名ID。割り当て単位・ログの主キーであり、**認証には一切使わない**。
- **MCP サーバー（`/mcp`）は `/api` 配下でない唯一の例外**: `app/mcp_server/` が持ち、`main.py` が `Route("/mcp")` として**直接**ぶら下げる。`mcp.streamable_http_app()` の返り値を `app.mount()` してはならない——あれは内側でもう一度 `/mcp` に Route を張るので実効パスが `/mcp/mcp` になり、内側を `/` にすると今度は `POST /mcp` が 307 で `/mcp/` へ飛んでリダイレクトを追わないクライアントが壊れる。`session_manager.run()` を lifespan で包むのも必須（忘れると最初のリクエストが「Task group is not initialized」で落ちる）。MCP の import が失敗しても REST は起動する（`0001`/`0002` を分けてあるのと同じ規律で、付随機能の失敗で店を止めない）。
- **MCP ツールは既存のルーター関数へ委譲する**: 在庫・購入可否・金額の判定を `mcp_server/` に書き写さないこと。`tools.py` / `checkout.py` は `routers/products.py`・`cart.py`・`orders.py`・`addresses.py` の関数をキーワード引数で直接呼び、`services/cart.py` の判定をそのまま使う（`views.py` は整形だけを持つ純関数）。ツールを足すときも同じ——REST に無い操作を MCP のためだけに実装すると、同じ判定が二重になり必ず片方が古くなる。ツールは素の `def` で書く（SDK が同期関数をワーカースレッドへ逃がす。`async def` にするとこの保護が外れ、psycopg2 のブロッキング I/O がイベントループを塞ぐ）。
- **`place_order` に金額・配送先・クーポンの引数を足さない**: 引数は `confirm_token` ただ1つ。渡せる値が無いこと自体が安全弁の本体で、引数を足した瞬間にモデルがそれを書き換える経路ができる。トークンは `preview_checkout` が発行する HMAC 署名（鍵は `SECRET_KEY` からの派生。環境変数を2本目に増やすと fail closed の検査・`make secret`・compose の受け渡しが二重になり、忘れたときに「無ければ SECRET_KEY にフォールバック」と書きたくなる）。指紋には `(cart_item_id, product_id, quantity, effective_price)`・支払額・クーポン・保存される住所文字列・**直近の注文ID**が入る（＝注文が1本でも確定すれば未使用のトークンは全部死ぬ＝二重注文にならない）。**在庫と `status` は指紋に入れない**——`create_order` が行ロック下で必ず再検査する唯一の源であり、ここに入れると他人が1個買っただけでユーザーに無関係なやり直しを強いる。
- **MCP 経由の操作は `analytics_events` に載らない**: MCP クライアントは計測用の `visitor_id` を持たないため、A/B テストのファネルにも CV にも現れない。**認証に `visitor_id` を使わない規律の裏返し**なので、載せたくなっても認証済みユーザーIDから合成しないこと（端末単位の計測が利用者単位に化け、既存の集計と混ざる）。MCP は依存（`mcp` / `sse-starlette`）を足しているので、更新時は `make up-d` でイメージを作り直すこと。`make restart` では `ModuleNotFoundError` のまま直らない（`/mcp` は Swagger に載らないので画面からは気づけない。`make mcp-check` で確認する）。
- **Apps 拡張（`/mcp` の検索結果カード UI）への登録は `MCPServer` 構築より前に終わっていなければならない**: `mcp_server/apps_ui.py` が持つ `Apps()` インスタンスは、`MCPServer(extensions=[apps_ui.apps])` の**コンストラクタ内で同期的に一度だけ** `apps.tools()` / `apps.resources()` を読み出す（SDK の `_apply_extension`）。つまり `apps.tool()` / `apps.add_html_resource()` の呼び出しは `apps_ui` モジュールの **import 時点**（= `server.py` が `MCPServer(...)` を書く行より前）で完了していなければならない。構築後に `apps.tool()` を呼んでも `Apps` 内部にリストが積まれるだけで誰も読みに来ず、**例外もログも出ずに静かに無視される**。`server.py` で `from app.mcp_server import apps_ui, checkout, tools` を `MCPServer(...)` より後ろへ動かすと、この経路でカード UI だけが消える（他のツールは正常に動くので気づきにくい）。
- **UI 付きツールと素のツールを同名で二重登録しない**: `ToolManager.add_tool()` は同名の再登録を「先勝ち＋警告ログのみ」で処理し、後から来た description・annotations・（UI 付きなら）`_meta.ui.resourceUri` を黙って捨てる。そのため `search_products` は `tools.py` の `register()` からは登録せず（コメントを残してある）、UI 付き登録を持つ `apps_ui.py` だけが登録する。UI 登録に失敗したとき（vendor JS が無い等）だけ `apps_ui.register_fallback()` が素の登録で埋める——二重登録ではなく排他的な二択にしてあるのはこのため。
- **`client_supports_apps(ctx)` を UI 有無の分岐に使わない**: このサーバーは `stateless_http=True` で動いており、`initialize` で送られる `ClientCapabilities` はリクエストごとに作り直されるステートレスなセッションへ引き継がれないため、`client_supports_apps` は実測で常に `False` を返す。ツールの `content` / `structuredContent` は「UI が描画されない場合」を前提にした形（Apps 対応前と同じ形）を常に返し、UI が実際に描画されるかどうかの判断は完全にホスト側（`_meta.ui.resourceUri` を見るかどうか）に委ねる。
- **UI 専用データは `_meta.ui` に載せ、`structuredContent` には入れない**: 検索結果カードが必要とする画像 URL・商品ページ URL は `mcp_server/apps_ui.py` が `CallToolResult` の `meta={"ui": {...}}` にだけ積む。`structuredContent`（`views.py` が組み立てる LLM 向けの契約）には足さない——`views.py` の「重いものは一覧に出さない・画像は詳細ツールだけ」規律を、画像 URL の追加で破らないため。この分離により UI 非対応クライアントの会話ログに画像 URL が増えることもない。
- **UI リソースの HTML に商品データを焼き込まない**: `mcp_server/ui_assets.py` の `build_app_html(template, bundle_js)` は引数が2つだけで、どちらにも商品データは含まれない。カード一覧は iframe 側の JS が `app.ontoolresult` で受け取った `structuredContent` / `_meta.ui` を描画時に埋める。HTML 自体に商品名・価格を焼き込む設計にすると、`?recently_viewed_ids=` のように任意 ID を広く引くクエリと同じ形で「誰が見るか分からない静的リソースに個別のデータが混ざる」経路ができてしまう。
- **vendor JS（`ui/vendor/mcp-app-sdk.js`、`make mcp-app-sdk` で取得）が無ければ UI を諦めて素のツール登録に落ちる**: `ui_assets.load_search_app_html()` がテンプレート／vendor のどちらかを読めない、または読めても内容が壊れている（`</script` の混入・プレースホルダ数の不一致）場合は `None` を返し、`apps_ui.py` は `Apps()` に何も登録しない（`Apps()` が空なら `MCPServer(...)` の構築は成功する）。このとき `apps_ui.register_fallback()` が従来どおり `mcp.add_tool(tools.search_products, ...)` で素のツールとして登録するため、vendor JS が無くても `/mcp` は 11 ツールのまま動く（`0001`/`0002` の分離と同じ「付随機能の失敗で店を止めない」規律）。壊れている場合（無いのではなく内容が不正な場合）だけ `make logs-backend` に warning が残る。
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
