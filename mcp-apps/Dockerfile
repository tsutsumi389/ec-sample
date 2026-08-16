FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# **`npm install` ではなく `npm ci`。** ロックファイルを COPY している以上、依存の解決を
# もう一度やり直す理由が無い（そのぶん速い）だけでなく、`npm install` は解決結果が
# 変われば **イメージの中の** package-lock.json を書き換えてしまうため、
# 「イメージとリポジトリで入っている版が違う」状態が黙って作れてしまう。
# `mcp==2.0.0` や `@modelcontextprotocol/ext-apps` を厳密固定してあるのと同じ規律。
RUN npm ci

COPY . .

# ビルド成果物は /app の外（/backend/app/mcp_server/ui/dist）へ出る。compose が
# ./backend/app/mcp_server/ui を /backend/app/mcp_server/ui にマウントしてあるため、
# vite.config.ts の相対パス（../backend/...）がホストで叩いたときと同じ場所に解決される。
# マウントを外すとコンテナ内の書き込み先が消え、backend は古い dist を読み続ける。
CMD ["npm", "run", "dev"]
