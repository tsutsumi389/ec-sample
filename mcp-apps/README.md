# mcp-apps — MCP Apps の View（iframe の中身）

`/mcp` が返す検索結果カード UI・商品詳細パネル UI の**描画側だけ**を持つ
TypeScript + React（18.3.1、TSX）のプロジェクト。ビルド結果は単一ファイル HTML 2枚で、
backend がそれを読んで `ui://hibino/...` のリソースとして配る。

```
mcp-apps/                     ← ここ（View の実装とビルド）
  search.html / product.html  ← エントリ HTML（**root 直下に置くこと**。後述）
                                 中身は <div id="root"> だけで、骨組みは持たない
  src/<view>/main.tsx         ← 取り付け（CSS の import と mountView だけ）
  src/<view>/*View.tsx        ← 画面の形
  src/<view>/use*View.ts      ← 状態（useReducer）とホストとの配線（useApp）
  src/<view>/*.css            ← その View 固有のスタイル
  src/shared/                 ← 2つの View で共通のもの
  build.mjs                   ← vite をエントリごとに呼ぶビルドスクリプト。
                                 **エントリの一覧（ENTRIES）を持つ唯一の場所**
  scripts/check-dist.ts       ← 成果物が自己完結しているかの検査。dist に何が揃って
                                 いるべきかは ENTRIES から `${entry}.html` で導出する
        ↓ 出力
backend/app/mcp_server/ui/dist/search.html
backend/app/mcp_server/ui/dist/product.html
        ↓ 読むだけ
backend/app/mcp_server/ui_assets.py → apps_ui.py → /mcp
```

## backend との関係

- **backend は「出来上がった HTML を読むだけ」。** `ui_assets.load_search_app_html()` /
  `load_product_app_html()` が `dist/` のファイルを `read_text()` する。
- **dist が無くても店は止まらない。** ファイルが読めなければ `None` が返り、
  `apps_ui.register_fallback()` が `search_products` / `get_product` を**素のツール**として
  登録する。`/mcp` は 11 ツールのまま動き、UI だけが付かない。判定はツールごとに独立
  （片方だけ dist があれば、そのツールにだけ UI が付く）。
  ただし **compose 経路ではここに到達しない**——backend は `depends_on:` で
  `mcp-apps` の healthy（dist の2枚が揃うこと）を待つので、ビルドが通らない間は
  backend 自体が起動しない（`make logs-mcp-apps` を見ること）。このフォールバックが
  実際に効くのは「compose を通さず backend だけ動かした場合」と「dist はあるが
  中身が壊れている場合」の2つ。UI が付かないまま気づかず開発を続けるより待たせる、
  という判断であって、フォールバックを外してよいという意味ではない。
- ファイルはあるが中身が壊れている場合は backend が warning を残して同じくフォールバックする
  （`make logs-backend` で気づける）。**壊れたものを作らない責任はこちら側**にあり、
  それが `scripts/check-dist.ts` の役目。
- **backend は HTML を import 時に一度だけ読む。** dist を書き換えたら backend の再起動が要る
  （compose の uvicorn に `--reload-include '*.html'` を足してある）。
- ツールの入出力契約（`structuredContent` と `_meta.ui`）は backend の `views.py` /
  `ui_assets.py` が唯一の源。`src/shared/types.ts` はその**写し**であり、
  変えるときは必ず backend が先。

## 動かし方

コンテナ（`mcp-apps` サービス）は `npm run dev` = `node build.mjs --watch` で常駐し、
ソースを直すたびに dist を書き換える。手で流したいときも **make 経由（コンテナ内）**を使う:

```
make mcp-ui-build   # dist へ2枚出して検査する（npm run build）
make mcp-typecheck  # tsc --noEmit。**ビルドは型を見ない**ので別建てで要る
make mcp-check      # /mcp のツール一覧と UI リソースの有無を確認する
make mcp-deps       # package.json に依存を足したとき（後述。up-d では反映されない）
```

**`package.json` に依存を足したら `make mcp-deps`。** `node_modules` は匿名ボリュームで
コンテナ側に隔離してあり、`docker compose up`（= `make up-d`）は**コンテナを作り直しても
匿名ボリュームは引き継ぐ**ので、イメージを新しくしても中身は古いままになる。そのまま
watch ビルドが走ると、解決できなかった依存が `import ... from "react-dom/client"` の形で
残った HTML が dist へ書き出され（ビルドは非ゼロ終了するが**ファイルは書かれた後**）、
backend がそれを読んで白画面の View を配る。React を入れたときに実際に踏んだ経路で、
いまは `scripts/check-dist.ts` がこの形の成果物を**書く前に**落とす。

**ビルドが型を検査しないこと**に注意する。Vite 8（rolldown/oxc）は型注釈を落とすだけなので、
型エラーがあっても `npm run build` は成功し、`make logs-mcp-apps` にも何も出ない。
フロントの `make lint` にあたるのが `make mcp-typecheck` で、View を直したら必ず通すこと。

ホストに Node がある環境なら `npm ci && npm run build` でも同じものが出るが、
**手順としては勧めない**（ホストに Node が必要という環境依存を復活させないため。
`Makefile` の `mcp-ui-build` のコメントも同じ理由でホスト実行を避けている）。
`npm install` ではなく `npm ci` なのは Dockerfile と同じ理由で、前者はロックファイルを
書き換えうるため（イメージ・ホスト・リポジトリで入っている版が黙ってずれる）。
ホストで入れた場合、その `node_modules` は `mcp-apps/.dockerignore` が
イメージから除外する——除外しないと darwin 向けのネイティブバイナリが
`COPY . .` でイメージに混ざる。

出力先はホストでもコンテナ内でも同じ相対パス（`../backend/app/mcp_server/ui/dist`）に
解決される。compose が `./mcp-apps` を `/app`、`./backend/app/mcp_server/ui` を
`/backend/app/mcp_server/ui` へマウントしてあるため。**環境変数で出力先を切り替えないこと**
（切り替えられる形にすると「ホストで動かしたら別の場所に出た」が起き、backend が古い
HTML を読んでいることに誰も気づけない）。

## 決めごと

- **エントリ HTML は `mcp-apps/` の直下に置く。** Vite は root からの相対パスをそのまま
  `outDir` 内のパスにするので、`src/search.html` を入力にすると `dist/src/search.html` に
  出てしまい、backend が読む `dist/search.html` が生えない。TSX/CSS は `src/` に置き、
  HTML からは `<script type="module" src="/src/search/main.tsx">` で参照する。
- **エントリ HTML に画面の骨組みを書かない。** 中身は `<div id="root">` だけで、
  ヘッダもカードも React が組む。`createRoot().render()` はこの器の中身を必ず作り直すので、
  静的に置いた要素は一瞬だけ見えて消える（同じ画面を2か所で定義することにもなる）。
- **SDK は `@modelcontextprotocol/ext-apps/react` から import する。** ルート
  （`@modelcontextprotocol/ext-apps`）と `/react` は**それぞれが `App` クラスの実体を持つ
  別々のバンドル**で、両方から import すると同じクラスが2つ入る（33KB 増え、`instanceof` が
  食い違う）。`/react` はルートの中身を丸ごと再エクスポートしているので、型も値もこちら
  1本で足りる。
- **App の生成・接続は SDK の `useApp` に任せる。** `onAppCreated` は App を作った直後・
  `connect()` の前に呼ばれるので、一度きりの通知（tool-input / tool-result / tool-cancelled）の
  購読はそこに書く。手で `new App()` して `connect()` する形に戻すと、この順序を自分で
  守り続けることになる（登録が遅れると通知を取りこぼす。SDK 自身が
  `_assertHandlerTiming` で警告する）。テーマ・CSS 変数・フォントの適用も
  `useHostStyles` に任せる——**`shared/host.ts` が持つのは safe area だけ**で、
  それは SDK のフックが扱わないものだから。
- **購読は `addEventListener` を使い、`app.on*` の setter を使わない。** setter は単一の
  ハンドラを置き換えるので、SDK の `useHostStyles` のような別の購読者と奪い合いになる
  （SDK 自身も `on*` を deprecated にしている）。
- **1回の `vite build` で出せるエントリは1つだけ。** vite-plugin-singlefile が
  `output.codeSplitting` を落とすため複数入力を渡せない。`build.mjs` が2回に分けて呼ぶ。
  そのため `vite build` を直接叩くと `MCP_APP_ENTRY` 未設定で止まる。
- **`emptyOutDir` は false 固定。** 1エントリ＝1ビルドなので、dist を空にするビルドは必ず
  相方の成果物を巻き添えにする。watch では **search を1文字直すたびに product.html が消える**
  （実測済み）。ビルドは同じ2つのファイル名を上書きするだけなので掃除は要らない。
- **`cssTarget` は `"esnext"` 固定。下げてはならない。** 既定の target だと Vite 8 の
  CSS minifier（Lightning CSS）が `light-dark()` を
  `var(--lightningcss-light,…) var(--lightningcss-dark,…)` へ書き換えるが、**この変数の
  定義は `color-scheme` を宣言している規則にしか出力されない**。この CSS は `color-scheme`
  を各 View の `<meta>` と SDK の `applyDocumentTheme()` に任せていて自分では宣言しないので、
  参照だけが出て定義が1つも出ない。結果フォールバックが「色2個」の不正値に展開され、宣言ごと
  invalid at computed-value time で捨てられる（実測: `body` の背景が `rgba(0,0,0,0)`＝透明に
  なる。`esnext` なら `rgb(24,24,27)`）。**ホストが `--color-*` を配ってこない経路でしか
  表面化しない**ので、変数を全部送ってくるホストで見ている限り気づけない。`light-dark()` の
  フォールバックは「ホストがテーマ変数を配らなくても読める」という `shared/theme.css` の
  設計の柱であり、それが丸ごと死ぬ。
- **依存はすべて厳密固定**（`^` `~` を付けない）。`frontend/package.json` と同じ流儀。
  `@modelcontextprotocol/ext-apps` は 1.7.5（以前 vendor していたバンドルと同じ版）、
  React は 18.3.1（`frontend/` と同じ版に揃える）。
- **HTML に商品データを焼き込まない。** 描画データは `toolresult` で受け取ったものだけを
  使う。ビルド時に商品名などを埋め込む仕組みを新設しないこと。
- **`dangerouslySetInnerHTML` を使わない。** 商品名・説明・仕様・エラー文はすべて未信頼の
  テキストとして扱い、`{value}` として JSX の子要素に埋めて React に自動エスケープさせる。
  移植前は `document.createElement` + `textContent` だけで組み、その規律を機械的に保つために
  描画ライブラリを持ち込まない方針だった。React に移した今、**規律の中身は同じで、
  抜け道の名前が `innerHTML` から `dangerouslySetInnerHTML` に変わっただけ**——
  どこにも書かないこと。
- **StrictMode で包まない。** View の配線は App の生成と `connect()` を持つので、effect が
  2回走ると接続が二重になり、一度きりの通知をどちらのインスタンスが受けるか不定になる。
  ここは開発サーバも HMR も無い（ビルドした単一ファイル HTML を iframe が読むだけ）ので、
  StrictMode で得られるものが最初から無い。
- **押せる／押せないは状態からの派生で書く。** 移植前は `setLoading()` と
  `resetControlsToConfirmed()` の2か所が DOM の `disabled` を書き換えており、経路によって
  片方だけ通る食い違いが実際に起きていた。`disabled={...}` の式を唯一の源にすること。
  並び替えの `<select>` も `value={state.sort}` で制御する（再検索が失敗しても
  `state.sort` は書き換わらないので、「表示は旧ソート・セレクトは新ソート」の食い違いが
  構造的に起きない）。
