/**
 * 認証まわり（ログイン・会員登録・アカウント）のフォームの造形。
 *
 * lib/buttonStyles.ts（btn）・lib/gridStyles.ts と同じ流儀で、クラス列を lib に置く。
 * 以前は同じ文字列が3ファイルにバイト単位で写されていて、「揃っていること」を
 * account/page.tsx のコメント（「ログイン／会員登録と同一の造形に揃える」）と
 * 人間の目視だけが保証していた。罫の色トークンやフォーカスリングを変えたときに
 * 1つ落とすと、フォーム間で罫の濃度が割れる。
 *
 * ⚠ ここに集めるのは**この3画面が共有する造形**だけ。
 *   カート（app/cart/page.tsx）は disabled 状態と角丸違いを持ち、AddressForm は
 *   エラー時の罫と accent 色を持つ。造形が違うものを引数で1本にまとめると、
 *   分岐が増えるばかりで源が1つにならない。
 *
 * placeholder の色はここで指定しない。globals.css の input::placeholder 既定
 * （ink-muted＝AA 合格）に落とすため、placeholder:text-* を書かないこと。
 */

/** 入力欄（罫は line-input、高さ 44px）。 */
export const inputClass =
  'h-11 w-full rounded-md border border-line-input bg-surface px-3.5 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:border-brand-600';

/** 入力ラベル。 */
export const labelClass = 'mb-1.5 block text-caption font-medium text-ink-soft';
