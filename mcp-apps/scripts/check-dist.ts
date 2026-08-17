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
 *   5. インライン化されたスクリプトに、解決されなかった import が残っていないこと
 *
 * 3 が特に重要。インライン JS の中に生の "</script" が1つでも現れると、ブラウザは
 * そこで script 要素を閉じ、以降の JS を**ただのテキストとして画面に描く**。
 * MCP のホストは iframe に HTML を流し込むだけなので、この壊れ方はビルドでも
 * 起動時でも検出されず、実際に UI を開いた人だけが気づく。
 *
 * 5 は 4 の抜け道を塞ぐもので、**実際に踏んだ**（findUnresolvedImports のコメント）。
 * 4 はタグの属性しか見ないので、`<script type="module">` の**中**に残った
 * `import ... from "react-dom/client"` を素通しする。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Plugin } from "vite";

/**
 * ブラウザと同じ読み方で HTML を「マークアップ」と「script 要素の本文」に切り分ける。
 *
 * HTML の仕様上、`<script>` の本文は **最初に現れた "</script" まで**で終わる
 * （引用符もエスケープも効かない）。これが「インライン JS の中に生の "</script" が
 * 1つでもあると、そこで script が閉じて以降が画面にテキストとして出る」理由そのもの
 * なので、検査もこの読み方をそのまま写す。
 *
 * **切り分けた markup を返すのは、テキストを見る検査すべてに同じ境界を使わせるため。**
 * バンドルされた JS は HTML の形をした文字列を平気で持ち歩く（react-dom は
 * `'<script>'` というリテラルを含む）。その事実を知らずに文書全体へ正規表現を掛けると、
 * 健全なバンドルでビルドが恒久的に止まる——script の数え方はまさにそれで一度壊れた。
 * 同じ轍を外部参照の検査（下の findHtmlProblems）でも踏まないよう、**JS の中身は
 * markup に含めない**。
 *
 * @param html 元の HTML。markup はこちらから切り出す（外部参照の検査が URL を
 *   そのままの大小文字で報告できるようにするため）。
 * @param lower 小文字化した HTML（呼び出し側で1回だけ作る）。探索と、返す本文に使う。
 *   本文が小文字のままなのは、探すのが import 文と module specifier だけだから。
 */
function scanScripts(
  html: string,
  lower: string,
): { bodies: string[]; markup: string; unterminated: boolean } {
  const bodies: string[] = [];
  const markupParts: string[] = [];
  let index = 0;
  const done = (unterminated: boolean) => ({
    bodies,
    // 改行で継ぐ。素で連結すると、離れた位置のタグの断片どうしが1つのタグに
    // 見えてしまう組み合わせを自分で作ることになる。
    markup: markupParts.join("\n"),
    unterminated,
  });
  for (;;) {
    // "</script" は "<script" に一致しない（"<" の次が "/"）ので、閉じタグを
    // 開きとして数えてしまうことは無い。
    const open = lower.indexOf("<script", index);
    if (open === -1) {
      markupParts.push(html.slice(index));
      return done(false);
    }
    const bodyStart = lower.indexOf(">", open);
    if (bodyStart === -1) {
      markupParts.push(html.slice(index));
      return done(true);
    }
    // **開始タグ自体は markup 側に残す。** `<script src="...">` を外部参照として
    // 捕まえるのはこの部分であって、本文ではない。
    markupParts.push(html.slice(index, bodyStart + 1));
    const close = lower.indexOf("</script", bodyStart + 1);
    if (close === -1) {
      bodies.push(lower.slice(bodyStart + 1));
      return done(true);
    }
    bodies.push(lower.slice(bodyStart + 1, close));
    // 本文の内側は読み飛ばす。**ここが要点**——本文に "<script" という文字列リテラルが
    // あっても、ブラウザ同様それは要素の開始として扱われない。
    index = close + "</script".length;
  }
}

/**
 * インライン化された JS に、解決されずに残った import が無いかを見る。
 *
 * バンドル済みの単一ファイルなら、script の本文に module specifier は1つも残らない。
 * **残っているということは、その依存が外部化された（= バンドラが解決できなかった）
 * ということ**で、iframe には取得元のオリジンが無いので実行時に
 * "Failed to resolve module specifier" で止まり、画面は白いままになる。
 *
 * **`<script src>` を見る外部参照の検査ではこれを捕まえられない。** 実際、mcp-apps
 * コンテナの node_modules が古いまま（react を足す前のイメージで作られた匿名
 * ボリューム）だったとき、`import{createRoot}from"react-dom/client"` を抱えた HTML が
 * dist へ書き出され、外部参照の検査も HTML の体裁の検査もすり抜けた。ビルド自体は
 * 非ゼロ終了していたが、**ファイルは書かれた後**だったので backend は壊れた View を
 * 読み込んで配り続けた。ここで落とせば generateBundle の時点で止まり、dist には
 * 直前の正常な HTML が残る。
 */
function findUnresolvedImports(bodies: readonly string[]): string[] {
  const specifiers = new Set<string>();
  for (const body of bodies) {
    // 静的 import/export（`from"..."`）と動的 import（`import("...")`）の両方。
    for (const match of body.matchAll(/\bfrom\s*(["'])([^"']+)\1/g)) specifiers.add(match[2]!);
    for (const match of body.matchAll(/\bimport\s*\(\s*(["'])([^"']+)\1/g)) specifiers.add(match[2]!);
  }
  return [...specifiers];
}

/**
 * 単一ファイル HTML 1枚ぶんの検査。問題があれば日本語の理由を配列で返す。
 *
 * script については **「ブラウザが数える script 要素の数」と「生の "</script" の
 * 出現回数」の一致**で見る。正しい文書では、script 要素はそれぞれちょうど1つの
 * "</script" で閉じられるので両者は必ず等しい。インライン JS に生の "</script" が
 * 混入すると、そこで要素が早く閉じ、本来の終端が余る形で **出現回数だけが増える**。
 *
 * **以前は `<script` と `</script` の個数の一致で見ていたが、それは使えない。**
 * react-dom が `'<script>'` という文字列リテラルをバンドルに持ち込むため、開きだけが
 * 1つ増えて常に不一致になる（= 正常なビルドが恒久的に止まる）。しかも悪いことに、
 * その1個ぶんの下駄は「生の "</script" が1つ混入した」状態と相殺してしまい、
 * **本物の破損を素通しする**。要素を数える側をブラウザの読み方に合わせれば、
 * 文字列リテラルは本文の内側なので数に影響しない。
 *
 * 残る死角は「生の "</script" の**後ろ**に "<script" という文字列がある」場合だけで、
 * そのときは早く閉じた後のテキストが新しい script 要素の開始と読まれて数が揃う。
 * バンドルされた JS でこの順序が揃うことは考えにくいが、**万能ではない**。
 * 閉じられない script（"</script" が1つも無い）は unterminated として別に落とす。
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

  const lower = html.toLowerCase();
  const { bodies, markup, unterminated } = scanScripts(html, lower);
  const closeCount = (lower.match(/<\/script/g) ?? []).length;
  if (unterminated) {
    problems.push(
      `${fileName}: 閉じられていない script タグがあります。`
      + "インライン化した JS がそのまま画面にテキストとして出ます。",
    );
  } else if (closeCount !== bodies.length) {
    problems.push(
      `${fileName}: script 要素 ${bodies.length} 個に対して閉じタグ文字列が ${closeCount} 個`
      + "あります。インライン化した JS の中に生の閉じタグ文字列が混入していると"
      + "ブラウザがそこで script を閉じ、以降の JS が画面にテキストとして出ます。",
    );
  }

  const unresolved = findUnresolvedImports(bodies);
  if (unresolved.length > 0) {
    problems.push(
      `${fileName}: 解決されなかった import が残っています（${unresolved.join(", ")}）。`
      + "依存がバンドルされず外部化されています。iframe には取得元のオリジンが無いので"
      + "実行時に module の解決に失敗し、画面が白いままになります。"
      + "コンテナの node_modules が古い可能性があります"
      + "（package.json に依存を足したら make mcp-deps）。",
    );
  }

  // 単一ファイル化に失敗すると、ここに ./assets/xxx.js のような相対参照が残る。
  // iframe に HTML 文字列を流し込むだけの MCP ホストでは、この参照は絶対に解決
  // できない（取得元のオリジンが無い）ので、白画面になって終わる。
  // data: URI はインライン化の結果そのものなので除外する。
  // **走査するのは markup（script の本文を除いた部分）であって html 全体ではない。**
  // インライン化された JS が `<link href="` のような文字列リテラルを持ち込んだ瞬間に
  // 健全なバンドルでビルドが止まる——script の数え方が react-dom の `'<script>'` で
  // 壊れたのとまったく同じ形の事故で、境界を1か所（scanScripts）に統一してある。
  const externals = [...markup.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)]
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
 *
 * **エントリの一覧はこのファイルに持たない。** 唯一の源は build.mjs の ENTRIES で、
 * そこから MCP_APP_ENTRIES 経由で vite.config.ts → checkDistPlugin({ entries }) と
 * 渡ってくる。以前はこちらにも ["search.html", "product.html"] を並べ、コメントで
 * 「食い違えば checkDistFiles() が落ちるので必ず表面化する」と説明していたが、
 * **それは半分しか正しくなかった**——この関数は期待するファイル名を1枚ずつ読むだけで
 * ディレクトリを列挙しないため、「余計なものがある」検出は存在せず、ENTRIES にだけ
 * 足した場合（一番ありがちな向き）はビルドが緑のまま通る。二重に持つのをやめれば、
 * その食い違い自体が起こらない。
 *
 * backend/app/mcp_server/ui_assets.py の SEARCH_APP_FILENAME / PRODUCT_APP_FILENAME は
 * 言語をまたぐ写しなので、そちらは別途手で揃える（Python から参照できる形にすると
 * ビルドと起動が結合する）。
 */
function checkDistFiles(distDir: string, entries: readonly string[]): string[] {
  const problems: string[] = [];
  for (const entry of entries) {
    const fileName = `${entry}.html`;
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
