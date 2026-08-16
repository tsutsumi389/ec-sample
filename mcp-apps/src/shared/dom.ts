/**
 * DOM の組み立てのうち、両 View が同じ形で持っていたもの。
 *
 * ここに置いてよいのは「渡された値をそのまま要素へ載せる」処理に限る。
 * **在庫・販売状態・価格から文言や表示可否を判断する関数を足さないこと**——
 * それは backend（services/cart.py / views.py）が唯一の源であり、View は
 * 受け取った完成文を出すだけ、という規律は shared/format.ts と同じ。
 */

/**
 * エントリ HTML の id を引く。見つからなければ即座に落とす。
 *
 * **キャストをこの1か所に閉じるための関数。** getElementById は HTMLElement までしか
 * 教えてくれないので、value / disabled を触るには具体的な型へ絞る必要がある。
 * id が無ければここで落ちる——「なぜか一部だけ描画されない」形で気づけないより、
 * エントリ HTML と食い違った瞬間に止まるほうがよい。
 *
 * 要素の種類の食い違い（<select> のつもりが別の要素だった等）までは実行時に検査して
 * いないが、エントリ HTML と View の TypeScript は同じビルドで一緒に組まれる一組なので、
 * ここがずれるのは書き間違いの直後にしか起こらない。
 *
 * @param file エラー文に出すエントリ HTML のファイル名（"search.html" 等）。
 *   どちらの View で食い違ったかが1行で分かるようにするためだけの引数。
 */
export function requireEl<T extends HTMLElement = HTMLElement>(id: string, file: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`#${id} が ${file} にありません。HTML 側の id と食い違っています。`);
  }
  return found as T;
}

/**
 * 「値があれば出す・無ければ hidden にする」要素の更新。
 *
 * 隠すときに textContent も空へ戻すのは、次に別の商品を描いたときに古い文字列が
 * 一瞬でも残らないようにするため。**片方だけやらないこと**（hidden にしただけの
 * 要素は、CSS を1つ間違えた瞬間に前の商品の値を出す）。
 */
export function setOptionalText(el: HTMLElement, text: string | null | undefined): void {
  el.textContent = text ?? "";
  el.hidden = !text;
}

/**
 * 画像の器を作り直す。URL があれば <img>、無ければ「画像なし」のプレースホルダ。
 *
 * **url に入れてよいのは _meta.ui 側の絶対URLだけ。** structuredContent の image_url は
 * 相対パスで、iframe には解決できるオリジンが無いので使えない（search の ProductBrief に
 * そもそも画像が無いのも views.py の「画像は詳細ツールだけ」規律による）。
 *
 * alt を空にしてあるのは意図的で、商品名は必ずこの器の外に別途テキストで出るため。
 * **商品名を alt に入れる「改善」をしないこと**——未信頼テキストの置き場所が増える。
 */
export function fillImage(container: HTMLElement, url: string | null): void {
  container.textContent = ""; // innerHTML は使わず子要素を作り直す
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.loading = "lazy";
    container.appendChild(img);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "placeholder";
    placeholder.textContent = "画像なし";
    container.appendChild(placeholder);
  }
}

/** createBanner が返す操作。 */
export interface Banner {
  show(message: string): void;
  hide(): void;
}

/**
 * 再検索・再取得・リンク開放の失敗を出すバナー。
 *
 * **全面エラー（state-message--error）とは触る領域が重ならない。** こちらは今出ている
 * グリッド／パネルを残したまま上に重ねるだけ、あちらは表示を消して再試行だけを残す。
 * 片方がもう片方の領域を触り始めると、この二層の意味が崩れる（「バナーを閉じたら
 * 全面エラーまで消えた」のような組み合わせが生まれる）。
 */
export function createBanner(banner: HTMLElement, text: HTMLElement): Banner {
  return {
    show(message: string): void {
      text.textContent = message;
      banner.hidden = false;
    },
    hide(): void {
      banner.hidden = true;
      text.textContent = "";
    },
  };
}
