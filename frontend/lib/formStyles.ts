/**
 * 認証まわり（ログイン・会員登録・アカウント）のフォームの造形。
 * 罫の色トークンやフォーカスリングを変えたときに1つ落とすと、フォーム間で罫の濃度が割れる。
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

export const labelClass = 'mb-1.5 block text-caption font-medium text-ink-soft';

/*
 * 管理画面は店頭とは別系統（gray-* / text-sm）で組む。これは意図的な使い分けなので
 * 上の2つに寄せない。ただし**管理画面の中では**1組であるべき。
 */

export const adminLabelClass = 'block text-sm font-medium text-gray-700 mb-2';

/** 管理画面の入力欄・セレクト。 */
export const adminInputClass = 'w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm';

/** 管理画面のラベル脇の補足（「（任意）」「（後から変更しない）」など）。 */
export const adminHintClass = 'ml-1 text-xs font-normal text-gray-600';
