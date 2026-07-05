'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { ORDER_STATUS_LABELS } from '@/lib/order-status';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';
import Badge, { type BadgeVariant } from '@/components/Badge';

/** 注文ステータス → Badge variant（意味と色の対応: 未処理=amber系, 進行中=brand系, 完了=green系, 取消=gray系） */
const STATUS_BADGE_VARIANTS: Record<OrderStatus, BadgeVariant> = {
  pending: 'warning',
  paid: 'info',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'neutral',
};

/** キャンセル操作をユーザーに許可するステータス */
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'paid'];

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/orders');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api
      .get<Order[]>('/orders')
      .then(setOrders)
      .catch((e) => setError(e instanceof ApiError ? e.message : '注文履歴の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [user]);

  const handleCancel = async (e: React.MouseEvent, orderId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('この注文をキャンセルしますか？')) return;
    setCancellingId(orderId);
    setCancelError('');
    try {
      const updated = await api.post<Order>(`/orders/${orderId}/cancel`);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
    } catch (e2) {
      setCancelError(e2 instanceof ApiError ? e2.message : '注文のキャンセルに失敗しました');
    } finally {
      setCancellingId(null);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-gray-600 flex items-center">
        <Spinner className="mr-2" />
        読み込み中...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">注文履歴</h1>

      {loading && (
        <p className="text-gray-600 flex items-center">
          <Spinner className="mr-2" />
          読み込み中...
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {cancelError && (
        <p role="alert" className="text-red-600 mb-4">
          {cancelError}
        </p>
      )}

      {!loading && !error && orders.length === 0 && (
        <div>
          <p className="text-gray-600 mb-2">注文履歴がありません。</p>
          <Link href="/" className="text-brand-600 hover:underline">
            商品を見る
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-medium">注文番号 #{order.id}</p>
                <p className="text-sm text-gray-600">
                  {new Date(order.created_at).toLocaleString('ja-JP')}
                </p>
                {order.discount_amount > 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    クーポン割引
                    {order.coupon_code && <span className="ml-1">({order.coupon_code})</span>}
                    : -¥{order.discount_amount.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={STATUS_BADGE_VARIANTS[order.status]}>
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
                <Price value={order.total_amount} size="lg" strong as="p" className="min-w-[6rem] text-right" />
              </div>
            </div>
            {CANCELLABLE_STATUSES.includes(order.status) && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={(e) => handleCancel(e, order.id)}
                  disabled={cancellingId === order.id}
                  className="inline-flex items-center gap-2 rounded-md border border-red-300 text-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {cancellingId === order.id && <Spinner className="w-4 h-4" />}
                  注文をキャンセル
                </button>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
