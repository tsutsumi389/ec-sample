import Badge from '@/components/Badge';

interface StockLabelProps {
  /** 在庫数 */
  stock: number;
  /** 図版の上に重ねるとき true（Badge の縁＋影だけを足す。色は変えない）。 */
  elevated?: boolean;
  className?: string;
}

/**
 * 在庫数の表示ルールを統一する共通コンポーネント。
 * - 在庫 0: neutral バッジ「在庫切れ」
 * - 在庫 5 点以下: accent（柿渋）バッジ「残り N点」＝購入を急ぐ理由がある状態だけ色を使う
 * - それ以外: テキスト「在庫 N点」（補助情報なので caption + ink-muted）
 *
 * ⚠ 助数詞はサイト全体で **「点」** に統一する（カートの「全 N 点」「小計（N点）」、
 *   注文詳細の「全 N 点」、商品詳細の奥付「在庫 N 点」と同じ数え方）。
 *   ここだけ「個」だった頃は、商品詳細の1画面に「在庫: 44個」と「在庫 44 点」が同時に出ていた。
 */
export default function StockLabel({ stock, elevated = false, className = '' }: StockLabelProps) {
  if (stock <= 0) {
    return (
      <Badge variant="neutral" elevated={elevated} className={className}>
        在庫切れ
      </Badge>
    );
  }
  if (stock <= 5) {
    return (
      <Badge variant="accent" elevated={elevated} className={className}>
        残り <span className="tnum">{stock}</span>点
      </Badge>
    );
  }
  return (
    <span className={`text-caption text-ink-muted ${className}`}>
      在庫 <span className="tnum">{stock}</span> 点
    </span>
  );
}
