'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { ORDER_STATUS_LABELS, ORDER_STATUS_BADGE } from '@/lib/order-status';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';
import Badge from '@/components/Badge';
import PageMasthead from '@/components/PageMasthead';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import ReorderButton from '@/components/ReorderButton';
import { Skeleton } from '@/components/Skeleton';
import { PlantMotif } from '@/components/BrandMotifs';
import { btn } from '@/lib/buttonStyles';
import { withRedirect } from '@/lib/redirect';

/** キャンセル操作をユーザーに許可するステータス */
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'paid'];

/** キャンセル操作の共通クラス（弁柄の輪郭ボタン）。 */
const cancelButtonClass =
  'inline-flex h-11 items-center gap-2 rounded-md border border-critical-300 px-4 text-body font-medium text-critical-600 transition-colors duration-fast hover:bg-critical-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-critical-600 focus-visible:ring-offset-2';

/** 帳面の1行。注文カードとスケルトンで同じ 4 : 5 : 3 の桁割りを使う。 */
const LEDGER_ROW = 'grid gap-x-8 gap-y-5 md:grid-cols-12 md:items-start';
const LEDGER_ID = 'min-w-0 md:col-span-4';
const LEDGER_SHIP = 'min-w-0 md:col-span-5';
const LEDGER_TOTAL = 'md:col-span-3';

/** 桁の見出し（SHIPPING TO / TOTAL）。誌面の他ページの eyebrow と同じ様式に揃える。 */
const ledgerHeadClass = 'text-eyebrow uppercase font-num text-ink-muted';

/** 読み込み中の注文カードスケルトン。実カードと同じ桁割りにして、読み込み前後で行が動かないようにする。 */
function OrderCardSkeleton() {
  return (
    <div className="rounded-xl bg-surface p-5 shadow-paper md:p-6">
      <div className={LEDGER_ROW}>
        <div className={LEDGER_ID}>
          <Skeleton className="h-6 w-36" />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
        <div className={LEDGER_SHIP}>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2.5 h-5 w-3/4" />
          <Skeleton className="mt-2 hidden h-5 w-2/5 md:block" />
        </div>
        <div className={LEDGER_TOTAL}>
          <div className="flex items-center justify-between gap-4 md:block">
            <Skeleton className="h-3 w-10 md:ml-auto" />
            <Skeleton className="h-7 w-28 md:ml-auto md:mt-2" />
          </div>
        </div>
      </div>
      <Skeleton className="mt-5 h-11 w-40" />
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
      router.replace(withRedirect('/login', '/orders'));
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
      <div className="wrap band-lg flex items-center text-body text-ink-muted">
        <Spinner className="mr-2" />
        読み込み中...
      </div>
    );
  }

  return (
    <>
      {/* 扉。全ページ共通の PageMasthead に寄せる（幅は本文と同じ wrap ＝ width="default"）。 */}
      <PageMasthead
        eyebrow="ORDERS"
        title="注文履歴"
        subtitle="お届けした日々の記録です。"
        width="default"
        motif="lantern"
        breadcrumbs={[{ label: 'ホーム', href: '/' }, { label: '注文履歴' }]}
        right={
          !loading && orders.length > 0 ? (
            <p className="whitespace-nowrap text-body text-ink-muted">
              全 <span className="tnum text-num-lg text-ink">{orders.length}</span> 件
            </p>
          ) : undefined
        }
      />

      <div className="wrap band-lg">
        {error && (
          <p role="alert" className="mb-6 text-body text-critical-600">
            {error}
          </p>
        )}

        {loading && (
          <div className="space-y-4">
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <EmptyState
            icon={<PlantMotif />}
            title="まだ注文はありません"
            description="お気に入りの道具が見つかったら、こちらに注文の履歴が並びます。"
            action={
              <Link href="/products" className={btn('primary', 'lg')}>
                商品を見る
              </Link>
            }
          />
        )}

        {!loading && orders.length > 0 && (
          <ul className="space-y-4">
            {orders.map((order) => (
                /* カード全体を詳細へのリンクにしつつ、再注文・キャンセルは独立したボタンとして
                   扱えるよう、リンクは絶対配置の1枚（stretched link）にしてボタンを前面に置く。
                   これで <a> の中に <button> が入る不正な入れ子を避けられる。 */
                <li
                  key={order.id}
                  /* transform は付けない。再注文ダイアログ（position:fixed）を内包するため、
                     ここで transform を掛けると包含ブロックが移り、モーダルが画面中央に出なくなる。 */
                  className="group relative rounded-xl bg-surface p-5 shadow-paper transition-shadow duration-base ease-standard hover:shadow-lift md:p-6"
                >
                  <Link
                    href={`/orders/${order.id}`}
                    className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                  >
                    <span className="sr-only">注文番号 #{order.id} の詳細を見る</span>
                  </Link>

                  {/* 帳面の1行として横に読ませる。左＝注文の識別、中＝お届け先、右＝金額。
                      以前は「注文番号」と「状態＋合計」の2要素を両端寄せしていたため、
                      1,088px の版面のうち 731px が空白になり、薄い罫だけの行に見えていた。 */}
                  <div className={LEDGER_ROW}>
                    {/* 1桁目: 注文の識別（番号・日時・状態） */}
                    <div className={LEDGER_ID}>
                      <p className="font-mincho text-h3 text-ink transition-colors duration-fast group-hover:text-brand-700">
                        注文番号 <span className="tnum">#{order.id}</span>
                      </p>
                      {/* 日時と状態は1行に並べ、入らない幅でだけ折る（狭幅で行数を増やさない）。 */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <p className="tnum text-caption text-ink-muted">
                          {new Date(order.created_at).toLocaleString('ja-JP')}
                        </p>
                        <Badge {...ORDER_STATUS_BADGE[order.status]}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                      </div>
                    </div>

                    {/* 2桁目: お届け先。
                        ⚠ 品目はここに出せない。一覧の GET /orders は OrderSummaryOut を返し
                        items を含まない（明細は GET /orders/{id} だけ）。存在しない配列を
                        当てにした表示を置くと、この桁が常に空になって版面が空洞に戻る。 */}
                    <div className={LEDGER_SHIP}>
                      <p className={ledgerHeadClass}>SHIPPING TO</p>
                      {/* 390px では住所全文まで積むと1件が 372px になり、
                          巻末（フッター）が重い判型でさらに縦に伸びる。狭幅は1行に畳む。 */}
                      <p className="mt-2.5 line-clamp-1 whitespace-pre-line text-body text-ink-soft jp-body md:line-clamp-none">
                        {order.shipping_address}
                      </p>
                    </div>

                    {/* 3桁目: 金額。md 以上は右端で数字の桁を揃え、狭幅は1行の見出し＋金額に畳む。 */}
                    <div className={`${LEDGER_TOTAL} md:text-right`}>
                      <div className="flex items-baseline justify-between gap-4 md:block">
                        <p className={ledgerHeadClass}>TOTAL</p>
                        <Price
                          value={order.total_amount}
                          size="lg"
                          strong
                          as="p"
                          className="tnum md:mt-2"
                        />
                      </div>
                      {order.discount_amount > 0 && (
                        <p className="mt-1 text-caption text-brand-700">
                          クーポン割引
                          {order.coupon_code && <span className="ml-1">（{order.coupon_code}）</span>}
                          ：<span className="tnum">-¥{order.discount_amount.toLocaleString()}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* position:relative だけ（z-index は付けない）で重なり順を絶対配置リンクより上にする。
                      z-index を付けると再注文ダイアログ（fixed）が新しい重なり文脈に閉じ込められるため。 */}
                  <div className="relative mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                    <ReorderButton orderId={order.id} variant="compact" />
                    {CANCELLABLE_STATUSES.includes(order.status) && (
                      <button
                        type="button"
                        onClick={() => setCancelTarget(order)}
                        className={cancelButtonClass}
                      >
                        注文をキャンセル
                      </button>
                    )}
                    {/* 見出しの補助表示。クリックは背面の全面リンクへ透過させる。 */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none ml-auto text-caption text-ink-muted transition-colors duration-fast group-hover:text-brand-700"
                    >
                      詳細を見る →
                    </span>
                  </div>
                </li>
            ))}
          </ul>
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
    </>
  );
}
