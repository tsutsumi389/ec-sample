'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { useToast } from '@/lib/toast-context';
import ProductPrice from '@/components/ProductPrice';
import { CartIcon } from '@/components/Icons';

interface AssistantProductCardProps {
  product: Product;
  /** LLM が付けた提案理由。あれば商品名の下に控えめに表示する。 */
  reason?: string | null;
}

/**
 * チャット内に表示するコンパクトな商品カード。
 * 幅の狭いパネル（PC 380px / モバイル全画面）に収まるよう横並びレイアウトにし、
 * 画像・商品名・価格（ProductPrice 再利用）と任意の提案理由を表示する。
 * 画像・商品名クリックで商品詳細へ遷移し（next/link のクライアント遷移なのでパネルは開いたまま）、
 * 「カートに追加」ボタンから商品詳細へ移動せずに直接カートへ追加できる。
 */
export default function AssistantProductCard({ product, reason }: AssistantProductCardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useCart();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);

  // カート追加。商品詳細ページ（app/products/[id]/page.tsx）の handleAddToCart と同じ導線に揃える。
  const handleAddToCart = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setAdding(true);
    try {
      await api.post('/cart/items', { product_id: product.id, quantity: 1 });
      await refresh();
      showToast('カートに追加しました', {
        type: 'success',
        action: { label: 'カートを見る', href: '/cart' },
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'カートへの追加に失敗しました';
      showToast(msg, { type: 'error' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex gap-3 rounded-lg border border-gray-200 bg-white p-2">
      <Link
        href={`/products/${product.id}`}
        className="group flex min-w-0 flex-1 gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image_url}
            alt={product.name}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.endsWith('/no-image.svg')) return;
              img.onerror = null;
              img.src = '/no-image.svg';
            }}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h4 className="text-sm font-medium text-gray-900 line-clamp-1">{product.name}</h4>
          <div className="mt-0.5">
            <ProductPrice product={product} size="sm" />
          </div>
          {reason && <p className="mt-1 text-xs text-gray-500 leading-relaxed line-clamp-2">{reason}</p>}
        </div>
      </Link>
      <div className="flex shrink-0 items-center">
        {product.purchasable ? (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={adding}
            aria-label={`${product.name}をカートに追加`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            {adding ? (
              <span
                role="status"
                aria-label="追加中"
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            ) : (
              <CartIcon className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="px-1 text-[10px] leading-tight text-gray-400">在庫なし</span>
        )}
      </div>
    </div>
  );
}
