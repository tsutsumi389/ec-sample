/**
 * ボタンの見た目を統一するための共通クラス文字列。
 * 使い方: <button className={btnPrimary}>購入する</button>
 * 幅やアイコン間隔など追加が必要な場合は `${btnPrimary} w-full inline-flex ...` のように連結する。
 *
 * 規律: brand 塗り（btnPrimary）は各ページの最重要 CTA のみに使うこと。
 */

/** 最重要CTA用: brand 塗り */
export const btnPrimary =
  'bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';

/** 二次アクション用: 白背景 + ボーダー */
export const btnSecondary =
  'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';

/** 三次アクション用: 背景・ボーダーなし（hover で薄い背景） */
export const btnGhost =
  'bg-transparent hover:bg-gray-100 text-gray-700 px-4 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';

/** アイコン単体ボタン用: 正方形・角丸・hover で薄い背景 */
export const iconButton =
  'inline-flex items-center justify-center h-10 w-10 rounded-md text-gray-700 hover:bg-gray-100 transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
