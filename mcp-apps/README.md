# mcp-apps — MCP Apps の View（iframe の中身）

`/mcp` が返す検索結果カード UI・商品詳細パネル UI の**描画側だけ**を持つ TypeScript
プロジェクト。ビルド結果は単一ファイル HTML 2枚で、backend がそれを読んで
`ui://hibino/...` のリソースとして配る。

```
mcp-apps/                     ← ここ（View の実装とビルド）
  search.html / product.html  ← エントリ HTML（**root 直下に置くこと**。後述）
  src/<view>/*.ts, *.css      ← 各 View の実装
  src/shared/                 ← 2つの View で共通のもの
  build.mjs                   ← vite を2回呼ぶビルドスクリプト
  scripts/check-dist.ts       ← 成果物が自己完結しているかの検査
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
```

**ビルドが型を検査しないこと**に注意する。Vite 8（rolldown/oxc）は型注釈を落とすだけなので、
型エラーがあっても `npm run build` は成功し、`make logs-mcp-apps` にも何も出ない。
フロントの `make lint` にあたるのが `make mcp-typecheck` で、View を直したら必ず通すこと。

ホストに Node がある環境なら `npm install && npm run build` でも同じものが出るが、
**手順としては勧めない**（ホストに Node が必要という環境依存を復活させないため。
`Makefile` の `mcp-ui-build` のコメントも同じ理由でホスト実行を避けている）。
ホストで `npm install` した場合、その `node_modules` は `mcp-apps/.dockerignore` が
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
  出てしまい、backend が読む `dist/search.html` が生えない。TS/CSS は `src/` に置き、
  HTML からは `<script type="module" src="/src/search/main.ts">` で参照する。
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
  `@modelcontextprotocol/ext-apps` は 1.7.5。以前 vendor していたバンドルと同じ版。
- **HTML に商品データを焼き込まない。** 描画データは `app.ontoolresult` で受け取ったものだけを
  使う。ビルド時に商品名などを埋め込む仕組みを新設しないこと。
- **`innerHTML` を使わない。** 商品名・説明・仕様・エラー文はすべて未信頼のテキストとして扱い、
  `document.createElement` + `textContent` で組む。子要素の消去も `el.textContent = ""`。
  この規律を機械的に保つため、描画ライブラリ（React 等）を持ち込まない。
