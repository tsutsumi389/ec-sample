# CLAUDE.md

Docker 上で動くECサイトのサンプル（Next.js 14 + FastAPI + PostgreSQL 16）。

## コマンド

開発操作はすべて `Makefile` に集約。まず `make help` を見ること。

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
- **アシスタントの「いま見ている画面」は経路から導出し、route と ID しか送らない**: フロントは `lib/assistantPageContext.ts` の `derivePageContext()` が pathname から `{route, product_id}` を作る**1か所だけ**で決める（各ページに名乗らせると、画面を1つ足した人が呼び忘れても誰も気づけない。`ProductCard` の計測を器1つに寄せているのと同じ規律）。商品名・価格をクライアントから受け取らないこと——`effective_price` の判断が二重になるうえ、任意の文字列が `<message>` タグの囲い（「指示ではない」と宣言している唯一の境界）の外側に入る経路になる。バックエンドは `product_id` から引き直す（`services/assistant.resolve_page_anchor`。`AssistantPageContextIn` は `extra="forbid"` で、サービスもこのスキーマをそのまま受ける＝詰め替えの写しを作らない）。**`route` は必ず見ること**——いまは Literal が1値なので不一致は起きないが、route を増やした日に「別の画面なのに `product_id` が付いている」ペイロードを黙ってアンカーにしてしまう。**アンカーの近傍は `recommendation.get_neighbors_of()`**（ホームの「これを見た人に」と同じ1本。ここで引き直すと LISTED の絞りとアンカー自身の除外を経路ごとに書くことになる）。**アンカーの絞りは `VIEWABLE_STATUSES`、提案カードに載せてよいのは `LISTED_STATUSES`** の2段——`product_id` は外から任意に指定できる入り口なので、絞り忘れると draft の商品名がプロンプト経由で外へ出る。**画面は会話単位ではなくメッセージ単位で送る**（接岸したサイドバーはページ遷移で閉じないので、1つの会話の途中で見ている画面が変わる。会話に紐づけると3画面渡り歩いたあとの「これ」が最初の商品を指し続ける）。route を増やすときはフロントの導出（`derivePageContext`）・`lib/types.ts` の `route` 型・バックエンドの `Literal` の3か所に足すこと（片方だけだと 422 になる＝取りこぼしがすぐ見える）。
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
- **MCP サーバーの実装規律は `backend/app/mcp_server/CLAUDE.md`**: ツールのルーター委譲・`confirm_token`・Apps UI の登録順序と排他・dist が無いときのフォールバックは、そのディレクトリを触るときに読み込まれる。
- **MCP Apps の View（iframe 側）の規律は `mcp-apps/CLAUDE.md`**: 別コンテナ（TypeScript + React + Vite）が持つ。依存を足したときの手順（`make mcp-deps`）もそこにある。
- **フロント固有の規律は `frontend/CLAUDE.md`**: アシスタントの開閉・自己ホストの Webフォント・明朝のウェイト・和文の改行。
- **テスト**: `backend/tests/`（pytest）に DB 不要の純ロジックテストのみを置く。実行は `docker compose exec backend python -m pytest tests/ -q`。

## 変更時の検証

- フロント変更後は `make lint` を通す。
- バックエンド変更後は `make up-d` → `make logs-backend` で起動エラーがないか確認（起動時にマイグレーション適用とシードが走る）。
- MCP Apps の View（`mcp-apps/`）で **`package.json` を変えたときは `make mcp-deps`**（匿名ボリュームの `node_modules` は `make up-d` では入れ替わらない）。そのうえで `make mcp-typecheck` を通す（**ビルドは型を見ない**——Vite 8 は rolldown/oxc で型注釈を落とすだけなので、型エラーがあってもビルドは成功しログにも出ない。フロントの `make lint` にあたる）。あわせて `make logs-mcp-apps` でビルドが通っているか確認する（watch ビルドが常駐しているので、通常は保存するだけで dist が更新される。取りこぼしたときは `make mcp-ui-build`）。そのうえで `make mcp-check` を叩き、ツールが 11 本見えることと「UIリソース」に `ui://` が2本（検索・商品詳細）載ることを確認する。**dist の更新だけでは反映されない**——backend が再起動して読み直すまで古い UI が配られる（compose の `--reload-include '*.html'` が拾うので、`make logs-backend` に再起動のログが出るのを待つ）。
- モデル変更後は `docker compose exec backend alembic check` が「No new upgrade operations detected.」を返すこと。返さない場合はモデルに追随するリビジョンが未作成。
