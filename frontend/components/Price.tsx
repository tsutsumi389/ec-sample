export type PriceSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | 'num-lg' | 'feature';

/**
 * 号数は **自前の fontSize トークンだけ**で組む（tailwind 既定の text-sm/lg/3xl … は使わない）。
 * 価格だけ素の目盛りに逃げていると、本文・見出しと行送りの基準が揃わず、
 * カードの中で価格行だけ別の版面規則で組まれているように見えるため。
 *
 * 段は3つしかない:
 *   caption(13px) … 明細の単価・打ち消しの定価
 *   body(15px)    … 明細・レコメンドの本文級
 *   h3(18px)      … 商品カード・関連商品・購入バーの主価格
 *   num-lg        … 「金額そのものが主役」の場所（PDP の実売価格・合計・表紙）clamp 24→32px
 */
const SIZE_CLASSES: Record<PriceSize, string> = {
  sm: 'text-caption',
  base: 'text-body',
  lg: 'text-h3',
  // 旧 text-xl。h3 の段に畳んだ（18px と 20px の差は価格の階層として意味を持たない）。
  xl: 'text-h3',
  '2xl': 'text-num-lg',
  '3xl': 'text-num-lg',
  // 表紙・合計金額など「金額そのものが主役」の場所用（clamp 24→32px）
  'num-lg': 'text-num-lg',
  // 新着グリッドの大判カード専用。lg 未満ではセル幅が通常カードと同じになるため、
  // 通常カードと同じ h3 に落とす（大きいままだと 169px 幅で定価が折り返し、
  // その1枚だけ本文が高くなって隣のカードに空白ができる）。
  feature: 'text-h3 lg:text-num-lg',
};

export type PriceTone = 'default' | 'onDark';

interface PriceProps {
  /** 表示する金額（円）。¥ と桁区切りはこのコンポーネントが付与する。 */
  value: number;
  /** ページ内での見た目のサイズ（商品カード=lg、商品詳細=3xl 等）。 */
  size?: PriceSize;
  /** 合計金額など、通常価格より強調したい場合に true にする。色・太さの強調ルールを統一するためのフラグ。 */
  strong?: boolean;
  /**
   * 打ち消しの定価など「主でない金額」。文字色を一段落とし、太さも通常に戻す。
   * これを使わずに span で直書きすると通貨記号だけ素の全角で入り、
   * 取り消し線の側が記号だけ重く見える（組版規則が1行の中で2つに割れる）。
   */
  muted?: boolean;
  /** 深緑帯（bg-invert）の上に置くときは 'onDark'。className での色上書きは効かないためこちらを使う。 */
  tone?: PriceTone;
  className?: string;
  as?: 'span' | 'p';
}

const TONE_CLASSES: Record<PriceTone, { text: string; symbol: string; muted: string }> = {
  default: { text: 'text-ink', symbol: 'text-ink-muted', muted: 'text-ink-muted' },
  onDark: { text: 'text-on-dark', symbol: 'text-on-dark-muted', muted: 'text-on-dark-muted' },
};

/**
 * 金額表示を統一するための共通コンポーネント。
 * 色・太さの体系: 価格・金額は text-ink で統一（brand 塗りは CTA 専用のため）。
 * 通常価格は font-semibold、合計金額（strong）は font-bold。サイズは呼び出し側の文脈に応じて変える。
 *
 * 組版の体系:
 * - `.tnum`（font-num + tabular-nums）を必ず効かせる。カードや明細で価格が縦に並んだとき、
 *   桁位置が揃って「表」に見えるかどうかがこのコンポーネントの主目的。
 * - 通貨記号は数字より一段小さく・淡くして、数字そのものを主役にする。
 *   **打ち消しの定価もここを通すこと**（直書きすると ¥ だけ素の全角で入る）。
 */
export default function Price({
  value,
  size = 'base',
  strong = false,
  muted = false,
  tone = 'default',
  className = '',
  as: Tag = 'span',
}: PriceProps) {
  const weightClass = muted ? 'font-normal' : strong ? 'font-bold' : 'font-semibold';
  const toneClasses = TONE_CLASSES[tone];
  const textClass = muted ? toneClasses.muted : toneClasses.text;

  return (
    <Tag className={`tnum ${textClass} ${weightClass} ${SIZE_CLASSES[size]} ${className}`}>
      <span
        className={`mr-[0.1em] align-baseline text-[0.68em] font-medium ${
          muted ? textClass : toneClasses.symbol
        }`}
      >
        ¥
      </span>
      {value.toLocaleString()}
    </Tag>
  );
}
