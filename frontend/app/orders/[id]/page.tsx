'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { ORDER_STATUS_LABELS } from '@/lib/order-status';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';
import Badge, { type BadgeVariant } from '@/components/Badge';
import { ArrowLeftIcon } from '@/components/Icons';

/** キャンセル操作をユーザーに許可するステータス */
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'paid'];

/** 注文ステータス → Badge variant（意味と色の対応: 未処理=amber系, 進行中=brand系, 完了=green系, 取消=gray系） */
const STATUS_BADGE_VARIANTS: Record<OrderStatus, BadgeVariant> = {
  pending: 'warning',
  paid: 'info',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'neutral',
};

function OrderDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const id = params?.id;
  const justOrdered = searchParams?.get('justOrdered') === '1';

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/orders');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || !id) return;
    setLoading(true);
    setNotFound(false);
    api
      .get<Order>(`/orders/${id}`)
      .then(setOrder)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [user, id]);

  const handleCancel = async () => {
    if (!order) return;
    if (!window.confirm('この注文をキャンセルしますか？')) return;
    setCancelling(true);
    setCancelError('');
    try {
      const updated = await api.post<Order>(`/orders/${order.id}/cancel`);
      setOrder(updated);
    } catch (e) {
      setCancelError(e instanceof ApiError ? e.message : '注文のキャンセルに失敗しました');
    } finally {
      setCancelling(false);
    }
  };

  if (authLoading || !user || loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-gray-600 flex items-center">
        <Spinner className="mr-2" />
        読み込み中...
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p role="alert" className="text-red-600">
          注文情報が見つかりませんでした。
        </p>
        <Link href="/orders" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
          <ArrowLeftIcon className="w-4 h-4" />
          注文履歴に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeftIcon className="w-4 h-4" />
        注文履歴に戻る
      </Link>

      {justOrdered && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-sm"
        >
          ご注文ありがとうございました。
        </p>
      )}

      <div className="mt-4 bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">注文番号 #{order.id}</h1>
          <Badge variant={STATUS_BADGE_VARIANTS[order.status]}>
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          {new Date(order.created_at).toLocaleString('ja-JP')}
        </p>
        <p className="mt-4 text-sm text-gray-700">
          <span className="font-medium">配送先: </span>
          {order.shipping_address}
        </p>

        {CANCELLABLE_STATUSES.includes(order.status) && (
          <div className="mt-4">
            {cancelError && (
              <p role="alert" className="text-red-600 text-sm mb-2">
                {cancelError}
              </p>
            )}
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-2 rounded-md border border-red-300 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {cancelling && <Spinner className="w-4 h-4" />}
              注文をキャンセル
            </button>
          </div>
        )}

        <div className="mt-6 divide-y divide-gray-200 border-t border-gray-200">
          {(order.items || []).map((item) => (
            <div key={item.id} className="flex items-center justify-between py-3 gap-4">
              <div className="min-w-0">
                <p className="font-medium">{item.product_name}</p>
                <p className="mt-1 text-sm text-gray-500">
                  ¥{item.price.toLocaleString()} × {item.quantity}
                </p>
              </div>
              <Price
                value={item.price * item.quantity}
                size="base"
                as="p"
                className="w-24 shrink-0 text-right"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-gray-200 pt-4">
          {order.discount_amount > 0 && (
            <div className="flex items-baseline justify-end gap-3 text-sm text-gray-600">
              <span>
                クーポン割引
                {order.coupon_code && (
                  <span className="ml-1 text-gray-500">({order.coupon_code})</span>
                )}
              </span>
              <span>-¥{order.discount_amount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-baseline justify-end gap-3 mt-1">
            <span className="text-sm font-medium text-gray-700">合計</span>
            <Price value={order.total_amount} size="2xl" strong as="p" className="text-right" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto px-4 py-8 text-gray-600 flex items-center">
          <Spinner className="mr-2" />
          読み込み中...
        </div>
      }
    >
      <OrderDetailContent />
    </Suspense>
  );
}
