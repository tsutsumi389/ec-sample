'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Product } from '@/lib/types';
import ProductCard from '@/components/ProductCard';

interface ProductRecommendationsProps {
  productId: number;
}

/**
 * 商品詳細ページに表示する「合わせておすすめ」(最大4件)。
 * GET /products/{id}/recommendations の結果が0件の場合は何も表示しない。
 */
export default function ProductRecommendations({ productId }: ProductRecommendationsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Product[]>(`/products/${productId}/recommendations`)
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

  if (loading || products.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-lg font-bold text-gray-900">合わせておすすめ</h2>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
