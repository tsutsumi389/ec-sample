import { Suspense } from 'react';
import ProductListing from '@/components/ProductListing';
import { ProductGridSkeleton, Skeleton } from '@/components/Skeleton';
import { listingGrid } from '@/lib/gridStyles';

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
        // 本体と同じ「沈んだマストヘッド帯 → グリッド」の骨格を先に敷き、
        // 解決後に段差が出ないようにする。
        <div aria-hidden="true">
          <div className="bg-sunken band-lg">
            <div className="wrap-wide">
              {/* パンくず行 → eyebrow → h1 → subtitle。実体（PageMasthead）と同じ順・同じ間隔で
                  席を取る。ここを抜くと解決後に h1 が 40px 跳ねる。 */}
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-6 h-3 w-24" />
              <Skeleton className="mt-4 h-9 w-64" />
              <Skeleton className="mt-4 h-4 w-80" />
            </div>
          </div>
          <div className="border-y border-line bg-sunken/95">
            <div className="wrap-wide py-3">
              <Skeleton className="h-11 w-full max-w-md" />
            </div>
          </div>
          <div className="wrap-wide band-lg">
            <ProductGridSkeleton count={12} className={listingGrid} />
          </div>
        </div>
      }
    >
      {/* パンくずは扉（PageMasthead）の中で描く。渡さないとこのページだけ扉から
          パンくず行が消え、h1 の垂直位置が他ページと約40px ずれる。
          検索中は ProductListing が末尾に「『◯◯』の検索結果」を積む。 */}
      <ProductListing
        basePath="/products"
        breadcrumbs={[{ label: 'ホーム', href: '/' }, { label: '商品一覧' }]}
      />
    </Suspense>
  );
}
