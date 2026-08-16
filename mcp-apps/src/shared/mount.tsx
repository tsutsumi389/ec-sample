/**
 * React ルートの取り付け。両 View の main.tsx が最後に1回だけ呼ぶ。
 *
 * **StrictMode で包まないこと。** StrictMode は開発ビルドで effect を2回
 * （マウント → 破棄 → 再マウント）走らせる。View の effect は `new App(...)` と
 * `connect()` を持っているので、包んだ瞬間にホストとの接続が二重に張られ、
 * toolinput / toolresult のような**一度きりの通知**をどちらのインスタンスが
 * 受けるかが不定になる。ここは開発用のサーバも HMR も無い（ビルドした単一ファイル
 * HTML を iframe が読むだけ）ので、StrictMode で得られるものが最初から無い。
 */

import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

/**
 * エントリ HTML の `#root` に描画する。見つからなければ即座に落とす。
 *
 * **見つからないときに黙って何もしないことだけは避ける。**「なぜか画面が白いまま」で
 * 気づけないより、エントリ HTML と食い違った瞬間に止まるほうがよい。
 *
 * @param file エラー文に出すエントリ HTML のファイル名（"search.html" 等）。
 *   どちらの View で食い違ったかが1行で分かるようにするためだけの引数。
 */
export function mountView(node: ReactNode, file: string): void {
  const container = document.getElementById("root");
  if (container === null) {
    throw new Error(`#root が ${file} にありません。HTML 側の id と食い違っています。`);
  }
  createRoot(container).render(node);
}
