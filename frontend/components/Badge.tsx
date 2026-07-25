import type { ReactNode } from 'react';

/**
 * 造形は5種に閉じる: brand / accent / critical / neutral / invert。
 * これはサイトの色トークン（brand=深緑 / accent=柿渋 / critical=弁柄 / washi=生成り）と
 * 1対1に対応する。**体系外の色名（success / warning / info / purple など）を
 * 増やさないこと。** 増やすと同じ役割の状態が場所ごとに別色になる。
 */
export type BadgeVariant = 'brand' | 'accent' | 'critical' | 'neutral' | 'invert';

/**
 * 同じ色相の中での濃度。**順序を持つ状態**（注文の進行段階・実験の進行段階）だけに使う。
 * 色相を増やさずに「進んだ／進んでいない」を描き分けるための軸で、
 * 色数の増加と状態の取り違えを同時に防ぐ。既定は 'base'。
 */
export type BadgeStrength = 'soft' | 'base' | 'strong';

/**
 * 濃度は「地が濃くなるほど文字も濃くする」で AA を保つ。
 * ベタ塗りの brand-600 は btn('primary')＝最重要 CTA に予約された面なので、
 * 状態を示すだけのバッジには使わない（strong でも brand-300 止まり。
 * brand-300 上の brand-900 で 6.7:1、AA 合格）。
 */
const VARIANT_CLASSES: Record<BadgeVariant, Record<BadgeStrength, string>> = {
  brand: {
    soft: 'bg-brand-50 text-brand-700',
    base: 'bg-brand-100 text-brand-800',
    strong: 'bg-brand-300 text-brand-900',
  },
  accent: {
    soft: 'bg-accent-50 text-accent-700',
    base: 'bg-accent-50 text-accent-700',
    strong: 'bg-accent-100 text-accent-800',
  },
  critical: {
    soft: 'bg-critical-50 text-critical-700',
    base: 'bg-critical-50 text-critical-700',
    strong: 'bg-critical-100 text-critical-800',
  },
  neutral: {
    soft: 'bg-page text-ink-muted',
    base: 'bg-sunken text-ink-soft',
    strong: 'bg-line-strong text-ink',
  },
  // 画像や写真の上に重ねる用。地の明度に依存せず読めるようにする。
  invert: {
    soft: 'bg-invert/85 text-on-dark backdrop-blur-[2px]',
    base: 'bg-invert/85 text-on-dark backdrop-blur-[2px]',
    strong: 'bg-invert text-on-dark',
  },
};

interface BadgeProps {
  variant?: BadgeVariant;
  /** 同じ色相の中での濃度。順序を持つ状態にだけ使う（既定 'base'）。 */
  strength?: BadgeStrength;
  /**
   * 図版（商品タイル）の上に重ねるとき true。
   * 淡い variant でも面から分離して読めるよう、縁と影だけを足す。
   * **色は変えない**（同じ状態が場所によって別色になるのを防ぐため、
   * 可読性は色ではなくこのフラグで解決する）。
   */
  elevated?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * ステータス表示用の共通バッジ。
 * 造形: 高さ 24px 固定のピル。文字は eyebrow（11px / tracking .22em）で、
 * 和文でも欧文ラベルと同じ「小見出し」の質感になるようにしている。
 * tracking の分だけ右に余白が生まれるため、右パディングだけ差し引いて光学的に中央へ寄せる。
 */
export default function Badge({
  variant = 'neutral',
  strength = 'base',
  elevated = false,
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full pl-2.5 pr-[calc(0.625rem-0.22em)] text-eyebrow ${
        VARIANT_CLASSES[variant][strength]
      } ${elevated ? 'shadow-paper ring-1 ring-inset ring-line-strong' : ''} ${className}`}
    >
      {children}
    </span>
  );
}
