const https = require('https');

// next/font は Google Fonts の woff2 スライスを一度に数百個取りにいく。和文は 1 ウェイトに
// つき約124スライスあるため、本文（Noto Sans JP 3ウェイト）＋見出し（Zen Old Mincho）で
// 500 を超える。この同時接続数に回線が耐えられないと大量に ETIMEDOUT し、
// **フォントが丸ごとフォールバックに落ちたままビルドが成功してしまう**（気づきにくい）。
// node-fetch は agent 未指定時に https.globalAgent を使うため、ここで上限を絞る。
https.globalAgent.maxSockets = 24;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
