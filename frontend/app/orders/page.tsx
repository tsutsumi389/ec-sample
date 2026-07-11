'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { ORDER_STATUS_LABELS, ORDER_STATUS_BADGE_VARIANTS } from '@/lib/order-status';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';
import Badge from '@/components/Badge';
import Breadcrumbs from '@/components/Breadcrumbs';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton';
import { ClipboardListIcon } from '@/components/Icons';

/** キャンセル操作をユーザーに許可するステータス */
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'paid'];

/** 読み込み中の注文カードスケルトン。 */
function OrderCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);

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

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const updated = await api.post<Order>(`/orders/${cancelTarget.id}/cancel`);
      setOrders((prev) => prev.map((o) => (o.id === cancelTarget.id ? updated : o)));
      showToast('注文をキャンセルしました');
      setCancelTarget(null);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '注文のキャンセルに失敗しました', {
        type: 'error',
      });
    } finally {
      setCancelling(false);
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
      <Breadcrumbs items={[{ label: 'ホーム', href: '/' }, { label: '注文履歴' }]} />
      <h1 className="text-2xl font-bold mt-4 mb-6">注文履歴</h1>

      {error && (
        <p role="alert" className="text-red-600 mb-4">
          {error}
        </p>
      )}

      {loading && (
        <div className="space-y-3">
          <OrderCardSkeleton />
          <OrderCardSkeleton />
          <OrderCardSkeleton />
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <EmptyState
          icon={<ClipboardListIcon />}
          title="まだ注文はありません"
          description="お気に入りの道具が見つかったら、こちらに注文の履歴が並びます。"
          action={
            <Link href="/" className="text-brand-600 hover:underline">
              商品を見る
            </Link>
          }
        />
      )}

      {!loading && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => {
            const items = order.items ?? [];
            return (
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
                    {items.length > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        {items[0].product_name}
                        {items.length > 1 && <span className="ml-1">ほか{items.length - 1}点</span>}
                      </p>
                    )}
                    {order.discount_amount > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        クーポン割引
                        {order.coupon_code && <span className="ml-1">({order.coupon_code})</span>}
                        : -¥{order.discount_amount.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={ORDER_STATUS_BADGE_VARIANTS[order.status]}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                    <Price
                      value={order.total_amount}
                      size="lg"
                      strong
                      as="p"
                      className="min-w-[6rem] text-right"
                    />
                  </div>
                </div>
                {CANCELLABLE_STATUSES.includes(order.status) && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCancelTarget(order);
                      }}
                      className="inline-flex items-center gap-2 rounded-md border border-red-300 text-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
                    >
                      注文をキャンセル
                    </button>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        title="この注文をキャンセルしますか？"
        description={
          cancelTarget
            ? `注文番号 #${cancelTarget.id} をキャンセルします。この操作は取り消せません。`
            : ''
        }
        confirmLabel="キャンセルする"
        cancelLabel="戻る"
        danger
        busy={cancelling}
        onConfirm={confirmCancel}
        onCancel={() => {
          if (!cancelling) setCancelTarget(null);
        }}
      />
    </div>
  );
}
