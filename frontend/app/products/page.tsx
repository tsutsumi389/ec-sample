import { Suspense } from 'react';
import ProductListing from '@/components/ProductListing';
import { ProductGridSkeleton } from '@/components/Skeleton';

/**
 * 商品一覧・検索結果ページ（/products?search=...&category_id=...）。
 * 本体は ProductListing に集約し、ここは Suspense 境界を張るだけのサーバーラッパー。
 * タブタイトルは layout.tsx の getPageTitle が一括管理しているため（layout が 'use client' で
 * metadata API を使わない方針）、ここでは metadata を export しない。
 */
export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto px-4 py-8">
          <ProductGridSkeleton count={12} />
        </div>
      }
    >
      <ProductListing basePath="/products" />
    </Suspense>
  );
}
