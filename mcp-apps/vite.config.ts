import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

import { checkDistPlugin } from "./scripts/check-dist.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- 出力先 ---------------------------------------------------------------
// backend が読む場所へ直接吐く。backend/app/mcp_server/ui_assets.py の
// load_search_app_html() / load_product_app_html() が **このパスのファイルをそのまま
// read_text() するだけ**の実装になっており、間にコピー処理は無い。
//
// **この相対パスは「ホストで npm run build したとき」と「mcp-apps コンテナの中で
// npm run dev したとき」の両方で同じ場所に解決される。** compose が mcp-apps
// サービスに ./mcp-apps を /app へ、./backend/app/mcp_server/ui を
// /backend/app/mcp_server/ui へマウントしてあるので、コンテナ内でも
// /app/../backend/app/mcp_server/ui/dist = /backend/app/mcp_server/ui/dist に落ちる。
// 環境変数で出力先を切り替えない（切り替えられる形にすると「ホストで動かしたら
// 別の場所に出た」が起こり、backend が古い HTML を読んでいることに誰も気づけない）。
const OUT_DIR = resolve(HERE, "../backend/app/mcp_server/ui/dist");

// ---- エントリ -------------------------------------------------------------
// **1回の vite build で出せるエントリは1つだけ。** vite-plugin-singlefile は
// output.codeSplitting を false に落とす（Vite 8 系）ため、複数入力を与えると
// Rolldown が INVALID_OPTION で落ちる。かといって codeSplitting を有効に戻すと、
// プラグインの generateBundle が「HTML の <script src> に一致したかどうかに関わらず
// 全 JS チャンクを削除リストへ積む」実装なので、共有チャンクだけが消えた
// 「存在しないファイルを import する壊れた HTML」が **エラーも警告も無しに** 出来る。
// したがって search / product は build.mjs が2回に分けてビルドする。ここは
// MCP_APP_ENTRY で「今どちらを組んでいるか」を受け取るだけ。
const entry = process.env.MCP_APP_ENTRY;
if (!entry) {
  throw new Error(
    "MCP_APP_ENTRY が未設定です。vite build を直接叩かず、npm run build / npm run dev "
    + "（= node build.mjs）から起動してください。エントリごとに1回ずつビルドする必要が"
    + "あります（理由は vite.config.ts のコメント参照）。",
  );
}

export default defineConfig({
  // root は mcp-apps/ 直下。**エントリ HTML を src/ の下に置かないこと**——
  // Vite は root からの相対パスをそのまま outDir 内のパスにするので、
  // src/search.html を入力にすると dist/src/search.html に出てしまい、
  // ui_assets.py が読む dist/search.html が生えない。
  plugins: [
    viteSingleFile(),
    // 検査は vite-plugin-singlefile の **後**に走らせる（インライン化済みの HTML を
    // 見たいため）。独立した postbuild スクリプトにしないのは、npm run dev
    // （vite の watch）の再ビルドを素通りさせないため。
    checkDistPlugin({ finalCheck: process.env.MCP_APP_FINAL === "1" }),
  ],
  build: {
    outDir: OUT_DIR,
    // **false で固定する。true にしてはならない。**
    // ここは1エントリ＝1ビルドなので、dist を空にするビルドは必ず相方の成果物を
    // 巻き添えにする。非 watch でも「2本目が1本目の search.html を消す」形で効くが、
    // watch ではもっと悪く、**search を1文字直すたびに product.html が消える**
    // （実測済み。dist に search.html だけが残る）。消えた側は次にそのエントリを
    // 直すまで戻らず、backend は「product の UI 登録だけ静かに失敗した」状態で
    // 動き続ける。
    // 明示的に false と書いてあるのは、未指定のままだと outDir が root の外に
    // あるため Vite が毎回「is not inside project root and will not be emptied」と
    // 警告するから。dist の掃除はしない——ビルドは同じ2つのファイル名を上書きする
    // だけなので溜まるものが無く、消さないほうが「backend が読んでいる最中に
    // 一瞬ファイルが消える」事故も起きない。
    emptyOutDir: false,
    // ---- CSS を downlevel させない ----------------------------------------
    // **"esnext" から下げてはならない。** Vite 8 の CSS minifier（Lightning CSS）は
    // 既定の target だと light-dark() を「polyfill 形」へ書き換える:
    //   light-dark(#fff, #18181b)
    //     → var(--lightningcss-light,#fff) var(--lightningcss-dark,#18181b)
    // ところが Lightning CSS はこの2つの変数を **color-scheme プロパティを宣言して
    // いる規則にしか定義を出さない**。この CSS は color-scheme を各 View の
    // <meta name="color-scheme"> と SDK の applyDocumentTheme() に任せていて
    // 自分では宣言しないため、**参照だけ 26 個出て定義が 0 個**という出力になる
    // （実測値）。未定義の var() はフォールバック側に落ちるので、結果は
    //   color: var(--color-text-primary, #18181b #f4f4f5)
    // という色2個の不正な値になり、宣言ごと invalid at computed-value time で
    // 捨てられる。実測ではヘッドレス Chrome で body の background-color が
    // rgba(0,0,0,0)（透明）になった。
    //
    // **これが効くのはホストが --color-* を配ってこない経路だけ**なので、
    // 変数を全部送ってくるホストで見ている限り一生表面化しない。
    // light-dark() のフォールバックは shared/theme.css の設計の柱（ホストが
    // テーマ変数を配らなくても読める色にする）であり、それが丸ごと死ぬ。
    //
    // 移植元（backend が配っていた手書き HTML）は minify を通さず light-dark() を
    // そのまま配っていた＝元からネイティブ対応が前提。ここを esnext にすると
    // 出力に light-dark() が原文のまま残り、minify も単一ファイル化も効いたままになる。
    // なお cssMinify: false でも直るが minify を失い、cssMinify: "esbuild" は
    // Vite 8 ではビルドが落ちる（どちらも実測）。
    cssTarget: "esnext",
    rollupOptions: {
      input: resolve(HERE, `${entry}.html`),
    },
    // assetsInlineLimit / cssCodeSplit / codeSplitting は **書かない**。
    // vite-plugin-singlefile の _useRecommendedBuildConfig（既定で有効）が
    // すべて設定する。ここに書き写すと二重管理になり、プラグインの更新で
    // 食い違ったときに「単一ファイルのはずが外部参照が残る」形で壊れる。
  },
});
