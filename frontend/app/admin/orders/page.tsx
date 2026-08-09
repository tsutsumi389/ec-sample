'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { AdminOrder, OrderStatus } from '@/lib/types';
import { ORDER_STATUS_LABELS, ORDER_STATUS_OPTIONS } from '@/lib/order-status';
import Price from '@/components/Price';
import AdminList, { AdminListHeader, adminRowClass } from '@/components/admin/AdminList';
import { SELECT_CHEVRON, SELECT_CHEVRON_CLASS } from '@/lib/selectChevron';
import { formatDateTime } from '@/lib/formatDate';

/**
 * ステータスの状態色はテキスト色で表現（select の造形は他の入力と同じ1系統に統一）。
 * 色は lib/order-status.ts の ORDER_STATUS_BADGE と同じ読み方にする
 * ＝ pending だけ柿渋（要対応）、進行の3段は brand の濃度、cancelled は無彩。
 * ⚠ 体系外のパレット（blue / purple / green）を使わないこと。
 */
const STATUS_TEXT_COLORS: Record<OrderStatus, string> = {
  pending: 'text-accent-700',
  paid: 'text-brand-600',
  shipped: 'text-brand-700',
  delivered: 'text-brand-900',
  cancelled: 'text-ink-muted',
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<AdminOrder[]>('/admin/orders')
      .then(setOrders)
      .catch(() => setError('注文一覧の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, []);

  const handleStatusChange = async (orderId: number, status: OrderStatus) => {
    setUpdatingId(orderId);
    setError('');
    try {
      // PUT は更新後の注文を返す。一覧を取り直すと、状態を1つ変えるたびに
      // 「全注文 × 明細 × 注文者」がまるごともう一度流れる（この画面で最も反復される操作）。
      const updated = await api.put<AdminOrder>(`/admin/orders/${orderId}/status`, { status });
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ステータスの更新に失敗しました');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <AdminListHeader title="注文管理" />

      <AdminList
        loading={loading}
        error={error}
        isEmpty={orders.length === 0}
        emptyText="注文がまだありません。"
        minWidth={640}
        head={
          <tr>
            <th className="px-4 py-3 whitespace-nowrap">注文番号</th>
            <th className="px-4 py-3 whitespace-nowrap">注文者</th>
            <th className="px-4 py-3 whitespace-nowrap text-right">合計金額</th>
            <th className="px-4 py-3 whitespace-nowrap">注文日</th>
            <th className="px-4 py-3 whitespace-nowrap">ステータス</th>
          </tr>
        }
      >
        {orders.map((order) => (
          <tr key={order.id} className={adminRowClass}>
            <td className="px-4 py-3 font-medium whitespace-nowrap">#{order.id}</td>
            <td className="px-4 py-3 whitespace-nowrap">
              {order.user.name}
              <br />
              <span className="text-gray-600 text-xs">{order.user.email}</span>
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-right">
              <Price value={order.total_amount} size="sm" strong />
            </td>
            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
              {formatDateTime(order.created_at)}
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
              {/* 矢印は全画面共通の SELECT_CHEVRON を背景に敷く。
                  アイコンを絶対配置で重ねると、器の span と rotate-90 が要るうえ
                  矢印だけ体系外の冷たいグレーで残る。 */}
              <select
                value={order.status}
                disabled={updatingId === order.id}
                onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                aria-label={`注文 #${order.id} のステータス`}
                style={{ backgroundImage: `url("${SELECT_CHEVRON}")` }}
                className={`${SELECT_CHEVRON_CLASS} bg-white border border-gray-300 rounded-md pl-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${STATUS_TEXT_COLORS[order.status]}`}
              >
                {ORDER_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {ORDER_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </AdminList>
    </div>
  );
}
