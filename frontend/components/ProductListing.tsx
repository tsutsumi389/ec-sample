'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Category, Product, ProductListResponse } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import Pagination from '@/components/Pagination';
import { ProductGridSkeleton } from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import { SearchIcon, XMarkIcon } from '@/components/Icons';
import ProductFilters, { type ProductFiltersValue, type ProductSort } from '@/components/ProductFilters';
import { btnPrimary } from '@/lib/buttonStyles';

const LIMIT = 12;

const SORT_LABELS: Record<ProductSort, string> = {
  recommended: 'おすすめ順',
  newest: '新着順',
  price_asc: '価格が安い順',
  price_desc: '価格が高い順',
  rating: '評価が高い順',
};

const yen = (value: string) => `¥${Number(value).toLocaleString('ja-JP')}`;

interface ProductListingProps {
  /** URL を組み立てる基点。'/products' または `/categories/${id}` */
  basePath: string;
  /** カテゴリページで固定するカテゴリ。指定時は category_id を URL パラメータでなくこの値から取る */
  fixedCategory?: { id: number; name: string };
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

/** クエリが空のときに `?` だけが残らないよう URL を組み立てる。 */
const withQuery = (path: string, params: URLSearchParams) => {
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
};

/**
 * 検索・絞り込み・ページネーション付きの商品一覧。
 * /products と /categories/[id] の双方から使う。状態の源は URL パラメータ
 * （search / page / sort / min_price / max_price。category_id は /products のときのみ）で、
 * 変更はすべて basePath への router.push で表現する（＝URL 共有・戻るで文脈が復元できる）。
 * useSearchParams を使うため、呼び出し側で Suspense 配下に置くこと。
 */
export default function ProductListing({ basePath, fixedCategory }: ProductListingProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get('search') || '';
  const page = Number(searchParams.get('page') || '1') || 1;
  // カテゴリはパス（/categories/[id]）で固定されている場合はそちらを唯一の源とし、
  // /products のときだけ URL の category_id を読む。
  const categoryIdParam = fixedCategory ? null : searchParams.get('category_id');
  const categoryId = fixedCategory
    ? fixedCategory.id
    : categoryIdParam
    ? Number(categoryIdParam) || null
    : null;
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
  // 一度でもロードが完了したか。初回だけスケルトンを出し、以降の再ロード中は
  // 直前の結果グリッドを薄く残す（レイアウトの跳ねを防ぐ）ための判定に使う。
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
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
        if (!cancelled) {
          setLoading(false);
          setHasLoadedOnce(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [search, page, categoryId, sortParam, minPrice, maxPrice, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const buildParams = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    // 固定カテゴリはパスで表現されるため、クエリには category_id を載せない。
    if (!fixedCategory && categoryId) params.set('category_id', String(categoryId));
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
    router.push(withQuery(basePath, buildParams({ page: String(newPage) })));
    scrollToProducts();
  };

  const filtersValue: ProductFiltersValue = {
    categoryId,
    sort: sortParam,
    minPrice,
    maxPrice,
  };

  const handleFiltersChange = (next: ProductFiltersValue) => {
    // カテゴリ固定ページ（/categories/[id]）でカテゴリが変わったら「別ページへの移動」として扱う。
    // 検索語・並び順・価格帯は持ち越し、ページ番号だけ 1 に戻す。
    if (fixedCategory && next.categoryId !== fixedCategory.id) {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (next.sort) params.set('sort', next.sort);
      if (next.minPrice) params.set('min_price', next.minPrice);
      if (next.maxPrice) params.set('max_price', next.maxPrice);
      params.set('page', '1');
      // 「すべて」（解除）なら /products、別カテゴリならそのカテゴリページへ。
      const target = next.categoryId ? `/categories/${next.categoryId}` : '/products';
      router.push(withQuery(target, params));
      return;
    }

    router.push(
      withQuery(
        basePath,
        buildParams({
          category_id: !fixedCategory && next.categoryId ? String(next.categoryId) : null,
          sort: next.sort,
          min_price: next.minPrice,
          max_price: next.maxPrice,
          page: '1',
        })
      )
    );
  };

  const pushWith = (overrides: Record<string, string | null>) => {
    router.push(withQuery(basePath, buildParams({ ...overrides, page: '1' })));
  };

  // 固定カテゴリのチップ解除は「カテゴリページから出る」＝/products へ移動する。
  // 検索語・並び順・価格帯はそのまま持ち越す。
  const removeCategory = () => {
    if (fixedCategory) {
      router.push(withQuery('/products', buildParams({ page: '1' })));
      return;
    }
    pushWith({ category_id: null });
  };

  const hasActiveFilters = Boolean(
    search || categoryId || minPrice || maxPrice || (sortParam && sortParam !== 'newest')
  );

  const categoryName = fixedCategory
    ? fixedCategory.name
    : categoryId
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

  // 見出し: 検索中は検索結果、カテゴリページはカテゴリ名、素の /products は「商品一覧」。
  const heading = search
    ? `「${search}」の検索結果`
    : fixedCategory
    ? fixedCategory.name
    : '商品一覧';

  // 初回ロード（まだ結果グリッドを一度も出していない）だけスケルトンに置き換える。
  // 2回目以降のロード中は直前のグリッドを薄く残して差し替える。
  const showSkeleton = loading && (!hasLoadedOnce || products.length === 0);
  const showDimmedGrid = loading && hasLoadedOnce && products.length > 0;
  const showGrid = showDimmedGrid || (!loading && !error && products.length > 0);

  return (
    <div id="products" className="max-w-6xl mx-auto px-4 py-8 scroll-mt-4">
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      <div className="mb-6 border-b border-gray-200 pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold leading-tight text-gray-900">{heading}</h1>
          {!loading && !error && (
            <p className="text-sm text-gray-500 whitespace-nowrap">全 {total} 件</p>
          )}
        </div>
        {!search && (
          <p className="mt-1 text-sm text-gray-500">季節のおすすめと定番の道具をご紹介します。</p>
        )}
      </div>

      <ProductFilters value={filtersValue} onChange={handleFiltersChange} searching={Boolean(search)} />

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
              onRemove={removeCategory}
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
            // カテゴリページからの「すべて解除」もカテゴリ固定を外す＝素の /products へ戻す。
            onClick={() => router.push('/products')}
            className="text-sm font-medium text-gray-600 underline-offset-2 transition-colors duration-150 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded"
          >
            すべて解除
          </button>
        </div>
      )}

      {showSkeleton && <ProductGridSkeleton count={LIMIT} />}

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
          description={
            search
              ? '別の言葉や、もっと一般的な言葉で試してみてください。「雨の日に便利なもの」のような曖昧な表現でも探せます。'
              : '絞り込み条件を変えると、お探しの道具が見つかるかもしれません。'
          }
          action={
            categories.length > 0 || hasActiveFilters ? (
              <div className="flex flex-col items-center gap-6">
                {categories.length > 0 && (
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-gray-500">カテゴリから探す</span>
                    <div className="flex flex-wrap justify-center gap-2">
                      {categories.map((category) => (
                        <Link
                          key={category.id}
                          href={`/categories/${category.id}`}
                          className="whitespace-nowrap rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                        >
                          {category.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => router.push('/products')}
                    className={btnPrimary}
                  >
                    絞り込みをすべて解除する
                  </button>
                )}
              </div>
            ) : undefined
          }
        />
      )}

      {showGrid && (
        <div
          className={
            showDimmedGrid ? 'opacity-50 pointer-events-none transition-opacity duration-150' : ''
          }
          aria-busy={showDimmedGrid || undefined}
        >
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
            {products.map((product) => (
              <li key={product.id} className="h-full">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>

          <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
        </div>
      )}
    </div>
  );
}
