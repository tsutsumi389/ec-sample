'use client';

import { Suspense, useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { Category } from '@/lib/types';
import { type BreadcrumbItem } from '@/components/Breadcrumbs';
import ProductListing from '@/components/ProductListing';
import { ProductGridSkeleton, Skeleton } from '@/components/Skeleton';
import ErrorNotice from '@/components/ErrorNotice';
import { listingGrid } from '@/lib/gridStyles';

/**
 * カテゴリ別の商品一覧ページ（/categories/[id]）。
 * カテゴリをパスで固定した ProductListing を出す。カテゴリ単体取得の API は無いため、
 * GET /categories の一覧から該当 id を解決し、見つからなければ 404 に倒す。
 */
export default function CategoryPage({ params }: { params: { id: string } }) {
  const categoryId = Number(params.id);
  // 数値でない・0 以下の id はカテゴリとして存在し得ないので、API を叩く前に 404 へ。
  if (!Number.isInteger(categoryId) || categoryId <= 0) notFound();

  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  // 「一覧に無かった」（=404）と「取得自体に失敗した」（=再試行可能）は別扱いにする。
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    api
      .get<Category[]>('/categories')
      .then((data) => {
        if (cancelled) return;
        const found = data.find((c) => c.id === categoryId);
        if (found) {
          setCategory(found);
        } else {
          setMissing(true);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'カテゴリの取得に失敗しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId, reloadKey]);

  // 存在しないカテゴリは 404 ページへ（描画中に throw して not-found 境界に渡す）。
  if (missing) notFound();

  if (loading) {
    // マストヘッド帯（パンくず＋見出し）＋フィルタ帯＋グリッドの骨格を予約して、解決後の段差を防ぐ。
    return (
      <div aria-hidden="true">
        <div className="bg-sunken band-lg">
          <div className="wrap-wide">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-6 h-3 w-24" />
            <Skeleton className="mt-4 h-9 w-56" />
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
    );
  }

  if (error || !category) {
    return (
      <div className="wrap band-lg">
        <ErrorNotice
          description={error || 'カテゴリの取得に失敗しました'}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </div>
    );
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'ホーム', href: '/' },
    { label: category.name },
  ];

  return (
    // パンくずは ProductListing のマストヘッド帯の中で描く（帯の外に置くと
    // 生成り地に浮いた1行が残り、帯の扉としての効きが弱まるため）。
    <Suspense
      fallback={
        <div className="wrap-wide band-lg" aria-hidden="true">
          <ProductGridSkeleton count={12} className={listingGrid} />
        </div>
      }
    >
      <ProductListing
        basePath={`/categories/${category.id}`}
        fixedCategory={{ id: category.id, name: category.name }}
        breadcrumbs={breadcrumbItems}
      />
    </Suspense>
  );
}
