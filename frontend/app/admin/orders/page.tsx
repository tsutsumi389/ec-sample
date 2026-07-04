'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { AdminOrder, OrderStatus } from '@/lib/types';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_OPTIONS } from '@/lib/order-status';
import ScrollableTable from '@/components/ScrollableTable';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadOrders = () => {
    setLoading(true);
    api
      .get<AdminOrder[]>('/admin/orders')
      .then(setOrders)
      .catch(() => setError('注文一覧の取得に失敗しました'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleStatusChange = async (orderId: number, status: OrderStatus) => {
    setUpdatingId(orderId);
    setError('');
    try {
      await api.put(`/admin/orders/${orderId}/status`, { status });
      loadOrders();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ステータスの更新に失敗しました');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">注文管理</h1>

      {loading && (
        <p className="text-gray-600 flex items-center">
          <Spinner className="mr-2" />
          読み込み中...
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600 mb-4">
          {error}
        </p>
      )}

      {!loading && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <ScrollableTable>
            <table className="min-w-[640px] w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">注文番号</th>
                  <th className="px-4 py-3 whitespace-nowrap">注文者</th>
                  <th className="px-4 py-3 whitespace-nowrap">合計金額</th>
                  <th className="px-4 py-3 whitespace-nowrap">注文日</th>
                  <th className="px-4 py-3 whitespace-nowrap">ステータス</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">#{order.id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {order.user.name}
                      <br />
                      <span className="text-gray-600 text-xs">{order.user.email}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Price value={order.total_amount} size="sm" strong />
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(order.created_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <select
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                        aria-label={`注文 #${order.id} のステータス`}
                        className={`rounded-full px-2 py-1 text-xs font-medium border-0 ${ORDER_STATUS_COLORS[order.status]}`}
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
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      )}
    </div>
  );
}
