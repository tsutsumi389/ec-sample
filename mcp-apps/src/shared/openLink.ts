/**
 * 商品ページをホスト側で開く操作。
 *
 * **ボタンの disabled をここで触らないこと。** disabled は状態（loading / opening）
 * からの派生値であり、ここに DOM 操作を足すと同じ判断が「状態」と「命令」の二重に
 * なって必ず片方が古くなる。
 *
 * 失敗の文言は2つとも View 非依存なのでここが持つ。**表示の仕方は持たない**——
 * 全面エラーとバナーの二層の振り分けは View 側（reducer の failure）の判断。
 * 返すのは文言だけで、成功なら null。
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
