'use client';

import { useState } from 'react';

export type RatingStarsSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<RatingStarsSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const STAR_PATH =
  'M12 2.75l2.955 5.99 6.61.96-4.783 4.66 1.13 6.585L12 17.98l-5.912 3.11 1.13-6.585-4.783-4.66 6.61-.96L12 2.75z';

interface StarProps {
  fillRatio: number; // 0〜1
  sizeClass: string;
}

function Star({ fillRatio, sizeClass }: StarProps) {
  const clampedRatio = Math.max(0, Math.min(1, fillRatio));
  const gradientId = `rating-star-fill-${Math.round(clampedRatio * 1000)}`;

  return (
    <svg viewBox="0 0 24 24" className={sizeClass} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId}>
          <stop offset={`${clampedRatio * 100}%`} stopColor="currentColor" />
          <stop offset={`${clampedRatio * 100}%`} stopColor="transparent" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={STAR_PATH} fill="#e5e7eb" />
      <path d={STAR_PATH} fill={`url(#${gradientId})`} className="text-amber-400" />
    </svg>
  );
}

interface RatingStarsDisplayProps {
  /** 平均評価（0〜5）。レビューが無い場合は null。 */
  value: number | null;
  /** レビュー件数。指定すると "(件数)" を併記する。 */
  count?: number;
  size?: RatingStarsSize;
  className?: string;
  interactive?: false;
  onChange?: never;
}

interface RatingStarsInputProps {
  /** 入力中の評価値（0〜5、未選択は 0）。 */
  value: number;
  onChange: (value: number) => void;
  size?: RatingStarsSize;
  className?: string;
  interactive: true;
  count?: never;
}

export type RatingStarsProps = RatingStarsDisplayProps | RatingStarsInputProps;

/**
 * 星評価コンポーネント。
 * - 表示専用（デフォルト）: `value`（平均評価, 0〜5 or null）と任意で `count`（件数）を渡す。小数点も部分塗りで表現する。
 * - 入力用: `interactive` を true にし、`value`（1〜5, 0 は未選択）と `onChange` を渡す。クリックで整数値を選択する。
 */
export default function RatingStars(props: RatingStarsProps) {
  const { size = 'md', className = '' } = props;
  const sizeClass = SIZE_CLASSES[size];
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  if (props.interactive) {
    const { value, onChange } = props;
    const displayValue = hoverValue ?? value;

    return (
      <div className={`inline-flex items-center gap-0.5 ${className}`} onMouseLeave={() => setHoverValue(null)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHoverValue(star)}
            className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label={`${star} 点`}
            aria-pressed={value === star}
          >
            <Star fillRatio={displayValue >= star ? 1 : 0} sizeClass={sizeClass} />
          </button>
        ))}
      </div>
    );
  }

  const { value, count } = props;

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <div className="inline-flex items-center gap-0.5" role="img" aria-label={value != null ? `評価 ${value.toFixed(1)} / 5` : '評価なし'}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} fillRatio={value != null ? value - (star - 1) : 0} sizeClass={sizeClass} />
        ))}
      </div>
      {value != null ? (
        <span className="text-xs text-gray-500">
          {value.toFixed(1)}
          {typeof count === 'number' ? `（${count}件）` : ''}
        </span>
      ) : (
        <span className="text-xs text-gray-400">レビューなし</span>
      )}
    </div>
  );
}
