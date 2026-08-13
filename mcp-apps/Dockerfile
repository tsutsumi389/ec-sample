FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ビルド成果物は /app の外（/backend/app/mcp_server/ui/dist）へ出る。compose が
# ./backend/app/mcp_server/ui を /backend/app/mcp_server/ui にマウントしてあるため、
# vite.config.ts の相対パス（../backend/...）がホストで叩いたときと同じ場所に解決される。
# マウントを外すとコンテナ内の書き込み先が消え、backend は古い dist を読み続ける。
CMD ["npm", "run", "dev"]
