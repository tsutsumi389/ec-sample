import type { Product } from '@/lib/types';
import Price, { type PriceSize, type PriceTone } from '@/components/Price';
import Badge from '@/components/Badge';

interface ProductPriceProps {
  product: Product;
  /** 実売価格の表示サイズ（商品カード=lg、詳細=3xl 等）。 */
  size?: PriceSize;
  /** セール時に割引率バッジ（NN%OFF）を出すか。詳細ページなど強調したい場所で true。 */
  showBadge?: boolean;
  /** 深緑帯（bg-invert）の上に置くときは 'onDark'。 */
  tone?: PriceTone;
  /**
   * 狭い器（商品カード）用。sm 未満では打ち消しの定価を伏せる。
   * 390 の2列グリッドではカード内寸が 137px しかなく、実売価格＋定価＋評価が1行に入らない。
   * 折り返すとセール品だけ本文が1行ぶん高くなり、同じ行の隣のカードに空白が転嫁される
   * （実測 45.7px）。割引そのものは図版の「NN%OFF」の札が伝えるので、
   * 狭い幅で伏せるのは定価のほうにする。
   */
  compact?: boolean;
  className?: string;
}

/** セール中なら割引率（正の整数％）、そうでなければ 0。表示ロジックを1箇所に閉じる。 */
export function discountPercent(product: Product): number {
  const onSale = product.sale_price != null && product.sale_price < product.price;
  if (!onSale) return 0;
  return Math.round((1 - product.effective_price / product.price) * 100);
}

/**
 * 「NN%OFF」バッジ単体。ProductPrice の showBadge は価格と同じ行に置くが、
 * 商品カードでは図版の上の「1つだけの札」の席（状態・在庫と排他）に置く。
 * 本文側に置くと、セール品だけ本文が1行ぶん高くなり、同じ行の他のカードに
 * 引き伸ばされた空白ができる。
 */
export function DiscountBadge({
  product,
  elevated = false,
  className = '',
}: {
  product: Product;
  elevated?: boolean;
  className?: string;
}) {
  const percentOff = discountPercent(product);
  if (percentOff <= 0) return null;
  return (
    <Badge variant="accent" elevated={elevated} className={`tnum ${className}`}>
      {percentOff}%OFF
    </Badge>
  );
}

/**
 * 商品価格の表示。セール中（sale_price < price）は実売価格を主表示し、
 * 定価を打ち消し線で併記する。配色規律に従い価格自体は text-ink のまま、
 * 割引の強調は打ち消し線と accent（柿渋）バッジで行う（赤字は使わない）。
 */
export default function ProductPrice({
  product,
  size = 'base',
  showBadge = false,
  tone = 'default',
  compact = false,
  className = '',
}: ProductPriceProps) {
  const onSale = product.sale_price != null && product.sale_price < product.price;

  if (!onSale) {
    return <Price value={product.effective_price} size={size} tone={tone} as="p" className={className} />;
  }

  return (
    // 実売価格と定価は必ず同じ行に置く（折り返すと ¥ の基準線がカードごとに上下する）。
    // 収まらないときだけ定価を次行へ逃がすため flex-wrap は残すが、
    // 行数が変わりやすい %OFF バッジは showBadge のときだけ末尾に付ける。
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${className}`}>
      <Price value={product.effective_price} size={size} tone={tone} as="p" />
      {/* 定価。打ち消し線は本文色より淡い罫色にして、数字そのものは AA を保つ。
          ¥ の組版（数字より一段小さく・淡く）を実売価格と揃えるため Price を通す。 */}
      <Price
        value={product.price}
        size="sm"
        tone={tone}
        muted
        className={`line-through ${compact ? 'max-sm:hidden ' : ''}${
          tone === 'onDark' ? 'decoration-brand-400' : 'decoration-line-strong'
        }`}
      />
      {showBadge && <DiscountBadge product={product} />}
    </div>
  );
}
