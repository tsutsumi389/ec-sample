'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Category, Product, ProductListResponse } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import { ProductGridSkeleton, Skeleton } from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import { BoxIcon } from '@/components/Icons';
import HomeSections from '@/components/HomeSections';
import { btnSecondary } from '@/lib/buttonStyles';

/** 新着セクションに出す件数。/products の 1 ページ分と同じにして見た目を揃える。 */
const NEW_ARRIVALS_LIMIT = 12;

// 一覧・検索がトップページに同居していた頃の URL パラメータ。
// これらが付いていたら /products へ引き継ぐ（旧ブックマーク・共有リンクの互換用）。
const LEGACY_LISTING_PARAMS = ['search', 'category_id', 'sort', 'min_price', 'max_price', 'page'];

/**
 * 旧URL互換リダイレクト。/?search=...&category_id=... のような一覧系パラメータ付きの
 * トップページアクセスは、クエリごと /products に付け替える。
 * useSearchParams を使うため Suspense 配下に置くこと。
 */
function LegacyListingRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasLegacyParams = LEGACY_LISTING_PARAMS.some((key) => searchParams.get(key) !== null);

  useEffect(() => {
    if (!hasLegacyParams) return;
    // 戻るボタンで再度リダイレクトが走らないよう、履歴には残さない（replace）。
    router.replace(`/products?${searchParams.toString()}`);
  }, [hasLegacyParams, router, searchParams]);

  return null;
}

/** Hero 直下のカテゴリへのクイックリンク。クリックでカテゴリページへ移動する。 */
function CategoryQuickLinks() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Category[]>('/categories')
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        /* クイックリンクは補助的なので取得失敗時は黙って隠す */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && categories.length === 0) return null;

  return (
    <section className="border-b border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2 overflow-x-auto">
        <span className="text-sm text-gray-500 whitespace-nowrap">カテゴリから探す</span>
        {loading ? (
          <>
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </>
        ) : (
          categories.map((category) => (
            <Link
              key={category.id}
              href={`/categories/${category.id}`}
              className="whitespace-nowrap rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            >
              {category.name}
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * 新着セクション。フィルタもページネーションも持たない「見せるだけ」の 12 件グリッドで、
 * 続きは /products に任せる。id="products" は BrandHero の「#products」CTA の飛び先として維持。
 */
function NewArrivals() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    // sort 未指定 = 新着順（バックエンドの既定）。
    api
      .get<ProductListResponse>(`/products?page=1&limit=${NEW_ARRIVALS_LIMIT}`)
      .then((data) => {
        if (!cancelled) setProducts(data.items);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : '商品の取得に失敗しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <section id="products" className="max-w-6xl mx-auto px-4 py-8 scroll-mt-4">
      <div className="mb-6 border-b border-gray-200 pb-3">
        <h2 className="text-xl font-bold leading-tight text-gray-900">新着アイテム</h2>
        <p className="mt-1 text-sm text-gray-500">季節のおすすめと定番の道具をご紹介します。</p>
      </div>

      {loading && <ProductGridSkeleton count={NEW_ARRIVALS_LIMIT} />}

      {!loading && error && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
          >
            再読み込み
          </button>
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <EmptyState
          icon={<BoxIcon />}
          title="商品がまだ登録されていません"
          description="商品が入荷したらここに新着として並びます。もうしばらくお待ちください。"
        />
      )}

      {!loading && !error && products.length > 0 && (
        <>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
            {products.map((product) => (
              <li key={product.id} className="h-full">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
          <div className="mt-8 text-center">
            <Link href="/products" className={`${btnSecondary} inline-flex`}>
              すべての商品を見る
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      {/* 旧 /?search=... 形式の互換リダイレクト。描画には関与しない。 */}
      <Suspense fallback={null}>
        <LegacyListingRedirect />
      </Suspense>
      {/* 「最近見た商品」はレーン（key: recently_viewed）が担うため、ここでは出さない。
          RecentlyViewed 自体は商品詳細ページで引き続き使われている。 */}
      <HomeSections />
      <CategoryQuickLinks />
      <NewArrivals />
    </>
  );
}
