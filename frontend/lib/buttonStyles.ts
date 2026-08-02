/**
 * ボタンの見た目を統一するための共通クラス文字列。
 * 使い方: <button className={btn('primary', 'lg')}>購入する</button>
 * 幅などを足す場合は `${btn('primary', 'lg')} w-full` のように連結する。
 *
 * 規律:
 * - brand 塗り（primary）は各ページの最重要 CTA のみに使うこと。
 * - onDark は深緑帯（bg-invert）の上に置くボタン専用。
 * - サイズは md（44px）が既定。sm は .hit で実効44pxを確保する。
 */

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'onDark' | 'danger' | 'field';
export type BtnSize = 'sm' | 'md' | 'lg';

/**
 * 無効のときに全てのボタンが捨てるもの。
 * 影は「押せる＝浮いている」の合図なので必ず落とし、hover/active は当たり判定ごと切る。
 * 不透明度は使わない（下の DISABLED_FACE のコメントを参照）。
 */
const DISABLED_BASE = 'disabled:shadow-none disabled:pointer-events-none';

/**
 * 無効の「面」（文字を持つボタン用）。
 *
 * 以前は disabled:opacity-50 だけで、押せないことを不透明度に丸投げしていた。
 * 半透明は前景と背景を同じだけ地色へ寄せるので、文字と面の差そのものが縮む
 * （実測: ページ送りの無効「前へ」= 2.87:1）。無効は色を薄めるのではなく
 * **沈んだ面（sunken）＋ ink-muted（対 sunken 4.72:1 = AA）** という別の面で表す。
 * ・border-line … 罫も1段淡い方（line）へ。罫を持たない variant では無害。
 */
const DISABLED_FACE = 'disabled:bg-sunken disabled:text-ink-muted disabled:border-line';

/**
 * 無効のアイコンボタン（iconBtn）。
 *
 * こちらは面を**塗らない**。地を持たない小さな丸に沈んだ面を敷くと、無効なほうが
 * 有効なボタンより目立つ（実測: 商品詳細の数量「−」が数量 1 のとき、隣の「＋」より
 * 強い塊に見えていた）。線画1本の記号なので、弱め方は線の濃度でよい。
 * ink-faint は「読ませる文字には使わない」トークンだが、ここは記号かつ
 * 操作できない状態なので当てはまらない（対 surface 3.84:1）。
 */
const DISABLED_ICON = 'disabled:bg-transparent disabled:text-ink-faint';

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap ' +
  'transition-[background-color,box-shadow,transform,color] duration-fast ease-standard ' +
  'active:scale-[0.98] motion-reduce:active:scale-100 ' +
  `${DISABLED_BASE} ` +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2';

const SIZES: Record<BtnSize, string> = {
  sm: 'hit h-9 px-4 text-caption rounded-md',   // .hit で実効44px
  md: 'h-11 px-5 text-body rounded-md',         // 44px（既定）
  lg: 'h-13 px-8 text-body-lg rounded-lg',      // 52px
};

const VARIANTS: Record<BtnVariant, string> = {
  primary:   'bg-brand-600 text-white hover:bg-brand-700 shadow-paper hover:shadow-lift',
  secondary: 'bg-surface text-ink-soft border border-line-strong hover:bg-sunken',
  ghost:     'bg-transparent text-ink-soft hover:bg-sunken',
  onDark:    'bg-washi-50 text-brand-700 hover:bg-white shadow-paper', // 深緑帯の上
  // 破壊的操作（削除・キャンセルの確定）専用。弁柄。primary と同じ寸法で並べられる。
  danger:    'bg-critical-600 text-white hover:bg-critical-700 shadow-paper hover:shadow-lift',
  // 入力欄と**同じ行**に並ぶ二次ボタン（絞り込みの「適用」・クーポンの「適用する」）専用。
  // secondary の罫は line-strong（対 surface 1.76:1）で、隣の input の line-input（3.65:1）より
  // 2段淡く、押せるボタンだけが無効化されて見えていた。同じ行の罫の濃度を1つに揃えるための面。
  field:     'bg-surface text-ink-soft border border-line-input hover:bg-sunken',
};

export function btn(variant: BtnVariant = 'primary', size: BtnSize = 'md') {
  return `${BASE} ${DISABLED_FACE} ${SIZES[size]} ${VARIANTS[variant]}`;
}

export function iconBtn(size: BtnSize = 'md') {
  const box = { sm: 'hit h-9 w-9', md: 'h-11 w-11', lg: 'h-13 w-13' }[size];
  return `${BASE} ${DISABLED_ICON} ${box} rounded-full text-ink-soft hover:bg-sunken`;
}

/**
 * 丸ピル。アシスタントのサジェスト chip・カテゴリ chip・行き止まりの次の一手と、
 * 提案カードの操作行（「商品を見る」「カートに追加」）を同じ造形で揃える
 * （同じ「次の一手」なのに見えが割れると、押せる部品と分からない）。
 *
 * btn() とは別系統。あちらは rounded-md の角丸と固定高（h-9/h-11/h-13）の体系で、
 * ピルの丸みと「モバイル44px / デスクトップは詰める」の寸法をここへ持ち込むと
 * 呼び出し側が6つも上書きすることになる。造形が違うものは別の関数で持つ。
 *
 * outline の罫は brand-500（対 surface 4.37:1 / 対 page 3.61:1）。brand-200 は
 * 対 surface 1.48:1 で地との差が 1.21 しかなく、押せる部品の輪郭として成立しない
 * （WCAG 1.4.11 は 3:1 が下限）。この根拠をここ1箇所に置くために切り出してある——
 * 以前は同じ12トークンが AssistantPanel と AssistantProductCard に写されており、
 * 濃度を見直すときに揃って直る保証が無かった。
 *
 * size … chip: 語幅ぶんだけ取る小さな粒（wrap して並ぶ） / action: 操作行に flex-1 で並ぶ粒。
 * tone … outline: 生成りの面＋brand の罫 / solid: brand 塗り（行の中で1つだけ）。
 */
export function chip(size: 'chip' | 'action' = 'chip', tone: 'outline' | 'solid' = 'outline') {
  const box =
    size === 'chip'
      ? 'min-h-[44px] shrink-0 px-3.5 py-1.5 text-caption sm:min-h-0'
      : 'min-h-[44px] gap-1 px-3 text-body font-medium sm:min-h-0 sm:py-2';
  const face =
    tone === 'outline'
      ? 'border border-brand-500 bg-surface text-brand-700 hover:bg-brand-50'
      : 'bg-brand-600 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line-strong';
  return (
    'inline-flex items-center justify-center whitespace-nowrap rounded-full ' +
    'transition-colors duration-fast ease-standard ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ' +
    `${face} ${box}`
  );
}

/* ── 後方互換（既存の25箇所超の呼び出しを壊さない） ── */
/** 最重要CTA用: brand 塗り */
export const btnPrimary   = btn('primary', 'md');
/** 二次アクション用: 生成り背景 + ボーダー */
export const btnSecondary = btn('secondary', 'md');
/** アイコン単体ボタン用: 正方形・円形・hover で薄い背景 */
export const iconButton   = iconBtn('md');   // 40px → 44px に引き上げ
