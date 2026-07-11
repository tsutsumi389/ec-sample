'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGE_VARIANTS,
  ORDER_TIMELINE_STEPS,
  orderTimelineIndex,
} from '@/lib/order-status';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';
import Badge from '@/components/Badge';
import Breadcrumbs from '@/components/Breadcrumbs';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton';
import { ArrowLeftIcon, CheckCircleIcon } from '@/components/Icons';

/** キャンセル操作をユーザーに許可するステータス */
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'paid'];

/** 注文の進行状況を横型のステップで表示する。cancelled は打ち消し表示にする。 */
function OrderTimeline({ status }: { status: OrderStatus }) {
  const cancelled = status === 'cancelled';
  const currentIndex = orderTimelineIndex(status);

  return (
    <div>
      {cancelled && (
        <p className="mb-3 text-sm font-medium text-gray-500">この注文はキャンセルされました。</p>
      )}
      <ol className="flex items-start">
        {ORDER_TIMELINE_STEPS.map((step, i) => {
          const reached = !cancelled && currentIndex >= i;
          const isCurrent = !cancelled && currentIndex === i;
          const lineFilled = !cancelled && currentIndex >= i;
          return (
            <li
              key={step.status}
              className={`flex items-center ${i === 0 ? '' : 'flex-1'}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {i > 0 && (
                <div
                  aria-hidden="true"
                  className={`h-0.5 flex-1 ${lineFilled ? 'bg-brand-600' : 'bg-gray-200'}`}
                />
              )}
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                    reached
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-gray-300 bg-white text-gray-400'
                  } ${isCurrent ? 'ring-2 ring-brand-200' : ''}`}
                >
                  {reached ? <CheckCircleIcon className="h-5 w-5" /> : i + 1}
                </span>
                <span
                  className={`mt-2 w-16 text-center text-xs ${
                    cancelled
                      ? 'text-gray-400 line-through'
                      : reached
                        ? 'font-medium text-brand-700'
                        : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** 読み込み中の注文詳細スケルトン。 */
function OrderDetailSkeleton() {
  return (
    <div className="mt-4 bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-4 w-48" />
      <Skeleton className="mt-6 h-8 w-full" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  );
}

function OrderDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const id = params?.id;
  const thanks = searchParams?.get('thanks') === '1';

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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

  const confirmCancel = async () => {
    if (!order) return;
    setCancelling(true);
    try {
      const updated = await api.post<Order>(`/orders/${order.id}/cancel`);
      setOrder(updated);
      showToast('注文をキャンセルしました');
      setCancelOpen(false);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '注文のキャンセルに失敗しました', {
        type: 'error',
      });
    } finally {
      setCancelling(false);
    }
  };

  const orderLabel = id ? `注文 #${id}` : '注文詳細';

  if (authLoading || !user || loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: 'ホーム', href: '/' },
            { label: '注文履歴', href: '/orders' },
            { label: orderLabel },
          ]}
        />
        <div className="mt-4">
          <OrderDetailSkeleton />
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: 'ホーム', href: '/' },
            { label: '注文履歴', href: '/orders' },
            { label: orderLabel },
          ]}
        />
        <p role="alert" className="mt-4 text-red-600">
          注文情報が見つかりませんでした。
        </p>
        <Link href="/orders" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
          <ArrowLeftIcon className="w-4 h-4" />
          注文履歴に戻る
        </Link>
      </div>
    );
  }

  const subtotal = (order.items ?? []).reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Breadcrumbs
        items={[
          { label: 'ホーム', href: '/' },
          { label: '注文履歴', href: '/orders' },
          { label: `注文 #${order.id}` },
        ]}
      />

      {thanks && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-4"
        >
          <CheckCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-800">ご注文ありがとうございます。</p>
            <p className="mt-1 text-sm text-brand-700">
              お届けまで今しばらくお待ちください。
            </p>
            <Link
              href="/"
              className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded"
            >
              買い物を続ける
            </Link>
          </div>
        </div>
      )}

      <div className="mt-4 bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">注文番号 #{order.id}</h1>
          <Badge variant={ORDER_STATUS_BADGE_VARIANTS[order.status]}>
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          {new Date(order.created_at).toLocaleString('ja-JP')}
        </p>

        {/* 進行状況タイムライン */}
        <div className="mt-6">
          <OrderTimeline status={order.status} />
        </div>

        <p className="mt-6 text-sm text-gray-700 whitespace-pre-line">
          <span className="font-medium">配送先: </span>
          {order.shipping_address}
        </p>

        {CANCELLABLE_STATUSES.includes(order.status) && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-red-300 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
            >
              注文をキャンセル
            </button>
          </div>
        )}

        <div className="mt-6 divide-y divide-gray-200 border-t border-gray-200">
          {(order.items ?? []).map((item) => (
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

        {/* 金額内訳 */}
        <div className="mt-4 border-t border-gray-200 pt-4">
          <dl className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-gray-600">小計</dt>
              <dd>
                <Price value={subtotal} size="base" as="span" />
              </dd>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex items-center justify-between gap-4 text-brand-700">
                <dt className="text-sm font-medium">
                  クーポン割引
                  {order.coupon_code && (
                    <span className="ml-1 font-normal">（{order.coupon_code}）</span>
                  )}
                </dt>
                <dd className="text-sm font-medium">-¥{order.discount_amount.toLocaleString()}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-gray-600">送料</dt>
              <dd className="text-sm font-medium text-gray-900">無料</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-3">
              <dt className="text-sm font-medium text-gray-700">合計</dt>
              <dd>
                <Price value={order.total_amount} size="2xl" strong as="span" />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-4">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          注文履歴に戻る
        </Link>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        title="この注文をキャンセルしますか？"
        description={`注文番号 #${order.id} をキャンセルします。この操作は取り消せません。`}
        confirmLabel="キャンセルする"
        cancelLabel="戻る"
        danger
        busy={cancelling}
        onConfirm={confirmCancel}
        onCancel={() => {
          if (!cancelling) setCancelOpen(false);
        }}
      />
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
