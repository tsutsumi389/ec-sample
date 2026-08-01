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
  ORDER_STATUS_BADGE,
  ORDER_TIMELINE_STEPS,
  orderTimelineIndex,
} from '@/lib/order-status';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';
import { withWordBreaks } from '@/lib/wordBreak';
import Badge from '@/components/Badge';
import PageMasthead from '@/components/PageMasthead';
import ConfirmDialog from '@/components/ConfirmDialog';
import ReorderButton from '@/components/ReorderButton';
import SectionHead from '@/components/SectionHead';
import { Skeleton } from '@/components/Skeleton';
import { ArrowLeftIcon, CheckCircleIcon } from '@/components/Icons';
import { withRedirect } from '@/lib/redirect';

/** キャンセル操作をユーザーに許可するステータス */
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'paid'];

/** キャンセル操作の共通クラス（弁柄の輪郭ボタン）。 */
const cancelButtonClass =
  'inline-flex h-11 items-center gap-2 rounded-md border border-critical-300 px-4 text-body font-medium text-critical-600 transition-colors duration-fast hover:bg-critical-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-critical-600 focus-visible:ring-offset-2';

/** 注文の進行状況を横型のステップで表示する。cancelled は打ち消し表示にする。 */
function OrderTimeline({ status }: { status: OrderStatus }) {
  const cancelled = status === 'cancelled';
  const currentIndex = orderTimelineIndex(status);

  return (
    <div>
      {cancelled && (
        <p className="mb-4 text-body font-medium text-critical-600">
          この注文はキャンセルされました。
        </p>
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
                  className={`h-px flex-1 ${lineFilled ? 'bg-brand-600' : 'bg-line-strong'}`}
                />
              )}
              <div className="flex flex-col items-center">
                <span
                  className={`tnum flex h-9 w-9 items-center justify-center rounded-full border text-caption font-semibold transition-colors duration-fast ${
                    reached
                      ? 'border-brand-600 bg-brand-600 text-white'
                      /* 未到達のステップは番号（＝読ませる文字）を出すので ink-faint は使えない
                         （対 surface 3.65:1）。罫は line-strong、文字は AA の ink-muted。 */
                      : 'border-line-strong bg-surface text-ink-muted'
                  } ${isCurrent ? 'ring-2 ring-brand-200 ring-offset-2 ring-offset-sunken' : ''}`}
                >
                  {reached ? <CheckCircleIcon className="h-5 w-5" /> : i + 1}
                </span>
                <span
                  className={`mt-2.5 w-16 text-center text-caption ${
                    cancelled
                      ? 'text-ink-muted line-through decoration-line-strong'
                      : reached
                        ? 'font-medium text-brand-700'
                        : 'text-ink-muted'
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

/** 読み込み中の注文詳細スケルトン（見出しは扉が出すので本文だけを予約する）。 */
function OrderDetailSkeleton() {
  return (
    <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-10">
      <div className="lg:col-span-7">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="mt-10 space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </div>
      <div className="mt-10 lg:col-span-5 lg:mt-0">
        <Skeleton className="h-64 w-full rounded-xl" />
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
      router.replace(withRedirect('/login', '/orders'));
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
  const crumbs = [
    { label: 'ホーム', href: '/' },
    { label: '注文履歴', href: '/orders' },
    { label: orderLabel },
  ];

  if (authLoading || !user || loading) {
    return (
      <>
        <PageMasthead
          eyebrow="ORDER"
          title={orderLabel}
          width="default"
          motif="lantern"
          breadcrumbs={crumbs}
        />
        <div className="wrap band-lg">
          <OrderDetailSkeleton />
        </div>
      </>
    );
  }

  if (notFound || !order) {
    return (
      <>
        <PageMasthead
          eyebrow="ORDER"
          title={orderLabel}
          width="default"
          motif="lantern"
          breadcrumbs={crumbs}
        />
        <div className="wrap band-lg">
          <p role="alert" className="text-body text-critical-600">
            注文情報が見つかりませんでした。
          </p>
          <Link
            href="/orders"
            className="mt-3 inline-flex items-center gap-1.5 rounded text-body text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            注文履歴に戻る
          </Link>
        </div>
      </>
    );
  }

  const items = order.items ?? [];
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      {/* 扉。全ページ共通の PageMasthead に寄せる（幅は本文と同じ wrap ＝ width="default"）。 */}
      <PageMasthead
        eyebrow="ORDER"
        title={`注文番号 #${order.id}`}
        width="default"
        motif="lantern"
        breadcrumbs={crumbs}
        /* 状態バッジは扉ではなく STATUS パネルの見出し行に置く（扉の右上は線画の場所）。 */
        right={
          <p className="tnum whitespace-nowrap text-caption text-ink-muted">
            {new Date(order.created_at).toLocaleString('ja-JP')}
          </p>
        }
      />

      <div className="wrap band-lg">
        {thanks && (
          <div
            role="status"
            aria-live="polite"
            className="mb-8 flex items-start gap-4 rounded-xl bg-brand-50 px-5 py-5"
          >
            <CheckCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" />
            <div className="min-w-0">
              <p className="font-mincho text-h3 text-brand-800">ご注文ありがとうございます。</p>
              <p className="mt-1.5 text-body text-brand-700">お届けまで今しばらくお待ちください。</p>
              <Link
                href="/products"
                className="mt-3 inline-block rounded text-body font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              >
                買い物を続ける →
              </Link>
            </div>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-10">
          {/* 左: 進行状況 + 明細 */}
          <div className="lg:col-span-7">
            {/* 進行状況タイムライン。影を持たせず地の色差だけで沈める。 */}
            <div className="rounded-xl bg-sunken px-5 py-6 md:px-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-eyebrow uppercase font-num text-ink-muted">STATUS</p>
                <Badge {...ORDER_STATUS_BADGE[order.status]}>
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
              </div>
              <OrderTimeline status={order.status} />
            </div>

            <SectionHead
              title="ご注文の品"
              eyebrow="ITEMS"
              className="mt-10"
              right={
                <p className="text-body text-ink-muted">
                  全 <span className="tnum text-ink">{itemCount}</span> 点
                </p>
              }
            />
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-h3 text-ink jp-name">{withWordBreaks(item.product_name)}</p>
                    <p className="mt-1 tnum text-caption text-ink-muted">
                      {/* 単価。¥ の組版を同じページの他の金額と揃えるため Price を通す。 */}
                      <Price value={item.price} size="sm" muted /> × {item.quantity}
                    </p>
                  </div>
                  <Price
                    value={item.price * item.quantity}
                    size="base"
                    as="p"
                    className="tnum w-24 shrink-0 text-right"
                  />
                </li>
              ))}
            </ul>

            {/* 操作は左カラムに置く。再注文ダイアログは position:fixed のため、
                重なり文脈を作る sticky なサイドバーの内側には入れない。 */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ReorderButton orderId={order.id} variant="primary" />
              {CANCELLABLE_STATUSES.includes(order.status) && (
                <button type="button" onClick={() => setCancelOpen(true)} className={cancelButtonClass}>
                  注文をキャンセル
                </button>
              )}
            </div>
          </div>

          {/* 右: 金額・お届け先・操作。スクロールに追従させる。 */}
          <aside className="mt-10 lg:col-span-5 lg:mt-0 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
            <div className="rounded-xl bg-surface p-6 shadow-lift md:p-7">
              <SectionHead title="お支払い金額" eyebrow="SUMMARY" />

              <dl className="mt-6 space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-body text-ink-muted">小計</dt>
                  <dd>
                    <Price value={subtotal} size="base" as="span" className="tnum" />
                  </dd>
                </div>
                {order.discount_amount > 0 && (
                  <div className="flex items-baseline justify-between gap-4 text-brand-700">
                    <dt className="text-body font-medium">
                      クーポン割引
                      {order.coupon_code && (
                        <span className="ml-1 font-normal">（{order.coupon_code}）</span>
                      )}
                    </dt>
                    <dd className="tnum text-body font-medium">
                      -¥{order.discount_amount.toLocaleString()}
                    </dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-body text-ink-muted">送料</dt>
                  <dd className="text-body font-medium text-ink">無料</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
                  <dt className="text-body font-medium text-ink-soft">合計</dt>
                  <Price value={order.total_amount} size="num-lg" inheritWeight as="dd" />
                </div>
              </dl>

              <div className="mt-6 border-t border-line pt-5">
                <p className="text-eyebrow uppercase font-num text-ink-muted">SHIPPING TO</p>
                <p className="mt-2.5 whitespace-pre-line text-body text-ink-soft jp-body">
                  {order.shipping_address}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/orders"
                className="inline-flex items-center gap-1.5 rounded text-body text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                注文履歴に戻る
              </Link>
            </div>
          </aside>
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
    </>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="wrap band-lg flex items-center text-body text-ink-muted">
          <Spinner className="mr-2" />
          読み込み中...
        </div>
      }
    >
      <OrderDetailContent />
    </Suspense>
  );
}
