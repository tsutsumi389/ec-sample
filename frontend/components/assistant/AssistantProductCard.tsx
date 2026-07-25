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
import RatingStars from '@/components/RatingStars';
import StockLabel from '@/components/StockLabel';
import { ArrowRightIcon, CartIcon } from '@/components/Icons';

interface AssistantProductCardProps {
  product: Product;
  /** LLM が付けた提案理由。あれば商品名の下に控えめに表示する。 */
  reason?: string | null;
}

/**
 * チャット内に表示する商品カード。
 * 画像（96px）・商品名（2行まで）・評価・価格・在庫状況を示し、
 * 「商品を見る」リンクと「カートに追加」ボタンを 1 行に並置して導線を明示する。
 * 一覧の走査性を保つため縦丈を抑え（画像 96px・提案理由は 1 行に折り畳み）、
 * 操作行はモバイルで 44px を確保しつつデスクトップでは高さを詰める。
 * 画像・商品名クリックでも商品詳細へ遷移する（next/link のクライアント遷移でパネルは開いたまま）。
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

  const detailHref = `/products/${product.id}`;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-3 shadow-paper transition-shadow duration-base ease-standard hover:shadow-lift">
      <div className="flex gap-3">
        <Link
          href={detailHref}
          aria-label={`${product.name}の詳細を見る`}
          className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
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
            className="h-full w-full object-cover transition-transform duration-slow ease-entrance group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <h4 className="text-body font-medium leading-snug text-ink line-clamp-2 jp-name">
            <Link
              href={detailHref}
              className="rounded hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              {product.name}
            </Link>
          </h4>
          <div className="mt-1">
            <RatingStars value={product.avg_rating} count={product.review_count} size="sm" />
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <ProductPrice product={product} size="base" />
            {product.status === 'on_sale' && <StockLabel stock={product.stock} />}
          </div>
        </div>
      </div>

      {reason && (
        <p className="text-caption text-ink-muted line-clamp-1">{reason}</p>
      )}

      <div className="flex items-stretch gap-2">
        <Link
          href={detailHref}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-full border border-brand-200 bg-surface px-3 text-body font-medium text-brand-700 transition-colors duration-fast ease-standard hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:min-h-0 sm:py-2"
        >
          商品を見る
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
        {product.purchasable ? (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={adding}
            aria-label={`${product.name}をカートに追加`}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-600 px-3 text-body font-medium text-white transition-colors duration-fast ease-standard hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:min-h-0 sm:py-2"
          >
            {adding ? (
              <span
                role="status"
                aria-label="追加中"
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            ) : (
              <>
                <CartIcon className="h-4 w-4" />
                カートに追加
              </>
            )}
          </button>
        ) : (
          <span className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-sunken px-3 text-body font-medium text-ink-muted sm:min-h-0 sm:py-2">
            在庫なし
          </span>
        )}
      </div>
    </div>
  );
}
