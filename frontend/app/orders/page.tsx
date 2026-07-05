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

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={STATUS_BADGE_VARIANTS[order.status]}>
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
                <Price value={order.total_amount} size="lg" strong as="p" className="min-w-[6rem] text-right" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
