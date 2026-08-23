import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

import { checkDistPlugin } from "./scripts/check-dist.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

// backend が読む場所へ直接吐く（ui_assets.py は read_text() するだけで、間にコピー処理は
// 無い）。この相対パスはホストでも mcp-apps コンテナ内でも同じ場所に解決されるので、
// 出力先を環境変数で切り替えられる形にしないこと（別の場所に出ても誰も気づけない）。
const OUT_DIR = resolve(HERE, "../backend/app/mcp_server/ui/dist");

// **1回の vite build で出せるエントリは1つだけ。** vite-plugin-singlefile は
// output.codeSplitting を false に落とす（Vite 8 系）ため、複数入力は Rolldown が
// INVALID_OPTION で落ちる。かといって有効に戻すと、プラグインが全 JS チャンクを削除
// リストへ積むので「存在しないファイルを import する壊れた HTML」が **エラーも警告も
// 無しに** 出来る。search / product は build.mjs が2回に分けてビルドする。
const entry = process.env.MCP_APP_ENTRY;
if (!entry) {
  throw new Error(
    "MCP_APP_ENTRY が未設定です。vite build を直接叩かず、npm run build / npm run dev "
    + "（= node build.mjs）から起動してください。エントリごとに1回ずつビルドする必要が"
    + "あります（理由は vite.config.ts のコメント参照）。",
  );
}

// 最終ビルドで「dist にエントリぶん揃っているか」を確かめるための一覧。**唯一の源は
// build.mjs の ENTRIES**——ここにもう一度並べると View を足したとき片方だけ古くなる。
const ENTRIES = (process.env.MCP_APP_ENTRIES ?? entry).split(",").filter(Boolean);

export default defineConfig({
  plugins: [
    viteSingleFile(),
    // vite-plugin-singlefile の **後**に走らせる（インライン化済みの HTML を見たい）。
    // 独立した postbuild にしないのは、npm run dev の再ビルドを素通りさせないため。
    checkDistPlugin({ finalCheck: process.env.MCP_APP_FINAL === "1", entries: ENTRIES }),
  ],
  build: {
    outDir: OUT_DIR,
    // **false で固定する。true にしてはならない。** 1エントリ＝1ビルドなので、dist を
    // 空にするビルドは必ず相方の成果物を巻き添えにする（watch では **search を1文字
    // 直すたびに product.html が消える**。実測済み）。明示的に書いてあるのは、未指定だと
    // outDir が root の外にあるため Vite が毎回 emptied の警告を出すから。
    emptyOutDir: false,
    // **"esnext" から下げてはならない。** Vite 8 の CSS minifier（Lightning CSS）は既定の
    // target だと light-dark() を var(--lightningcss-light,…) var(--lightningcss-dark,…) へ
    // 書き換えるが、この2変数は color-scheme を宣言している規則にしか定義を出さない。
    // この CSS は color-scheme を <meta> と SDK に任せているので参照だけが残り、色2個の
    // 不正な値になって宣言ごと捨てられる（実測でヘッドレス Chrome の body が透明になった）。
    // 表面化するのはホストが --color-* を配ってこない経路＝theme.css の light-dark()
    // フォールバックだけ。cssMinify: false でも直るが minify を失い、"esbuild" は落ちる。
    cssTarget: "esnext",
    rollupOptions: {
      // **エントリ HTML を src/ の下に置かないこと。** Vite は root（mcp-apps/ 直下）
      // からの相対パスをそのまま outDir 内のパスにするので、src/search.html は
      // dist/src/search.html に出て、ui_assets.py が読む dist/search.html が生えない。
      input: resolve(HERE, `${entry}.html`),
    },
    // assetsInlineLimit / cssCodeSplit / codeSplitting は **書かない**。
    // vite-plugin-singlefile の _useRecommendedBuildConfig が全部設定するので、
    // 書き写すと二重管理になり、プラグインの更新で食い違ったときに壊れる。
  },
});
