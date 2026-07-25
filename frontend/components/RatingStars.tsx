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
    // グラデーションの currentColor は <stop> が継承した色で解決されるため、
    // 満星の色は path ではなく svg 自身に置く必要がある。
    // 色は柿渋ランプの1段弱い accent-300。最も強い柿渋（accent-400/700 のベタ・文字）は
    // 「割引」「残りN点」＝購入を急ぐ理由だけに残し、評価はその一段下に置く。
    // カード1枚の中で最も強い色が常にセールだけになるようにするための規律。
    <svg viewBox="0 0 24 24" className={`${sizeClass} text-accent-300`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId}>
          <stop offset={`${clampedRatio * 100}%`} stopColor="currentColor" />
          <stop offset={`${clampedRatio * 100}%`} stopColor="transparent" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 空星は罫色（washi-300）。冷たい灰色を残さない */}
      <path d={STAR_PATH} className="fill-line" />
      <path d={STAR_PATH} fill={`url(#${gradientId})`} />
    </svg>
  );
}

interface RatingStarsDisplayProps {
  /** 平均評価（0〜5）。レビューが無い場合は null。 */
  value: number | null;
  /** レビュー件数。指定すると "(件数)" を併記する。 */
  count?: number;
  /** 星の右側に数値・件数テキストを併記するか（デフォルト true）。星だけ出したい場合は false。 */
  showValue?: boolean;
  /**
   * 星5つを敷かず「★ 4.0 (12)」の1行に畳む。商品カードの価格行など、
   * 評価が主役ではない場所で使う。未評価（value=null）のときは何も描かない。
   */
  compact?: boolean;
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
  compact?: never;
}

export type RatingStarsProps = RatingStarsDisplayProps | RatingStarsInputProps;

/**
 * 星評価コンポーネント。
 * - 表示専用（デフォルト）: `value`（平均評価, 0〜5 or null）と任意で `count`（件数）を渡す。小数点も部分塗りで表現する。
 * - 畳んだ表示: `compact` を true にすると星1つ + 数値の1行になる（商品カード用）。
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
      // 入力用は各星にパディングを持たせてタップ領域を広げる。
      // （.hit は隣の星の判定に重なってしまうためここでは使わない）
      <div className={`inline-flex items-center ${className}`} onMouseLeave={() => setHoverValue(null)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHoverValue(star)}
            className="rounded-full p-1.5 transition-transform duration-fast ease-standard hover:scale-110 motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label={`${star} 点`}
            aria-pressed={value === star}
          >
            <Star fillRatio={displayValue >= star ? 1 : 0} sizeClass={sizeClass} />
          </button>
        ))}
      </div>
    );
  }

  const { value, count, showValue = true, compact = false } = props;

  // 畳んだ表示。評価が無ければ「レビューなし」を書かずに黙って消える。
  // （空の星5つ＋「レビューなし」がカードの一等地を占有していたのを避けるため）
  if (compact) {
    if (value == null) return null;
    return (
      <span
        // 価格と同じ行に畳むので、内部では絶対に折り返さない（折り返すと
        // 評価を持つカードだけ本文が高くなり、同じ行の他のカードに空白が転嫁される）。
        className={`inline-flex items-center gap-1 whitespace-nowrap text-caption text-ink-muted ${className}`}
        role="img"
        aria-label={`評価 ${value.toFixed(1)} / 5${typeof count === 'number' ? `（${count}件）` : ''}`}
      >
        <Star fillRatio={1} sizeClass={sizeClass} />
        <span className="tnum text-ink-soft">{value.toFixed(1)}</span>
        {/* 件数は sm 未満で伏せる。390 の2列グリッドではカードの価格行が 137px しかなく、
            「¥12,800」＋「★ 5.0 (1)」で 143px 必要になって価格側が押し潰される。
            読み上げ用のラベル（上の aria-label）には件数を残してあるので情報は落ちない。 */}
        {typeof count === 'number' && <span className="tnum max-sm:hidden">({count})</span>}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <div
        className="inline-flex items-center gap-0.5"
        role="img"
        aria-label={value != null ? `評価 ${value.toFixed(1)} / 5` : '評価なし'}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} fillRatio={value != null ? value - (star - 1) : 0} sizeClass={sizeClass} />
        ))}
      </div>
      {showValue &&
        (value != null ? (
          <span className="text-caption tnum text-ink-muted">
            {value.toFixed(1)}
            {typeof count === 'number' ? `（${count}件）` : ''}
          </span>
        ) : (
          <span className="text-caption text-ink-muted">レビューなし</span>
        ))}
    </div>
  );
}
