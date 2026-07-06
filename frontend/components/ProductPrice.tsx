import type { Product } from '@/lib/types';
import Price from '@/components/Price';
import Badge from '@/components/Badge';

type PriceSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';

interface ProductPriceProps {
  product: Product;
  /** 実売価格の表示サイズ（商品カード=lg、詳細=3xl 等）。 */
  size?: PriceSize;
  /** セール時に割引率バッジ（NN%OFF）を出すか。詳細ページなど強調したい場所で true。 */
  showBadge?: boolean;
  className?: string;
}

/**
 * 商品価格の表示。セール中（sale_price < price）は実売価格を主表示し、
 * 定価を打ち消し線で併記する。配色規律に従い価格自体は text-gray-900 のまま、
 * 割引の強調は打ち消し線とバッジで行う（赤字は使わない）。
 */
export default function ProductPrice({
  product,
  size = 'base',
  showBadge = false,
  className = '',
}: ProductPriceProps) {
  const onSale = product.sale_price != null && product.sale_price < product.price;

  if (!onSale) {
    return <Price value={product.effective_price} size={size} as="p" className={className} />;
  }

  const percentOff = Math.round((1 - product.effective_price / product.price) * 100);

  return (
    <div className={`flex items-baseline gap-2 flex-wrap ${className}`}>
      <Price value={product.effective_price} size={size} as="p" />
      <span className="text-sm text-gray-400 line-through">¥{product.price.toLocaleString()}</span>
      {showBadge && percentOff > 0 && <Badge variant="warning">{percentOff}%OFF</Badge>}
    </div>
  );
}
