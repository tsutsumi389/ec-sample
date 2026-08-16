/**
 * ビルド成果物（単一ファイル HTML）が本当に自己完結しているかを検査する。
 *
 * **この検査は backend から移設したもの。** 以前は
 * backend/app/mcp_server/ui_assets.py の build_app_html() が、vendor JS を
 * <script> タグの中へ差し込む直前に「バンドルに "</script" が含まれていないか」
 * 「プレースホルダがちょうど1回か」を検査していた。View のビルドが TypeScript 側へ
 * 移り、backend は「出来上がった HTML を読むだけ」になったので、**壊れた HTML を
 * 作らない責任もこちら側へ移った**。backend に残るのは「読んだ HTML が壊れていたら
 * warning を出して素のツール登録に落ちる」という受け側の防御だけで、それは最後の
 * 砦であって作り手の検査の代わりにはならない。
 *
 * 検査するもの:
 *   1. dist にエントリぶんの HTML が全部あること（最終ビルドのときだけ）
 *   2. HTML 文書として完結していること（空でない・`<html` と `</html>` が揃っている）。
 *      **この条件は backend の ui_assets.py と同一**にしてある（後述）
 *   3. インライン化されたスクリプトの内側に生の "</script" が無いこと
 *   4. 外部参照（script src / link href）が残っていないこと
 *
 * 3 が特に重要。インライン JS の中に生の "</script" が1つでも現れると、ブラウザは
 * そこで script 要素を閉じ、以降の JS を**ただのテキストとして画面に描く**。
 * MCP のホストは iframe に HTML を流し込むだけなので、この壊れ方はビルドでも
 * 起動時でも検出されず、実際に UI を開いた人だけが気づく。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Plugin } from "vite";

/**
 * エントリ名（"search" / "product"）から dist に出る成果物の名前を作る。
 *
 * **エントリの一覧はここに持たない。** 唯一の源は build.mjs の ENTRIES で、そこから
 * MCP_APP_ENTRIES 経由で vite.config.ts → checkDistPlugin({ entries }) と渡ってくる。
 * 以前はこちらにも ["search.html", "product.html"] を並べ、コメントで「食い違えば
 * checkDistFiles() が落ちるので必ず表面化する」と説明していたが、**それは半分しか
 * 正しくなかった**——checkDistFiles() は期待するファイル名を1枚ずつ読むだけで
 * ディレクトリを列挙しないため、「余計なものがある」検出は存在せず、
 * ENTRIES にだけ足した場合（一番ありがちな向き）はビルドが緑のまま通る。
 * 二重に持つのをやめれば、その食い違い自体が起こらない。
 *
 * backend/app/mcp_server/ui_assets.py の SEARCH_APP_FILENAME / PRODUCT_APP_FILENAME は
 * 言語をまたぐ写しなので、そちらは別途手で揃える（Python から参照できる形にすると
 * ビルドと起動が結合する）。
 */
function distFileName(entry: string): string {
  return `${entry}.html`;
}

/**
 * 単一ファイル HTML 1枚ぶんの検査。問題があれば日本語の理由を配列で返す。
 *
 * 「生の "</script" があるか」を直接探すのではなく、`<script` と `</script` の
 * **個数の一致**で見ている。理由:
 *   - 文字列 "</script" の中に "<script" は現れない（"<" の次が "/"）ので、
 *     2つの計数は互いに独立に数えられる。
 *   - バンドラがエスケープした形（"<\/script" や "\x3C/script"）には
 *     "<" の直後に "s" が来る箇所が無いので、どちらの計数にも入らない。
 *   - 正しく開いて閉じた script タグは、開き1個・閉じ1個をちょうど寄与する。
 * したがって **不一致であること = script ブロックの内側に生の "</script" が
 * 混入していること**、と一対一に対応する。閉じ ">" を含めた完全一致で探す方式では
 * "</script " のような空白区切りの終端（HTML の仕様上ここでも script は閉じる）を
 * 取りこぼすが、個数で見る方式ならそれも確実に捕まる。
 *
 * 逆向きの誤検知——JS の文字列リテラルに "<script" と書いた場合——では
 * 開きだけが増えて不一致になり、ここで落ちる。実害の無いコードでビルドが
 * 止まることになるが、**壊れた HTML を配るよりは止まるほうがよい**（fail closed）。
 */
export function findHtmlProblems(fileName: string, html: string): string[] {
  const problems: string[] = [];

  // **この3条件は backend/app/mcp_server/ui_assets.py の _load_app_html と対で持つ値。**
  // 消費側（backend）が拒む HTML をこちらが通してしまうと、ビルドも `make logs-mcp-apps` も
  // 緑のまま `make mcp-check` の「UIリソース」から1本消え、唯一の手掛かりが backend の
  // warning 1行になる。エントリ HTML（mcp-apps/search.html・product.html）は手書きで、
  // Vite は外枠をそのまま素通しするため、末尾の </html> を消せば dist にもそのまま出る
  // ——**作り手の検査**を名乗る以上、条件は消費側より緩くしてはならない。
  // 片方だけ直さないこと（ui_assets.py 側を変えたらここも同じ形に揃える）。
  if (html.trim() === "" || !html.includes("<html") || !html.includes("</html>")) {
    problems.push(
      `${fileName}: HTML として壊れています（空、または <html> 要素の開き・閉じが揃っていません）。`,
    );
    // 中身が無いなら以降の検査は意味が無いので、ここで打ち切る。
    return problems;
  }

  const openCount = (html.match(/<script/gi) ?? []).length;
  const closeCount = (html.match(/<\/script/gi) ?? []).length;
  if (openCount !== closeCount) {
    problems.push(
      `${fileName}: script タグの開き ${openCount} 個に対して閉じ ${closeCount} 個で`
      + "一致しません。インライン化した JS の中に生の閉じタグ文字列が混入していると"
      + "ブラウザがそこで script を閉じ、以降の JS が画面にテキストとして出ます。",
    );
  }

  // 単一ファイル化に失敗すると、ここに ./assets/xxx.js のような相対参照が残る。
  // iframe に HTML 文字列を流し込むだけの MCP ホストでは、この参照は絶対に解決
  // できない（取得元のオリジンが無い）ので、白画面になって終わる。
  // data: URI はインライン化の結果そのものなので除外する。
  const externals = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)]
    .map((match) => match[1])
    .filter((url) => url !== undefined && !url.startsWith("data:"));
  if (externals.length > 0) {
    problems.push(
      `${fileName}: 外部参照が残っています（${externals.join(", ")}）。`
      + "単一ファイル化に失敗しています。vite-plugin-singlefile が有効か確認してください。",
    );
  }

  return problems;
}

/**
 * dist ディレクトリ全体の検査。存在確認まで含む。
 *
 * 各エントリのビルドは自分が出した1枚しか見られないので、「エントリぶん揃っているか」は
 * ここでディスクを読んで確かめる（最終エントリのビルドの最後に1回だけ走る）。
 */
function checkDistFiles(distDir: string, entries: readonly string[]): string[] {
  const problems: string[] = [];
  for (const entry of entries) {
    const fileName = distFileName(entry);
    const path = join(distDir, fileName);
    let html: string;
    try {
      html = readFileSync(path, "utf8");
    } catch {
      problems.push(
        `${path}: ビルド成果物がありません。エントリ ${entry} のビルドが`
        + " 成功しているか確認してください。",
      );
      continue;
    }
    problems.push(...findHtmlProblems(fileName, html));
  }
  return problems;
}

/**
 * 上記の検査をビルドの内側で走らせる Vite プラグイン。
 *
 * postbuild スクリプトに切り出さないのは、npm run dev（watch）の再ビルドを
 * 素通りさせないため。View を直しながら開発している最中こそ、壊れた HTML が
 * backend に読まれる（コンテナの backend は --reload-include '*.html' で
 * 拾い直す）状況になる。
 *
 * @param finalCheck 最後のエントリのビルドなら true。dist 全体（エントリぶん揃って
 *   いるか）の検査をこのビルドの終わりに行う。
 * @param entries build.mjs の ENTRIES がそのまま渡ってくる（唯一の源はあちら）。
 */
export function checkDistPlugin(options: {
  finalCheck: boolean;
  entries: readonly string[];
}): Plugin {
  let outDir = "";
  return {
    name: "hibino-mcp-apps:check-dist",
    // vite-plugin-singlefile がインライン化を終えた後の HTML を見たいので post。
    enforce: "post",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (!fileName.endsWith(".html") || chunk.type !== "asset") continue;
        const source = chunk.source;
        const html = typeof source === "string" ? source : new TextDecoder().decode(source);
        const problems = findHtmlProblems(fileName, html);
        if (problems.length > 0) {
          // this.error() はビルドを中断させる。build.mjs はこれを受けて非ゼロ終了する。
          this.error(problems.join("\n"));
        }
      }
    },
    closeBundle() {
      if (!options.finalCheck) return;
      const problems = checkDistFiles(outDir, options.entries);
      if (problems.length > 0) {
        // closeBundle のプラグインコンテキストは実装差があるので this.error() では
        // なく素直に throw する。build.mjs 側で拾って非ゼロ終了する。
        throw new Error(problems.join("\n"));
      }
    },
  };
}
