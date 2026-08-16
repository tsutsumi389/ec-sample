/**
 * 商品ページをホスト側で開く操作。両 View が同じ本体・同じ文言を持っていたので括った。
 *
 * **ボタンの disabled をここで触らないこと。** 移植前（DOM を直に組んでいた頃）は
 * HTMLButtonElement を受け取り、finally で `button.disabled = isLoading()` と
 * 「今読み込み中か」の値へ戻していた——無条件に有効化すると、リンクを開いている間に
 * 別の再検索・再取得が始まっていた場合に、このボタンだけが通信中に押せる状態に
 * なるためだった。React では disabled が状態（loading / opening）からの派生値に
 * なり、その配慮は呼び出し側の描画式が構造的に満たす。ここに DOM 操作を戻すと、
 * 同じ判断が「状態」と「命令」の二重になり、必ず片方が古くなる。
 *
 * 失敗の文言は2つとも View 非依存なのでここが持つ。**表示の仕方は持たない**——
 * 全面エラーとバナーの二層の振り分けは View 側（reducer の failure）の判断であり、
 * ここには持ち込まない。返すのは文言だけで、成功なら null。
 */

import type { App } from "@modelcontextprotocol/ext-apps/react";

export async function openPageInHost(app: App, url: string): Promise<string | null> {
  try {
    const { isError } = await app.openLink({ url });
    return isError ? "商品ページを開けませんでした。" : null;
  } catch {
    return "商品ページを開く操作に失敗しました。";
  }
}
