// MCP Apps の View（iframe の中身）を単一ファイル HTML として組み立てる。
//
// **なぜ vite build を直接叩かず、このスクリプトが要るのか。**
// vite-plugin-singlefile は output.codeSplitting を落とすため、1回のビルドで
// 扱えるエントリは1つだけ（複数入力を渡すと Rolldown が INVALID_OPTION で落ちる）。
// かといって codeSplitting を戻すと、プラグインが共有チャンクを消したまま HTML に
// 差し込まない「壊れているのに成功扱い」の成果物が出る。そこでエントリごとに
// vite の JS API を呼び分ける。npm scripts に `vite build && vite build` と
// 並べないのは、--watch を同じ形で扱いたいから（`&&` では1本目が終わらない）。
//
// エントリの一覧はここが持つ。dist に何が揃っていなければならないかは
// scripts/check-dist.ts の EXPECTED_DIST_FILES が持ち、最後のビルドで突き合わせる
// （片方だけ足して片方を忘れたら、その場でビルドが落ちる）。
//
// **dist を消す処理をここに足さないこと。** ビルドは毎回同じ2つのファイル名を
// 上書きするだけなので溜まるものが無く、消すと「backend が読みに行った一瞬だけ
// dist が空」という窓ができる（backend は UI を諦めて素のツール登録に落ちる）。
// vite 側の emptyOutDir も同じ理由で false 固定にしてある（vite.config.ts 参照）。

import { build } from "vite";

const ENTRIES = ["search", "product"];
const WATCH = process.argv.includes("--watch");

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
