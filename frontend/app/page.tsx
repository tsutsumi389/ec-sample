'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Category, Product, ProductListResponse } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import Pagination from '@/components/Pagination';
import { ProductGridSkeleton, Skeleton } from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import RecentlyViewed from '@/components/RecentlyViewed';
import { ArrowRightIcon, SearchIcon, XMarkIcon } from '@/components/Icons';
import ProductFilters, { type ProductFiltersValue, type ProductSort } from '@/components/ProductFilters';
import RecommendationSection from '@/components/RecommendationSection';
import { btnPrimary } from '@/lib/buttonStyles';

const LIMIT = 12;

const SORT_LABELS: Record<ProductSort, string> = {
  newest: '新着順',
  price_asc: '価格が安い順',
  price_desc: '価格が高い順',
  rating: '評価が高い順',
};

const yen = (value: string) => `¥${Number(value).toLocaleString('ja-JP')}`;

/** 「暮らしの道具店」らしい抽象的な道具モチーフ（ケトル・湯呑み・植物）の装飾イラスト。 */
function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 400 320"
      className="w-full max-w-md"
      role="img"
      aria-hidden="true"
      fill="none"
    >
      {/* やわらかな背景の面 */}
      <circle cx="228" cy="158" r="132" className="fill-brand-500" opacity="0.45" />
      <circle cx="312" cy="86" r="44" className="fill-brand-400" opacity="0.4" />

      {/* 棚のライン */}
      <line
        x1="60"
        y1="252"
        x2="360"
        y2="252"
        className="stroke-brand-200"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* ケトル */}
      <g strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M112 252 Q106 198 152 192 L206 192 Q252 198 246 252 Z"
          className="fill-brand-400 stroke-brand-100"
        />
        <path d="M152 192 q27 -17 54 0" className="stroke-brand-100" />
        <circle cx="179" cy="173" r="7" className="fill-brand-200 stroke-brand-100" />
        <path d="M112 216 q-30 -6 -40 -28" className="stroke-brand-100" />
        <path d="M152 192 q27 -46 54 0" className="stroke-brand-100" />
      </g>

      {/* 湯呑みと湯気 */}
      <g strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M266 238 h62 q-7 26 -31 26 q-24 0 -31 -26 Z"
          className="fill-brand-300 stroke-brand-100"
        />
        <path d="M328 242 q20 2 16 18 q-4 10 -18 8" className="stroke-brand-100" />
        <path d="M287 216 q-8 -10 0 -20 q8 -10 0 -20" className="stroke-brand-200" />
        <path d="M307 216 q-8 -10 0 -20 q8 -10 0 -20" className="stroke-brand-200" />
      </g>

      {/* 植物 */}
      <g strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M58 252 h48 l-7 34 h-34 Z" className="fill-brand-300 stroke-brand-100" />
        <path d="M82 252 q-2 -34 -22 -46" className="stroke-brand-100" />
        <path d="M82 252 q2 -30 22 -42" className="stroke-brand-100" />
        <path d="M60 206 q-15 4 -15 18 q17 2 21 -12 Z" className="fill-brand-400 stroke-brand-100" />
        <path d="M104 210 q15 4 15 18 q-17 2 -21 -12 Z" className="fill-brand-400 stroke-brand-100" />
        <path d="M82 206 q-9 -13 0 -26 q9 13 0 26 Z" className="fill-brand-400 stroke-brand-100" />
      </g>
    </svg>
  );
}

function Hero() {
  return (
    <section className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 text-white">
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-0 md:min-h-[360px] md:grid md:grid-cols-2 md:items-center md:gap-8">
        <div className="max-w-xl">
          <p className="text-xs md:text-sm font-medium tracking-widest text-brand-100">
            HIBINO — 日々の暮らしの道具店
          </p>
          <h1 className="mt-3 md:mt-4 text-3xl md:text-5xl font-bold leading-tight">
            日々の暮らしに、
            <br className="md:hidden" />
            よい道具を。
          </h1>
          <p className="mt-4 md:mt-5 text-sm md:text-base text-brand-100 leading-relaxed">
            使うたびに気分がすこし上向く、長く付き合える生活道具を選び集めました。
          </p>
          <a
            href="#products"
            className="mt-6 md:mt-8 inline-flex items-center gap-2 bg-white text-brand-700 px-6 py-3 text-sm font-medium rounded-md hover:bg-brand-50 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
          >
            商品を見る
            <ArrowRightIcon className="w-4 h-4" />
          </a>
        </div>
        <div className="hidden md:flex md:justify-end">
          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}

/** Hero 直下のカテゴリへのクイックリンク。クリックで category_id フィルタを適用する。 */
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
              href={`/?category_id=${category.id}#products`}
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

function FilterChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-sm text-brand-800">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-brand-600 transition-colors duration-150 hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        <XMarkIcon className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

function ProductListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get('search') || '';
  const page = Number(searchParams.get('page') || '1') || 1;
  const categoryIdParam = searchParams.get('category_id');
  const categoryId = categoryIdParam ? Number(categoryIdParam) || null : null;
  // 未知の sort 値（例: ?sort=foo）はチップ表示と API 送信の双方でノイズになるため、
  // 既知の ProductSort だけを許可し、それ以外は null（既定の newest 扱い）にフォールバックする。
  const rawSort = searchParams.get('sort');
  const sortParam: ProductSort | null =
    rawSort && rawSort in SORT_LABELS ? (rawSort as ProductSort) : null;
  const minPrice = searchParams.get('min_price') || '';
  const maxPrice = searchParams.get('max_price') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Category[]>('/categories')
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        /* 絞り込みチップのラベル用。失敗しても致命的でないため無視する */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (categoryId) params.set('category_id', String(categoryId));
    if (sortParam) params.set('sort', sortParam);
    if (minPrice) params.set('min_price', minPrice);
    if (maxPrice) params.set('max_price', maxPrice);

    api
      .get<ProductListResponse>(`/products?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setProducts(data.items);
        setTotal(data.total);
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
  }, [search, page, categoryId, sortParam, minPrice, maxPrice, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const buildParams = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (categoryId) params.set('category_id', String(categoryId));
    if (sortParam) params.set('sort', sortParam);
    if (minPrice) params.set('min_price', minPrice);
    if (maxPrice) params.set('max_price', maxPrice);
    params.set('page', String(page));

    Object.entries(overrides).forEach(([key, val]) => {
      if (val === null || val === '') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });

    return params;
  };

  const scrollToProducts = () => {
    if (typeof document !== 'undefined') {
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePageChange = (newPage: number) => {
    router.push(`/?${buildParams({ page: String(newPage) }).toString()}`);
    scrollToProducts();
  };

  const filtersValue: ProductFiltersValue = {
    categoryId,
    sort: sortParam,
    minPrice,
    maxPrice,
  };

  const handleFiltersChange = (next: ProductFiltersValue) => {
    router.push(
      `/?${buildParams({
        category_id: next.categoryId ? String(next.categoryId) : null,
        sort: next.sort,
        min_price: next.minPrice,
        max_price: next.maxPrice,
        page: '1',
      }).toString()}`
    );
  };

  const pushWith = (overrides: Record<string, string | null>) => {
    router.push(`/?${buildParams({ ...overrides, page: '1' }).toString()}`);
  };

  const hasActiveFilters = Boolean(
    search || categoryId || minPrice || maxPrice || (sortParam && sortParam !== 'newest')
  );

  const categoryName = categoryId
    ? categories.find((c) => c.id === categoryId)?.name ?? 'カテゴリ'
    : '';

  const priceLabel =
    minPrice && maxPrice
      ? `${yen(minPrice)}〜${yen(maxPrice)}`
      : minPrice
      ? `${yen(minPrice)}以上`
      : maxPrice
      ? `${yen(maxPrice)}以下`
      : '';

  const statusMessage = loading
    ? '商品を読み込んでいます'
    : error
    ? '商品の読み込みに失敗しました'
    : `${total}件の商品が見つかりました`;

  return (
    <div id="products" className="max-w-6xl mx-auto px-4 py-8 scroll-mt-4">
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      <div className="mb-6 border-b border-gray-200 pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-xl font-bold leading-tight text-gray-900">
            {search ? `「${search}」の検索結果` : '新着アイテム'}
          </h2>
          {!loading && !error && (
            <p className="text-sm text-gray-500 whitespace-nowrap">全 {total} 件</p>
          )}
        </div>
        {!search && (
          <p className="mt-1 text-sm text-gray-500">季節のおすすめと定番の道具をご紹介します。</p>
        )}
      </div>

      <ProductFilters value={filtersValue} onChange={handleFiltersChange} />

      {hasActiveFilters && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">絞り込み中:</span>
          {search && (
            <FilterChip
              label={`検索: ${search}`}
              removeLabel="検索条件を解除"
              onRemove={() => pushWith({ search: null })}
            />
          )}
          {categoryId && (
            <FilterChip
              label={`カテゴリ: ${categoryName}`}
              removeLabel="カテゴリの絞り込みを解除"
              onRemove={() => pushWith({ category_id: null })}
            />
          )}
          {(minPrice || maxPrice) && (
            <FilterChip
              label={`価格: ${priceLabel}`}
              removeLabel="価格帯の絞り込みを解除"
              onRemove={() => pushWith({ min_price: null, max_price: null })}
            />
          )}
          {sortParam && sortParam !== 'newest' && (
            <FilterChip
              label={`並び順: ${SORT_LABELS[sortParam]}`}
              removeLabel="並び順の指定を解除"
              onRemove={() => pushWith({ sort: null })}
            />
          )}
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-sm font-medium text-gray-600 underline-offset-2 transition-colors duration-150 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded"
          >
            すべて解除
          </button>
        </div>
      )}

      {loading && <ProductGridSkeleton count={LIMIT} />}

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
          icon={<SearchIcon />}
          title={
            search
              ? `「${search}」に一致する商品が見つかりませんでした`
              : '条件に合う商品が見つかりませんでした'
          }
          description="絞り込み条件を変えると、お探しの道具が見つかるかもしれません。"
          action={
            hasActiveFilters ? (
              <button type="button" onClick={() => router.push('/')} className={btnPrimary}>
                絞り込みをすべて解除する
              </button>
            ) : undefined
          }
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

          <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
        </>
      )}

      <RecentlyViewed />
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <CategoryQuickLinks />
      <RecommendationSection />
      <Suspense
        fallback={
          <div className="max-w-6xl mx-auto px-4 py-8">
            <ProductGridSkeleton count={LIMIT} />
          </div>
        }
      >
        <ProductListContent />
      </Suspense>
    </>
  );
}
