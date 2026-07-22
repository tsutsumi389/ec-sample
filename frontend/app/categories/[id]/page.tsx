'use client';

import { Suspense, useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { Category } from '@/lib/types';
import Breadcrumbs, { type BreadcrumbItem } from '@/components/Breadcrumbs';
import ProductListing from '@/components/ProductListing';
import { ProductGridSkeleton, Skeleton } from '@/components/Skeleton';

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
    // パンくず＋見出し＋グリッドのレイアウトを予約して、解決後の段差を防ぐ。
    return (
      <div className="max-w-6xl mx-auto px-4 py-8" aria-hidden="true">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-6 h-7 w-40" />
        <div className="mt-6">
          <ProductGridSkeleton count={12} />
        </div>
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error || 'カテゴリの取得に失敗しました'}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'ホーム', href: '/' },
    { label: category.name },
  ];

  return (
    <>
      {/* 一覧本体（ProductListing）が py-8 を持つため、パンくずは上余白だけ付ける。 */}
      <div className="max-w-6xl mx-auto px-4 pt-8 -mb-4">
        <Breadcrumbs items={breadcrumbItems} />
      </div>
      <Suspense
        fallback={
          <div className="max-w-6xl mx-auto px-4 py-8">
            <ProductGridSkeleton count={12} />
          </div>
        }
      >
        <ProductListing
          basePath={`/categories/${category.id}`}
          fixedCategory={{ id: category.id, name: category.name }}
        />
      </Suspense>
    </>
  );
}
