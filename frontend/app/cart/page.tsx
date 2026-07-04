'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Cart } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';

export default function CartPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');
  const [addressError, setAddressError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/cart');
    }
  }, [authLoading, user, router]);

  const loadCart = () => {
    setLoading(true);
    api
      .get<Cart>('/cart')
      .then(setCart)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'カートの取得に失敗しました'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user) loadCart();
  }, [user]);

  const handleQuantityChange = async (itemId: number, quantity: number) => {
    if (quantity < 1) return;
    setUpdatingId(itemId);
    setError('');
    try {
      await api.put(`/cart/items/${itemId}`, { quantity });
      loadCart();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '更新に失敗しました');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (itemId: number) => {
    if (!window.confirm('カートから削除しますか？')) return;
    setUpdatingId(itemId);
    setError('');
    try {
      await api.delete(`/cart/items/${itemId}`);
      loadCart();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '削除に失敗しました');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOrder = async () => {
    if (!address.trim()) {
      setAddressError('配送先住所を入力してください');
      return;
    }
    setAddressError('');
    setSubmitting(true);
    setError('');
    try {
      const order = await api.post<{ id: number }>('/orders', { shipping_address: address.trim() });
      router.push(`/orders/${order.id}?justOrdered=1`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '注文に失敗しました');
    } finally {
      setSubmitting(false);
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
      <h1 className="text-2xl font-bold mb-6">カート</h1>

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

      {!loading && cart && cart.items.length === 0 && (
        <div>
          <p className="text-gray-600 mb-2">カートは空です。</p>
          <Link href="/" className="text-indigo-600 hover:underline">
            商品を見る
          </Link>
        </div>
      )}

      {!loading && cart && cart.items.length > 0 && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {cart.items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 p-4 flex-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.product.image_url}
                  alt={item.product.name}
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src.endsWith('/no-image.svg')) return;
                    img.onerror = null;
                    img.src = '/no-image.svg';
                  }}
                  className="w-20 h-20 object-cover rounded-md bg-gray-100"
                />
                <div className="flex-1 min-w-[140px]">
                  <Link href={`/products/${item.product.id}`} className="font-medium hover:underline">
                    {item.product.name}
                  </Link>
                  <Price value={item.product.price} size="sm" as="p" />
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={item.quantity}
                    disabled={updatingId === item.id}
                    onChange={(e) => handleQuantityChange(item.id, Number(e.target.value))}
                    aria-label={`${item.product.name}の数量`}
                    className="border border-gray-300 rounded-md px-2 py-2.5 text-sm"
                  >
                    {Array.from(
                      { length: Math.max(item.product.stock, item.quantity, 1) },
                      (_, i) => i + 1
                    ).map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                  <Price value={item.subtotal} size="base" as="p" className="w-24 text-right" />
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    disabled={updatingId === item.id}
                    aria-label={`${item.product.name}を削除`}
                    className="text-sm text-red-600 hover:underline disabled:opacity-50 px-2 py-2 -m-2"
                  >
                    {updatingId === item.id ? '削除中...' : '削除'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <p className="text-xl font-bold">
              合計: <Price value={cart.total_amount} size="xl" strong />
            </p>
          </div>

          <div className="mt-8 bg-white rounded-lg border border-gray-200 p-4">
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
              配送先住所
              <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
              <span className="sr-only">（必須）</span>
            </label>
            <textarea
              id="address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (addressError) setAddressError('');
              }}
              rows={3}
              placeholder="例）東京都渋谷区〇〇1-2-3"
              aria-invalid={Boolean(addressError)}
              aria-describedby={addressError ? 'address-error' : undefined}
              className={`w-full border rounded-md px-3 py-2.5 text-sm ${
                addressError ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {addressError && (
              <p id="address-error" role="alert" className="mt-1 text-sm text-red-600">
                {addressError}
              </p>
            )}
            <button
              type="button"
              onClick={handleOrder}
              disabled={submitting}
              className="mt-4 w-full bg-indigo-600 text-white py-2.5 rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? '注文処理中...' : '注文を確定する'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
