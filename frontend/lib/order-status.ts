import type { OrderStatus } from './types';
import type { BadgeVariant } from '@/components/Badge';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: '未処理',
  paid: '支払い済み',
  shipped: '発送済み',
  delivered: '配達完了',
  cancelled: 'キャンセル',
};

/**
 * 注文ステータス → 共通 Badge の variant。ステータスの色分けはここに一本化する。
 * paid（支払い済み=info/brand）と shipped（発送済み=purple）は別色にして取り違えを防ぐ。
 */
export const ORDER_STATUS_BADGE_VARIANTS: Record<OrderStatus, BadgeVariant> = {
  pending: 'warning',
  paid: 'info',
  shipped: 'purple',
  delivered: 'success',
  cancelled: 'neutral',
};

export const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
];

/**
 * 注文の進行タイムライン。受付→支払い→発送→お届けの4段階。
 * cancelled はこの流れに乗らないため含めず、キャンセル時は打ち消し表示で別扱いする。
 */
export interface OrderTimelineStep {
  status: OrderStatus;
  label: string;
}

export const ORDER_TIMELINE_STEPS: OrderTimelineStep[] = [
  { status: 'pending', label: '注文受付' },
  { status: 'paid', label: 'お支払い' },
  { status: 'shipped', label: '発送' },
  { status: 'delivered', label: 'お届け完了' },
];

/** タイムライン上での現在位置（0始まり）。cancelled や不明なステータスは -1。 */
export function orderTimelineIndex(status: OrderStatus): number {
  return ORDER_TIMELINE_STEPS.findIndex((step) => step.status === status);
}
