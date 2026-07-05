'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Address, Cart, CouponValidation } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';
import { btnPrimary } from '@/lib/buttonStyles';

/** 数量セレクト用の自前シェブロン（appearance-none と組で使う） */
const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m19.5 8.25-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E";

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

  // 住所帳
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<number | 'manual'>('manual');

  // クーポン
  const [couponCode, setCouponCode] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponResult, setCouponResult] = useState<CouponValidation | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount_amount: number } | null>(
    null
  );

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

  useEffect(() => {
    if (!user) return;
    api
      .get<Address[]>('/addresses')
      .then((list) => {
        setAddresses(list);
        const defaultAddr = list.find((a) => a.is_default) ?? list[0];
        if (defaultAddr) setSelectedAddressId(defaultAddr.id);
      })
      .catch(() => {
        // 住所帳が取得できなくても従来のテキスト入力にフォールバックできるため致命的ではない
      })
      .finally(() => setAddressesLoaded(true));
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

  const handleValidateCoupon = async () => {
    const code = couponCode.trim();
    if (!code || !cart) return;
    setCouponValidating(true);
    setCouponResult(null);
    try {
      const result = await api.post<CouponValidation>('/coupons/validate', {
        code,
        subtotal: cart.total_amount,
      });
      setCouponResult(result);
      if (result.valid) {
        setAppliedCoupon({ code, discount_amount: result.discount_amount });
      } else {
        setAppliedCoupon(null);
      }
    } catch (e) {
      setCouponResult({
        valid: false,
        discount_amount: 0,
        message: e instanceof ApiError ? e.message : 'クーポンの確認に失敗しました',
      });
      setAppliedCoupon(null);
    } finally {
      setCouponValidating(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponResult(null);
    setCouponCode('');
  };

  const handleOrder = async () => {
    const useSavedAddress = addresses.length > 0 && selectedAddressId !== 'manual';
    if (!useSavedAddress && !address.trim()) {
      setAddressError('配送先住所を入力してください');
      return;
    }
    setAddressError('');
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {};
      if (useSavedAddress) {
        payload.address_id = selectedAddressId;
      } else {
        payload.shipping_address = address.trim();
      }
      if (appliedCoupon) {
        payload.coupon_code = appliedCoupon.code;
      }
      const order = await api.post<{ id: number }>('/orders', payload);
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
          <Link href="/" className="text-brand-600 hover:underline">
            商品を見る
          </Link>
        </div>
      )}

      {!loading && cart && cart.items.length > 0 && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {cart.items.map((item) => (
              <div key={item.id} className="flex gap-4 p-4">
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
                  className="w-20 h-20 object-cover rounded-md bg-gray-100 shrink-0"
                />
                <div className="flex-1 min-w-0 sm:flex sm:items-center sm:gap-4">
                  <div className="min-w-0 sm:flex-1">
                    <Link href={`/products/${item.product.id}`} className="font-medium hover:underline">
                      {item.product.name}
                    </Link>
                    <p className="mt-1 text-sm text-gray-500">
                      ¥{item.product.price.toLocaleString()} × {item.quantity}
                    </p>
                  </div>
                  <div className="mt-2 sm:mt-0 flex items-center gap-3">
                    <select
                      value={item.quantity}
                      disabled={updatingId === item.id}
                      onChange={(e) => handleQuantityChange(item.id, Number(e.target.value))}
                      aria-label={`${item.product.name}の数量`}
                      style={{ backgroundImage: `url("${SELECT_CHEVRON}")` }}
                      className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-8 py-2.5 text-sm bg-no-repeat bg-[right_0.5rem_center] bg-[length:1rem_1rem] disabled:opacity-50"
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
                    <Price
                      value={item.subtotal}
                      size="base"
                      as="p"
                      className="flex-1 text-right sm:flex-none sm:w-24"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      disabled={updatingId === item.id}
                      aria-label={`${item.product.name}を削除`}
                      className="shrink-0 text-sm text-red-600 hover:text-red-700 hover:underline transition-colors duration-150 disabled:opacity-50 px-2 py-2 -m-2"
                    >
                      {updatingId === item.id ? '削除中...' : '削除'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="px-4 py-4 bg-gray-50 rounded-b-lg space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-gray-700">
                  小計（{cart.items.reduce((sum, item) => sum + item.quantity, 0)}点）
                </span>
                <Price value={cart.total_amount} size="base" as="p" />
              </div>
              {appliedCoupon && (
                <div className="flex items-center justify-between gap-4 text-brand-700">
                  <span className="text-sm font-medium">クーポン割引（{appliedCoupon.code}）</span>
                  <p className="text-sm font-medium">-¥{appliedCoupon.discount_amount.toLocaleString()}</p>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 pt-1">
                <span className="text-sm font-medium text-gray-700">合計</span>
                <Price
                  value={Math.max(cart.total_amount - (appliedCoupon?.discount_amount ?? 0), 0)}
                  size="2xl"
                  strong
                  as="p"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
            <label htmlFor="coupon" className="block text-sm font-medium text-gray-700 mb-2">
              クーポンコード
            </label>
            <div className="flex gap-2">
              <input
                id="coupon"
                type="text"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value);
                  setCouponResult(null);
                }}
                placeholder="例）WELCOME10"
                disabled={Boolean(appliedCoupon)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2.5 text-sm disabled:opacity-50 disabled:bg-gray-50"
              />
              {appliedCoupon ? (
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="shrink-0 rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  解除
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleValidateCoupon}
                  disabled={couponValidating || !couponCode.trim()}
                  className="shrink-0 rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {couponValidating ? '確認中...' : '適用する'}
                </button>
              )}
            </div>
            {couponResult && (
              <p
                role={couponResult.valid ? undefined : 'alert'}
                className={`mt-2 text-sm ${couponResult.valid ? 'text-brand-700' : 'text-red-600'}`}
              >
                {couponResult.valid ? 'クーポンを適用しました。' : couponResult.message}
              </p>
            )}
          </div>

          <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-gray-700">
                配送先住所
                <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
                <span className="sr-only">（必須）</span>
              </span>
              <Link href="/account/addresses" className="text-sm text-brand-600 hover:underline">
                住所帳を管理
              </Link>
            </div>

            {addressesLoaded && addresses.length > 0 && (
              <div className="mb-3 space-y-2">
                {addresses.map((a) => (
                  <label
                    key={a.id}
                    className={`flex items-start gap-2 border rounded-md px-3 py-2.5 text-sm cursor-pointer ${
                      selectedAddressId === a.id
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="address-choice"
                      className="mt-0.5"
                      checked={selectedAddressId === a.id}
                      onChange={() => {
                        setSelectedAddressId(a.id);
                        setAddressError('');
                      }}
                    />
                    <span>
                      <span className="font-medium">{a.recipient_name}</span>
                      {a.is_default && (
                        <span className="ml-2 text-xs text-brand-700">既定</span>
                      )}
                      <br />
                      〒{a.postal_code} {a.prefecture}
                      {a.city}
                      {a.address_line}
                      <br />
                      {a.phone}
                    </span>
                  </label>
                ))}
                <label
                  className={`flex items-start gap-2 border rounded-md px-3 py-2.5 text-sm cursor-pointer ${
                    selectedAddressId === 'manual' ? 'border-brand-500 bg-brand-50' : 'border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="address-choice"
                    className="mt-0.5"
                    checked={selectedAddressId === 'manual'}
                    onChange={() => setSelectedAddressId('manual')}
                  />
                  <span>別の住所を入力する</span>
                </label>
              </div>
            )}

            {(addresses.length === 0 || selectedAddressId === 'manual') && (
              <>
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
              </>
            )}
            <button
              type="button"
              onClick={handleOrder}
              disabled={submitting}
              className={`${btnPrimary} mt-4 w-full`}
            >
              {submitting ? '注文処理中...' : '注文を確定する'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
