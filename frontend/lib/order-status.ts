import type { OrderStatus } from './types';
import type { BadgeStrength, BadgeVariant } from '@/components/Badge';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: '未処理',
  paid: '支払い済み',
  shipped: '発送済み',
  delivered: '配達完了',
  cancelled: 'キャンセル',
};

/**
 * 注文ステータス → 共通 Badge の見た目。ステータスの色分けはここに一本化する
 * （管理画面・注文履歴・注文詳細で必ずこの表を参照すること）。
 *
 * 色相は増やさない。進行の4段は brand の**濃度**で描き分け、濃いほど先に進んでいる
 * ことを表す。まだ手が付いていない pending だけ「要対応」の意味で柿渋（accent）にし、
 * cancelled は流れから外れるので無彩の neutral に落とす。
 * 使い方: <Badge {...ORDER_STATUS_BADGE[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
 */
export const ORDER_STATUS_BADGE: Record<
  OrderStatus,
  { variant: BadgeVariant; strength: BadgeStrength }
> = {
  pending: { variant: 'accent', strength: 'base' },
  paid: { variant: 'brand', strength: 'soft' },
  shipped: { variant: 'brand', strength: 'base' },
  delivered: { variant: 'brand', strength: 'strong' },
  cancelled: { variant: 'neutral', strength: 'base' },
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
