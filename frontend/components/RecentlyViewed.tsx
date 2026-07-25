'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Product } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import SectionHead from '@/components/SectionHead';
import { ProductGridSkeleton } from '@/components/Skeleton';
import { recommendGrid } from '@/lib/gridStyles';
import { getRecentlyViewedIds } from '@/lib/recentlyViewed';

const MAX_DISPLAY = 8;

/**
 * 端末の閲覧履歴（localStorage）から最近見た商品を最大8件表示する。
 * 非表示状態の商品は 404 になり得るため、個別に失敗を無視して取得する。
 * 履歴・取得結果が0件のときは何も表示しない。
 */
export default function RecentlyViewed({ excludeId }: { excludeId?: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const ids = getRecentlyViewedIds()
      .filter((id) => id !== excludeId)
      .slice(0, MAX_DISPLAY);

    setHasHistory(ids.length > 0);

    if (ids.length === 0) {
      setLoading(false);
      setProducts([]);
      return;
    }

    setLoading(true);
    Promise.allSettled(ids.map((id) => api.get<Product>(`/products/${id}`)))
      .then((results) => {
        if (cancelled) return;
        const fetched = results
          .filter(
            (r): r is PromiseFulfilledResult<Product> => r.status === 'fulfilled'
          )
          .map((r) => r.value);
        setProducts(fetched);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [excludeId]);

  // 履歴が無い場合は何も出さない
  if (!hasHistory) return null;

  if (loading) {
    return (
      <section className="mt-16">
        <SectionHead title="最近見た商品" eyebrow="RECENTLY VIEWED" />
        <div className="mt-6">
          <ProductGridSkeleton count={4} />
        </div>
      </section>
    );
  }

  // 取得結果が0件（すべて非表示・削除済み等）なら何も出さない
  if (products.length === 0) return null;

  return (
    <section className="mt-16">
      <SectionHead
        title="最近見た商品"
        eyebrow="RECENTLY VIEWED"
        right={
          <p className="text-caption text-ink-muted">
            この端末の履歴から <span className="tnum text-ink">{products.length}</span> 件
          </p>
        }
      />
      <ul className={`mt-6 grid items-stretch ${recommendGrid}`}>
        {products.map((product, i) => (
          <li
            key={product.id}
            className="h-full motion-safe:animate-rise"
            style={{ animationDelay: `${Math.min(i, 7) * 45}ms` }}
          >
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
