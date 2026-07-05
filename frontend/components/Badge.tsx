import type { ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'info' | 'neutral';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  info: 'bg-brand-100 text-brand-800',
  neutral: 'bg-gray-100 text-gray-800',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

/**
 * ステータス表示用の共通バッジ。
 * 色の規律: 全 variant 共通で「◯◯-100 背景 + ◯◯-800 文字」。
 */
export default function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
