'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Product, WishlistItem } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useCart } from '@/lib/cart-context';
import ProductCard from '@/components/ProductCard';
import { ProductGridSkeleton } from '@/components/Skeleton';
import Breadcrumbs from '@/components/Breadcrumbs';
import EmptyState from '@/components/EmptyState';
import { PRODUCT_STATUS_META } from '@/lib/productStatus';
import { btnPrimary } from '@/lib/buttonStyles';
import { HeartIcon, CartIcon } from '@/components/Icons';

/** 購入可否と、追加ボタンに出す文言を status / stock から導出する。 */
function addToCartState(product: Product): { disabled: boolean; label: string } {
  if (product.purchasable) {
    return { disabled: false, label: 'カートに追加' };
  }
  if (product.status === 'on_sale' && product.stock <= 0) {
    return { disabled: true, label: '在庫切れ' };
  }
  const meta = PRODUCT_STATUS_META[product.status];
  return { disabled: true, label: meta.storefrontLabel ?? '現在お取り扱いできません' };
}

export default function WishlistPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const { refresh } = useCart();

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingId, setAddingId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/wishlist');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api
      .get<WishlistItem[]>('/wishlist')
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'お気に入りの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [user]);

  const handleRemove = async (productId: number) => {
    const prevItems = items;
    setItems((current) => current.filter((item) => item.product.id !== productId));
    setError('');
    try {
      await api.delete(`/wishlist/items/${productId}`);
      showToast('お気に入りから削除しました', { type: 'info' });
    } catch (e) {
      setItems(prevItems);
      setError(e instanceof ApiError ? e.message : 'お気に入りの解除に失敗しました');
    }
  };

  const handleAddToCart = async (product: Product) => {
    setAddingId(product.id);
    setError('');
    try {
      await api.post('/cart/items', { product_id: product.id, quantity: 1 });
      await refresh();
      showToast(`「${product.name}」をカートに追加しました`, {
        type: 'success',
        action: { label: 'カートを見る', href: '/cart' },
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'カートへの追加に失敗しました');
    } finally {
      setAddingId(null);
    }
  };

  const showSkeleton = authLoading || !user || loading;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Breadcrumbs items={[{ label: 'ホーム', href: '/' }, { label: 'お気に入り' }]} />
      <h1 className="text-2xl font-bold mt-3 mb-6">お気に入り</h1>

      {error && (
        <p role="alert" className="text-red-600 mb-4">
          {error}
        </p>
      )}

      {showSkeleton && <ProductGridSkeleton count={8} />}

      {!showSkeleton && items.length === 0 && (
        <EmptyState
          icon={<HeartIcon />}
          title="お気に入りの道具をここに集めましょう"
          description="気になった道具を保存しておくと、いつでも見返せます。まずは商品を眺めてみませんか。"
          action={
            <Link href="/" className={btnPrimary}>
              商品を見る
            </Link>
          }
        />
      )}

      {!showSkeleton && items.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
          {items.map((item) => {
            const { disabled, label } = addToCartState(item.product);
            const adding = addingId === item.product.id;
            return (
              <li key={item.id} className="flex h-full flex-col">
                <div className="relative flex-1">
                  <ProductCard product={item.product} hideWishlistButton />
                  <button
                    type="button"
                    onClick={() => handleRemove(item.product.id)}
                    aria-label={`「${item.product.name}」をお気に入りから削除`}
                    className="absolute top-2 right-2 z-20 inline-flex items-center rounded-full bg-white/90 shadow-sm border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:text-red-600 hover:border-red-200 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    解除
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddToCart(item.product)}
                  disabled={disabled || adding}
                  className={`${btnPrimary} mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs`}
                >
                  {!disabled && <CartIcon className="h-4 w-4" />}
                  {adding ? '追加中...' : label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
