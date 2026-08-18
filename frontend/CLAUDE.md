# CLAUDE.md — `frontend/`

Next.js 側の固有規律。ここは `frontend/` 配下を触るときにだけ読み込まれる。

商品の可視性・実売価格・ゲストカート・ログイン後の戻り先・計測（`ProductCard` の器1つ／ファネルの段）など **バックエンドと共有するドメイン規律はリポジトリ直下の `CLAUDE.md`** にあるので、そちらも必ず読むこと。

- **アシスタントの開閉は `lib/assistant-context.tsx` を通す**: 開閉状態・prefill・フォーカスの戻し先は provider が持ち、`AssistantWidget` はパネルの描画と背景の `inert` だけを受け持つ。ウィジェット内部の `useState` に戻すと、行き止まりの画面（検索0件など）から `openAssistant()` で相談へ送れなくなる。ページから開くときは `returnFocusTo` に自分のボタンの ref を必ず渡すこと（渡さないと閉じたときフォーカスが画面の反対側の FAB へ飛ぶ）。**閉じた後のフォーカス復帰は effect で当てる**——FAB は開いている間 `display:none` で、`requestAnimationFrame` では再描画のコミット前に走って無言で外れる。`prefill` は入力欄に入れるだけで**自動送信しない**（サジェスト chip と同じ規律。予算や用途を書き足してから送れる状態にしておく）。
- **Webフォントは自己ホスト。`next/font/google` は使わない**: 和文は1ウェイトあたり約124個の unicode-range スライスに分割配信され、3書体で500個超になる。frontend コンテナには IPv6 経路が無いため一斉ダウンロードが大量に失敗し、**しかも next/font は失敗してもビルドを通して黙ってフォールバックに落ちる**（見出しが明朝でないことに気づけない）。`make fonts`（= `node frontend/scripts/fetch-fonts.mjs`）でホスト側から1回だけ取得し、`frontend/public/fonts/` と `frontend/app/fonts.css` を生成する。両者は `.gitignore` 済みで、`make up` / `make up-d` が未取得時のみ自動実行する。
- **明朝は 700 のみ・900 を指定しない**: Zen Old Mincho は 700 だけ収録している。持たないウェイトを指定するとブラウザが合成ボールドで太らせ、明朝の線が潰れる。`text-display` も 700 で組む。
- **明朝に `palt` は効かない**: 配信中の Zen Old Mincho サブセットに GSUB/GPOS が無く、`palt`/`pkna`/`kern` はすべて無効（実測済み）。カタカナのアキは `lib/wordBreak.ts` の `withWordBreaks()` が付ける `.kana` と `--kana-track` で詰める。
- **可変長の和文は `withWordBreaks()` を通す**: `word-break: auto-phrase` は Chromium で効かないため、`Intl.Segmenter` で語境界に `<wbr>` を挿すのが唯一の頼り。商品名・カテゴリ名・見出しに素の文字列を直接描画しないこと（語中改行が出る）。
