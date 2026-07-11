'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Product } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import { ProductGridSkeleton } from '@/components/Skeleton';

interface RelatedProductsProps {
  productId: number;
}

/**
 * 商品詳細ページ下部に表示する関連商品(最大4件)。
 * GET /products/{id}/related の結果が0件の場合は何も表示しない。
 */
export default function RelatedProducts({ productId }: RelatedProductsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Product[]>(`/products/${productId}/related`)
      .then((items) => {
        if (!cancelled) setProducts(items);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // 読み込み中は見出し＋スケルトンで高さを確保する。0件が確定したときのみ非表示にする。
  if (loading) {
    return (
      <section className="mt-12">
        <h2 className="text-xl font-bold text-gray-900">関連商品</h2>
        <div className="mt-4">
          <ProductGridSkeleton count={4} />
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-gray-900">関連商品</h2>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
