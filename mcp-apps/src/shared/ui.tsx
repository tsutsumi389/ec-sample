/**
 * 両 View が同じ形で持っていた表示部品。
 *
 * ここに置いてよいのは「渡された値をそのまま描くだけ」の部品に限る。
 * **在庫・販売状態・価格から文言や表示可否を判断する部品を足さないこと**——
 * それは backend（services/cart.py / views.py）が唯一の源であり、View は
 * 受け取った完成文を出すだけ、という規律は shared/format.ts と同じ。
 *
 * **未信頼テキストの置き場所は JSX の子要素だけ。** 商品名・カテゴリ・説明・仕様・
 * エラー文はすべて `{value}` として埋め、React に自動エスケープさせる。
 * dangerouslySetInnerHTML はこのプロジェクトのどこにも書かないこと（移植前に
 * innerHTML を1つも使わなかったのと同じ規律で、抜け道を1つも作らないことが本体）。
 */

import type { ReactElement } from "react";

/**
 * 画像の器。URL があれば <img>、無ければ「画像なし」のプレースホルダ。
 *
 * **url に入れてよいのは _meta.ui 側の絶対URLだけ。** structuredContent の image_url は
 * 相対パスで、iframe には解決できるオリジンが無いので使えない（search の ProductBrief に
 * そもそも画像が無いのも views.py の「画像は詳細ツールだけ」規律による）。
 *
 * alt を空にしてあるのは意図的で、商品名は必ずこの器の外に別途テキストで出るため。
 * **商品名を alt に入れる「改善」をしないこと**——未信頼テキストの置き場所が増える。
 *
 * className を引数で受けるのは、search の .card-image と product の .panel-image が
 * 宣言は同一（theme.css がセレクタを並べて共有）でも、クラス名は各 View の markup と
 * 一対一で対応させたいため。
 */
export function ProductImage({
  url,
  className,
}: {
  url: string | null;
  className: string;
}): ReactElement {
  return (
    <div className={className}>
      {url !== null ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span className="placeholder">画像なし</span>
      )}
    </div>
  );
}

/**
 * 再検索・再取得・リンク開放の失敗を出すバナー。
 *
 * **全面エラー（InitialError）とは触る領域が重ならない。** こちらは今出ている
 * グリッド／パネルを残したまま上に重ねるだけ、あちらは表示を消して再試行だけを残す。
 * 片方がもう片方の領域を触り始めると、この二層の意味が崩れる（「バナーを閉じたら
 * 全面エラーまで消えた」のような組み合わせが生まれる）。
 *
 * message が null なら何も描かない。**hidden 属性で伏せる形に戻さないこと**——
 * 消えている間も文字列を DOM に残すことになり、「閉じたのに次の商品で前の文言が
 * 一瞬出る」経路を自分で作ることになる。
 */
export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}): ReactElement | null {
  if (message === null) return null;
  return (
    <div className="banner-error" role="alert">
      <span>{message}</span>
      <button type="button" className="text-btn" onClick={onDismiss}>
        閉じる
      </button>
    </div>
  );
}

/**
 * 一度も結果を描けていないときの全面エラー。両 View で markup が一字一句同じだった。
 *
 * 再試行ボタンの disabled は「今読み込み中か」から導く。**押せない状態を
 * 命令で作らないこと**——移植前は setLoading() と resetControlsToConfirmed() の
 * 2か所がこのボタンの disabled を書き換えており、片方だけ通る経路が生まれていた。
 */
export function InitialError({
  message,
  loading,
  onRetry,
}: {
  message: string;
  loading: boolean;
  onRetry: () => void;
}): ReactElement {
  return (
    <div className="state-message state-message--error" role="alert">
      <p>{message}</p>
      <button type="button" className="retry-btn" disabled={loading} onClick={onRetry}>
        再試行
      </button>
    </div>
  );
}
