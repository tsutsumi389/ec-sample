'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Order } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/order-status';

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

  if (authLoading || !user || loading) {
    return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">読み込み中...</div>;
  }

  if (notFound || !order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p role="alert" className="text-red-600">
          注文情報が見つかりませんでした。
        </p>
        <Link href="/orders" className="text-indigo-600 hover:underline">
          注文履歴に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/orders" className="text-sm text-indigo-600 hover:underline">
        ← 注文履歴に戻る
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
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {new Date(order.created_at).toLocaleString('ja-JP')}
        </p>
        <p className="mt-4 text-sm text-gray-700">
          <span className="font-medium">配送先: </span>
          {order.shipping_address}
        </p>

        <div className="mt-6 divide-y divide-gray-200 border-t border-gray-200">
          {(order.items || []).map((item) => (
            <div key={item.id} className="flex items-center justify-between py-3 gap-4">
              <div>
                <p className="font-medium">{item.product_name}</p>
                <p className="text-sm text-gray-500">
                  ¥{item.price.toLocaleString()} × {item.quantity}
                </p>
              </div>
              <p className="font-semibold">¥{(item.price * item.quantity).toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
          <p className="text-xl font-bold">合計: ¥{order.total_amount.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">読み込み中...</div>}>
      <OrderDetailContent />
    </Suspense>
  );
}
