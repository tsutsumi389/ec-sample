// MCP Apps の View（iframe の中身）を単一ファイル HTML として組み立てる。
//
// **なぜ vite build を直接叩かず、このスクリプトが要るのか。** vite-plugin-singlefile が
// codeSplitting を落とすため、1回のビルドで扱えるエントリは1つだけ（理由は
// vite.config.ts のコメント）。npm scripts に `vite build && vite build` と並べないのは、
// --watch を同じ形で扱いたいから（`&&` では1本目が終わらない）。
//
// **エントリの一覧を持つのはこのファイルだけ。** scripts/check-dist.ts はこの一覧から
// `${entry}.html` を導出する（MCP_APP_ENTRIES → vite.config.ts → checkDistPlugin）。
// あちらにも並べると、**ここにだけ足して向こうを忘れた場合にビルドが緑のまま通る**
// （あちらは期待するファイルを1枚ずつ読むだけでディレクトリを列挙しないため）。
//
// **dist を消す処理をここに足さないこと**（vite の emptyOutDir: false と同じ理由。
// 「backend が読みに行った一瞬だけ dist が空」という窓ができる）。

import { build } from "vite";

const ENTRIES = ["search", "product"];
const WATCH = process.argv.includes("--watch");

process.env.MCP_APP_ENTRIES = ENTRIES.join(",");

try {
  for (const [index, entry] of ENTRIES.entries()) {
    process.env.MCP_APP_ENTRY = entry;
    // 「2枚とも揃っているか」の検査は最後のビルドの終わりに1回だけ走らせる。
    process.env.MCP_APP_FINAL = index === ENTRIES.length - 1 ? "1" : "0";

    // watch: {} を渡すと vite が RollupWatcher を作って常駐する。build() 自体は
    // 初回ビルドを終えた時点で解決するので、この for ループは2つの watcher を
    // 順に立ち上げてから抜ける（プロセスは watcher が生かし続ける）。
    await build({ build: { watch: WATCH ? {} : null } });
  }
} catch (error) {
  console.error("[mcp-apps] ビルドに失敗しました。");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

console.log(
  WATCH
    ? `[mcp-apps] ${ENTRIES.join(" / ")} を監視しています。ソースを直すと dist が書き換わります。`
    : `[mcp-apps] ${ENTRIES.join(" / ")} をビルドしました。`,
);
