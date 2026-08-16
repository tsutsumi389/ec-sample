/**
 * 商品ページをホスト側で開く操作。両 View が同じ本体・同じ文言・同じ再有効化の規律を
 * 持っていたので括った。
 */

import type { App } from "@modelcontextprotocol/ext-apps";

/**
 * ボタンを押して商品ページを開く。押している間はそのボタンだけを無効にする。
 *
 * **finally で `disabled = false` を固定にしないこと。** リンクを開いている間に
 * 別の再検索・再取得が始まっていた場合、無条件に有効化するとこのボタンだけが通信中に
 * 押せる状態になる。だから「今読み込み中か」を呼び出し側から関数で受け取り、
 * その値へ戻す。
 *
 * 失敗の文言は2つとも View 非依存なのでここが持つ。表示の仕方（バナー）は
 * View 側から onError で渡す——全面エラーとバナーの二層の振り分けは View の
 * showFailure が持つ判断であり、ここには持ち込まない。
 */
export async function openPageInHost(params: {
  app: App;
  url: string;
  button: HTMLButtonElement;
  isLoading: () => boolean;
  onError: (message: string) => void;
}): Promise<void> {
  const { app, url, button, isLoading, onError } = params;
  button.disabled = true;
  try {
    const { isError } = await app.openLink({ url });
    if (isError) {
      onError("商品ページを開けませんでした。");
    }
  } catch {
    onError("商品ページを開く操作に失敗しました。");
  } finally {
    button.disabled = isLoading();
  }
}
