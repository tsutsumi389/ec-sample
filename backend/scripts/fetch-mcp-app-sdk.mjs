/**
 * MCP App SDK（クライアント側、@modelcontextprotocol/ext-apps の app-with-deps.js）を
 * 取得し、<script> タグへ直接埋め込める形へ変換して
 * backend/app/mcp_server/ui/vendor/mcp-app-sdk.js に書き出す。
 *
 * frontend/scripts/fetch-fonts.mjs と同じ流儀（Node 組み込み fetch・指数バックオフ再試行・
 * 失敗は throw で停止・黙ってフォールバックに落ちない）に沿っている。ただしフォント
 * （静的な woff2）と違い、**ここで取ってくるのは iframe の中で実行される JS そのもの**
 * なので、フォントには無い2つの安全策を足してある:
 *   (1) 取得元 URL でバージョンを固定する（PACKAGE_VERSION）。
 *   (2) 取得したバイト列の SHA-256 を期待値と突き合わせ、不一致ならファイルを一切
 *       書かずに失敗する（差し替えられた別のコードを埋め込むわけにはいかない）。
 *
 * 取得しただけでは埋め込めない。@modelcontextprotocol/ext-apps は ESM で配布されており
 * （末尾が `export{A as X,...};`）、search.html のプレースホルダは通常の <script> 実行文
 * の中にある。そこで末尾の export 文を `globalThis.__McpAppSdk = {X:A,...};` という
 * グローバル代入へ機械変換する。ミニファイされた内部変数名（A, B, ...）をこのスクリプトに
 * ハードコードしないのは、将来バンドルが更新されて変数名が変わっても正規表現で読み取れる
 * ようにするため。
 *
 * ui_assets.py の load_search_app_html() は、このスクリプトが生成したファイルが無ければ
 * None を返し、apps_ui.py はそれを見て UI 登録を諦め、search_products は従来どおり
 * 素のツールとして登録される（CLAUDE.md の「付随機能の失敗で店を止めない」規律）。
 * つまりこのスクリプトを一度も実行しなくても /mcp は起動できる。
 *
 * 使い方（ホスト側で実行する。Node の fetch を使うため）:
 *   node backend/scripts/fetch-mcp-app-sdk.mjs
 *
 * SDK のバージョンを上げるとき:
 *   PACKAGE_VERSION と EXPECTED_SHA256 を**両方**新しい実物の値に更新すること。
 *   片方だけ上げると、新しいバージョンを取りに行ったのに古いハッシュで弾かれて
 *   ファイルが書けない。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', 'app', 'mcp_server', 'ui', 'vendor');
const OUT_FILE = path.join(OUT_DIR, 'mcp-app-sdk.js');

const PACKAGE_VERSION = '1.7.5';
// unpkg は npm に公開されたパッケージのバージョン付き URL をそのまま配る（ビルドしない、
// npm publish された tarball の中身を返すだけ）ので、ここでバージョンを固定すれば
// 配信内容もそのバージョンに固定される。
const SOURCE_URL = `https://unpkg.com/@modelcontextprotocol/ext-apps@${PACKAGE_VERSION}/dist/src/app-with-deps.js`;

// 実測値。2026-08-12 に unpkg から取得した実体と、@modelcontextprotocol/ext-apps@1.7.5 の
// npm パッケージ本体（dist/src/app-with-deps.js）の両方で同じ値を確認済み。
// バージョンを上げるときはここも実物から計算し直すこと。
const EXPECTED_SHA256 = '5bc0452b9994217df506cb505af20e97e766700513afb7d0b45d255785bb051f';

async function fetchWithRetry(url, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      // 混雑・スロットリングに備えて指数バックオフ
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw new Error(`failed after ${tries} tries: ${url} (${lastErr?.message})`);
}

/**
 * 末尾の `export{A as X,B as Y,...};` を `globalThis.__McpAppSdk = {"X":A,"Y":B,...};`
 * へ機械変換する。search.html のプレースホルダは type="module" の <script> の中にある
 * 通常の実行文の間に置かれており、そこに import/export を含む ESM をそのまま挿すと
 * 構文が壊れる（この場所には export 文は書けない）ため、グローバル変数経由に変換する。
 */
function convertEsmExportToGlobal(source) {
  const match = source.match(/export\{([^}]*)\};?\s*$/);
  if (!match) {
    throw new Error(
      "取得した JS の末尾に 'export{...};' が見つかりませんでした。" +
        '@modelcontextprotocol/ext-apps のビルド形式が変わった可能性があります。' +
        'convertEsmExportToGlobal() を実物に合わせて見直してください。'
    );
  }
  const pairs = match[1].split(',').map((entry) => {
    const [local, exported] = entry.split(' as ').map((s) => s.trim());
    if (!local || !exported) {
      throw new Error(`export 節のこの部分を解釈できませんでした: ${entry}`);
    }
    return [local, exported];
  });
  const body = source.slice(0, match.index);
  const assignment =
    'globalThis.__McpAppSdk = {' +
    pairs.map(([local, exported]) => `${JSON.stringify(exported)}:${local}`).join(',') +
    '};';
  return { transformed: `${body}\n${assignment}\n`, exportCount: pairs.length };
}

console.log(`fetching ${SOURCE_URL}`);
const res = await fetchWithRetry(SOURCE_URL);
const buf = Buffer.from(await res.arrayBuffer());

const actualSha256 = crypto.createHash('sha256').update(buf).digest('hex');
if (actualSha256 !== EXPECTED_SHA256) {
  throw new Error(
    'SHA-256 が期待値と一致しません。差し替えられたコードを iframe に埋め込むわけには' +
      `いかないため、ファイルを書かずに停止します。\n` +
      `  期待値: ${EXPECTED_SHA256}\n` +
      `  実際値: ${actualSha256}\n` +
      'SDK のバージョンを意図して上げたのであれば、EXPECTED_SHA256 をこの実際値に更新して' +
      'から再実行してください。上げていないのであれば、配信元が差し替えられていないか' +
      '確認してから再実行してください。'
  );
}

const source = buf.toString('utf-8');

// HTML 構造を壊す文字列が混ざっていないかを、変換前の生ソースの時点でも確認する
// （ui_assets.build_app_html() も埋め込み時に同じ検査をするが、取得側でも早期に
// 気づけたほうが原因を切り分けやすい）。
if (source.includes('</script')) {
  throw new Error(
    "取得した JS に '</script' が含まれています。<script> タグに埋め込むと途中でタグが" +
      '閉じてしまい構造が壊れるため、ファイルを書かずに停止します。'
  );
}

const { transformed, exportCount } = convertEsmExportToGlobal(source);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  OUT_FILE,
  '/* 自動生成 — 編集しないこと。再生成: node backend/scripts/fetch-mcp-app-sdk.mjs */\n' +
    `/* source: ${SOURCE_URL} */\n` +
    `/* sha256(取得元そのまま、変換前): ${EXPECTED_SHA256} */\n` +
    transformed
);

console.log(
  `wrote ${path.relative(process.cwd(), OUT_FILE)} (${transformed.length} bytes, ${exportCount} exports)`
);
