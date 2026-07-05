type PriceSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';

const SIZE_CLASSES: Record<PriceSize, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
};

interface PriceProps {
  /** 表示する金額（円）。¥ と桁区切りはこのコンポーネントが付与する。 */
  value: number;
  /** ページ内での見た目のサイズ（商品カード=lg、商品詳細=3xl 等）。 */
  size?: PriceSize;
  /** 合計金額など、通常価格より強調したい場合に true にする。色・太さの強調ルールを統一するためのフラグ。 */
  strong?: boolean;
  className?: string;
  as?: 'span' | 'p';
}

/**
 * 金額表示を統一するための共通コンポーネント。
 * 色・太さの体系: 価格・金額は text-gray-900 で統一（brand 塗りは CTA 専用のため）。
 * 通常価格は font-semibold、合計金額（strong）は font-bold。サイズは呼び出し側の文脈に応じて変える。
 */
export default function Price({ value, size = 'base', strong = false, className = '', as: Tag = 'span' }: PriceProps) {
  const colorClass = 'text-gray-900';
  const weightClass = strong ? 'font-bold' : 'font-semibold';

  return (
    <Tag className={`${colorClass} ${weightClass} ${SIZE_CLASSES[size]} ${className}`}>
      ¥{value.toLocaleString()}
    </Tag>
  );
}
