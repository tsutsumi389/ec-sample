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
import PageMasthead from '@/components/PageMasthead';
import EmptyState from '@/components/EmptyState';
import { PRODUCT_STATUS_META } from '@/lib/productStatus';
import { btn } from '@/lib/buttonStyles';
import { recommendGrid } from '@/lib/gridStyles';
import { CartIcon } from '@/components/Icons';

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
    <>
      {/* 扉。全ページ共通の PageMasthead に寄せる（幅は本文と同じ wrap ＝ width="default"）。 */}
      <PageMasthead
        eyebrow="WISHLIST"
        title="お気に入り"
        subtitle="いつか迎えたい道具の栞。"
        width="default"
        motif="umbrella"
        breadcrumbs={[{ label: 'ホーム', href: '/' }, { label: 'お気に入り' }]}
        right={
          !showSkeleton && items.length > 0 ? (
            <p className="whitespace-nowrap text-body text-ink-muted">
              全 <span className="text-num-lg tnum text-ink">{items.length}</span> 件
            </p>
          ) : undefined
        }
      />

      <div className="wrap band-lg">
        {error && (
          <p role="alert" className="mb-6 text-body text-critical-700">
            {error}
          </p>
        )}

        {showSkeleton && <ProductGridSkeleton count={8} />}

        {!showSkeleton && items.length === 0 && (
          <EmptyState
            title="お気に入りの道具をここに集めましょう"
            description="気になった道具を保存しておくと、いつでも見返せます。まずは商品を眺めてみませんか。"
            action={
              <Link href="/products" className={btn('primary', 'lg')}>
                商品を見る
              </Link>
            }
          />
        )}

        {!showSkeleton && items.length > 0 && (
          <ul className={`grid items-stretch ${recommendGrid}`}>
            {items.map((item) => {
              const { disabled, label } = addToCartState(item.product);
              const adding = addingId === item.product.id;
              return (
                <li key={item.id} className="flex h-full min-w-0 flex-col">
                  <div className="relative flex-1">
                    <ProductCard product={item.product} hideWishlistButton trackSection="wishlist" />
                    {/* カードのハートと同じ位置に置く（お気に入り一覧では解除だけを出す） */}
                    <button
                      type="button"
                      onClick={() => handleRemove(item.product.id)}
                      aria-label={`「${item.product.name}」をお気に入りから削除`}
                      className="absolute right-3 top-3 z-20 inline-flex h-9 items-center rounded-full bg-surface/85 px-3 text-caption text-ink-muted shadow-paper backdrop-blur-sm transition-colors duration-fast ease-standard hover:text-critical-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                    >
                      解除
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddToCart(item.product)}
                    disabled={disabled || adding}
                    className={`${btn('secondary', 'sm')} mt-3 w-full`}
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
    </>
  );
}
