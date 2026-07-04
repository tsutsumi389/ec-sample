import type { OrderStatus } from './types';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: '未処理',
  paid: '支払い済み',
  shipped: '発送済み',
  delivered: '配達完了',
  cancelled: 'キャンセル',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-200 text-gray-600',
};

export const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
];
