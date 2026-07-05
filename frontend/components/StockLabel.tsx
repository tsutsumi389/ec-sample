import Badge from '@/components/Badge';

interface StockLabelProps {
  /** 在庫数 */
  stock: number;
  className?: string;
}

/**
 * 在庫数の表示ルールを統一する共通コンポーネント。
 * - 在庫 0: neutral バッジ「在庫切れ」
 * - 在庫 5 個以下: warning バッジ「残り N個」
 * - それ以外: テキスト「在庫: N個」（text-sm text-gray-500）
 */
export default function StockLabel({ stock, className = '' }: StockLabelProps) {
  if (stock <= 0) {
    return (
      <Badge variant="neutral" className={className}>
        在庫切れ
      </Badge>
    );
  }
  if (stock <= 5) {
    return (
      <Badge variant="warning" className={className}>
        残り {stock}個
      </Badge>
    );
  }
  return <span className={`text-sm text-gray-500 ${className}`}>在庫: {stock}個</span>;
}
