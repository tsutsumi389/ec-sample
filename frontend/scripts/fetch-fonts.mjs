/**
 * Google Fonts の woff2 を public/fonts/ に取り込み、app/fonts.css を生成する。
 *
 * なぜ next/font/google を使わないか:
 *   next/font は和文フォントの unicode-range スライス（1ウェイトあたり約124個）を
 *   ビルド時に一斉ダウンロードする。このプロジェクトの frontend コンテナには IPv6 の
 *   経路が無く、同時接続が増えると ENETUNREACH / ETIMEDOUT で大量に失敗する。
 *   しかも next/font は失敗してもビルドを通し、**黙ってフォールバックに落ちる**ため
 *   「見出しが明朝になっていない」ことに気づきにくい。
 *   自己ホストすれば取得は1回きりで、以降のビルドはネットワークに依存しない。
 *
 * 使い方（ホスト側で実行する。コンテナ内からは上記の理由で失敗する）:
 *   node frontend/scripts/fetch-fonts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(HERE, '..', 'public', 'fonts');
const CSS_OUT = path.join(HERE, '..', 'app', 'fonts.css');

// woff2 を返させるための modern UA。これが無いと ttf が返る。
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 取得する書体。variable 名は tailwind.config.ts の fontFamily と対応させること。 */
const FAMILIES = [
  { family: 'Noto Sans JP', weights: [400, 700], variable: '--font-sans-jp', slug: 'noto-sans-jp' },
  { family: 'Zen Old Mincho', weights: [700], variable: '--font-mincho', slug: 'zen-old-mincho' },
  { family: 'Inter', weights: [400, 500, 600, 700], variable: '--font-num', slug: 'inter' },
];

const CONCURRENCY = 12;

async function fetchWithRetry(url, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
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

/** items を並列度 limit で処理する。 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

fs.mkdirSync(FONT_DIR, { recursive: true });

let css = `/* 自動生成 — 編集しないこと。再生成: node frontend/scripts/fetch-fonts.mjs */\n`;
let totalBytes = 0;
let totalFiles = 0;

for (const { family, weights, variable, slug } of FAMILIES) {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@` +
    `${weights.join(';')}&display=swap`;
  const sheet = await (await fetchWithRetry(url)).text();

  // @font-face ブロックごとに分解し、src の URL をローカルパスへ差し替える。
  const blocks = sheet.split('@font-face').slice(1).map((b) => `@font-face${b.split('}')[0]}}`);
  const jobs = [];
  blocks.forEach((block, i) => {
    const m = block.match(/url\((https:[^)]+)\)/);
    if (m) jobs.push({ block, i, remote: m[1] });
  });

  const rewritten = await mapLimit(jobs, CONCURRENCY, async ({ block, i, remote }) => {
    const weightMatch = block.match(/font-weight:\s*(\d+)/);
    const name = `${slug}-${weightMatch ? weightMatch[1] : 'x'}-${String(i).padStart(3, '0')}.woff2`;
    const buf = Buffer.from(await (await fetchWithRetry(remote)).arrayBuffer());
    fs.writeFileSync(path.join(FONT_DIR, name), buf);
    totalBytes += buf.length;
    totalFiles++;
    return block.replace(/url\(https:[^)]+\)/, `url(/fonts/${name})`);
  });

  css += `\n/* ${family} — ${weights.join(', ')} (${rewritten.length} slices) */\n`;
  css += rewritten.join('\n') + '\n';
  console.log(`${family}: ${rewritten.length} slices`);
}

// CSS 変数はここで定義する（next/font が body に付けていた役割の置き換え）。
css += `
:root {
  --font-sans-jp: 'Noto Sans JP';
  --font-mincho: 'Zen Old Mincho';
  --font-num: 'Inter';
}
`;

fs.writeFileSync(CSS_OUT, css);
console.log(
  `\nwrote ${totalFiles} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB) -> public/fonts/`
);
console.log(`wrote ${path.relative(process.cwd(), CSS_OUT)}`);
