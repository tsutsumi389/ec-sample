'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Address, Cart, CartItem, CouponValidation } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { useToast } from '@/lib/toast-context';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';
import Breadcrumbs from '@/components/Breadcrumbs';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton';
import { CartIcon, TrashIcon, ChevronRightIcon } from '@/components/Icons';
import { btnPrimary } from '@/lib/buttonStyles';

/** 数量セレクト用の自前シェブロン（appearance-none と組で使う） */
const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m19.5 8.25-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E";

/** 読み込み中のカート行スケルトン（実際の行レイアウトに合わせる）。 */
function CartRowSkeleton() {
  return (
    <div className="flex gap-4 p-4">
      <Skeleton className="w-20 h-20 shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="mt-2 h-4 w-1/4" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { refresh } = useCart();
  const { showToast } = useToast();

  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');
  const [addressError, setAddressError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // 削除確認ダイアログ
  const [removeTarget, setRemoveTarget] = useState<CartItem | null>(null);
  const [removing, setRemoving] = useState(false);

  // 住所帳
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<number | 'manual'>('manual');

  // クーポン
  const [couponOpen, setCouponOpen] = useState(false);
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

  // 数量変更・削除の後にスケルトンを出さず静かに取り直す。
  const refreshCart = async () => {
    const data = await api.get<Cart>('/cart');
    setCart(data);
    return data;
  };

  // 数量変更・削除でカート合計が変わったら、適用中クーポンを新しい小計で再検証する。
  // 無効になった（最低購入額割れなど）場合はクーポンを解除して通知する。
  const revalidateAppliedCoupon = async (nextCart: Cart) => {
    if (!appliedCoupon) return;
    const removeStaleCoupon = () => {
      setAppliedCoupon(null);
      setCouponResult(null);
      showToast('カート内容が変わったためクーポンを解除しました。再度ご確認ください', {
        type: 'info',
      });
    };
    try {
      const result = await api.post<CouponValidation>('/coupons/validate', {
        code: appliedCoupon.code,
        subtotal: nextCart.total_amount,
      });
      if (result.valid) {
        setAppliedCoupon({ code: appliedCoupon.code, discount_amount: result.discount_amount });
        setCouponResult(result);
      } else {
        removeStaleCoupon();
      }
    } catch {
      // 再検証できない場合は割引額が古いまま残るのを避けるためクーポンを解除する
      removeStaleCoupon();
    }
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
    try {
      await api.put(`/cart/items/${itemId}`, { quantity });
      const nextCart = await refreshCart();
      await refresh();
      showToast('数量を変更しました');
      await revalidateAppliedCoupon(nextCart);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '更新に失敗しました', { type: 'error' });
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.delete(`/cart/items/${removeTarget.id}`);
      const nextCart = await refreshCart();
      await refresh();
      showToast('カートから削除しました');
      setRemoveTarget(null);
      await revalidateAppliedCoupon(nextCart);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '削除に失敗しました', { type: 'error' });
    } finally {
      setRemoving(false);
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
        await refresh();
        showToast('クーポンを適用しました');
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
      await refresh();
      showToast('ご注文ありがとうございます');
      if (order?.id) {
        router.push(`/orders/${order.id}?thanks=1`);
      } else {
        router.push('/orders');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '注文に失敗しました');
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

  const subtotal = cart?.total_amount ?? 0;
  const discount = appliedCoupon?.discount_amount ?? 0;
  const total = Math.max(subtotal - discount, 0);
  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Breadcrumbs items={[{ label: 'ホーム', href: '/' }, { label: 'カート' }]} />
      <h1 className="text-2xl font-bold mt-4 mb-6">カート</h1>

      {error && (
        <p role="alert" className="text-red-600 mb-4">
          {error}
        </p>
      )}

      {loading && (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          <CartRowSkeleton />
          <CartRowSkeleton />
          <CartRowSkeleton />
        </div>
      )}

      {!loading && cart && cart.items.length === 0 && (
        <EmptyState
          icon={<CartIcon />}
          title="カートは空です"
          description="気になる道具を見つけて、カートに入れてみてください。"
          action={
            <Link href="/" className={btnPrimary}>
              商品を見る
            </Link>
          }
        />
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/products/${item.product.id}`} className="font-medium hover:underline">
                        {item.product.name}
                      </Link>
                      <p className="mt-1 text-sm text-gray-500">
                        ¥{item.product.effective_price.toLocaleString()} × {item.quantity}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(item)}
                      disabled={updatingId === item.id}
                      aria-label={`${item.product.name}を削除`}
                      className="shrink-0 -m-1.5 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex items-center gap-2">
                      <label htmlFor={`qty-${item.id}`} className="text-sm text-gray-500">
                        数量
                      </label>
                      <select
                        id={`qty-${item.id}`}
                        value={item.quantity}
                        disabled={updatingId === item.id}
                        onChange={(e) => handleQuantityChange(item.id, Number(e.target.value))}
                        aria-label={`${item.product.name}の数量`}
                        style={{ backgroundImage: `url("${SELECT_CHEVRON}")` }}
                        className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-8 py-2.5 text-sm bg-no-repeat bg-[right_0.5rem_center] bg-[length:1rem_1rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:border-brand-400 disabled:opacity-50"
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
                      {updatingId === item.id && <Spinner className="w-4 h-4 text-gray-400" />}
                    </div>
                    <Price
                      value={item.subtotal}
                      size="base"
                      as="p"
                      className="sm:ml-auto sm:text-right"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* クーポン（折りたたみ） */}
          <div className="mt-6 bg-white rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => setCouponOpen((o) => !o)}
              aria-expanded={couponOpen}
              aria-controls="coupon-panel"
              className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium text-gray-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            >
              <span>
                クーポンをお持ちの方
                {appliedCoupon && (
                  <span className="ml-2 text-xs text-brand-700">適用中: {appliedCoupon.code}</span>
                )}
              </span>
              <ChevronRightIcon
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 ${
                  couponOpen ? 'rotate-90' : ''
                }`}
              />
            </button>
            {couponOpen && (
              <div id="coupon-panel" className="px-4 pb-4">
                <label htmlFor="coupon" className="sr-only">
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
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:border-brand-400 disabled:opacity-50 disabled:bg-gray-50"
                  />
                  {appliedCoupon ? (
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="shrink-0 rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                    >
                      解除
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleValidateCoupon}
                      disabled={couponValidating || !couponCode.trim()}
                      className="shrink-0 rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                    >
                      {couponValidating ? '確認中...' : '適用する'}
                    </button>
                  )}
                </div>
                {couponResult && (
                  <p
                    role={couponResult.valid ? 'status' : 'alert'}
                    className={`mt-2 text-sm ${couponResult.valid ? 'text-brand-700' : 'text-red-600'}`}
                  >
                    {couponResult.valid ? 'クーポンを適用しました。' : couponResult.message}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* お支払い金額の内訳 */}
          <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
            <dl className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm text-gray-600">小計（{itemCount}点）</dt>
                <dd>
                  <Price value={subtotal} size="base" as="span" />
                </dd>
              </div>
              {appliedCoupon && (
                <div className="flex items-center justify-between gap-4 text-brand-700">
                  <dt className="text-sm font-medium">クーポン割引（{appliedCoupon.code}）</dt>
                  <dd className="text-sm font-medium">-¥{discount.toLocaleString()}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm text-gray-600">送料</dt>
                <dd className="text-sm font-medium text-gray-900">無料</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-3">
                <dt className="text-sm font-medium text-gray-700">合計</dt>
                <dd>
                  <Price value={total} size="2xl" strong as="span" />
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-gray-400">送料は全国一律無料です。</p>
          </div>

          {/* 配送先住所 */}
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
                      className="mt-0.5 accent-brand-600"
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
                    className="mt-0.5 accent-brand-600"
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
                  className={`w-full border rounded-md px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:border-brand-400 ${
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

      <ConfirmDialog
        open={removeTarget !== null}
        title={removeTarget ? `「${removeTarget.product.name}」を削除しますか？` : ''}
        description="この商品をカートから取り除きます。"
        confirmLabel="削除する"
        danger
        busy={removing}
        onConfirm={confirmRemove}
        onCancel={() => {
          if (!removing) setRemoveTarget(null);
        }}
      />
    </div>
  );
}
