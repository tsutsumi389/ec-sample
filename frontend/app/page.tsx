'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Product, ProductListResponse } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import Pagination from '@/components/Pagination';
import Spinner from '@/components/Spinner';
import { ArrowRightIcon } from '@/components/Icons';

const LIMIT = 12;

function Hero() {
  return (
    <section className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 text-white">
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-0 md:min-h-[360px] md:flex md:items-center">
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
            className="mt-6 md:mt-8 inline-flex items-center gap-2 bg-white text-brand-700 px-6 py-3 text-sm font-medium rounded-md hover:bg-brand-50 transition-colors duration-150"
          >
            商品を見る
            <ArrowRightIcon className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function ProductListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get('search') || '';
  const page = Number(searchParams.get('page') || '1') || 1;

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('limit', String(LIMIT));

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
  }, [search, page]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    params.set('page', String(newPage));
    router.push(`/?${params.toString()}`);
  };

  return (
    <div id="products" className="max-w-6xl mx-auto px-4 py-8 scroll-mt-4">
      <div className="mb-6 border-b border-gray-200 pb-3">
        <h2 className="text-xl font-bold leading-tight text-gray-900">
          {search ? `「${search}」の検索結果` : '新着アイテム'}
        </h2>
        {!search && (
          <p className="mt-1 text-sm text-gray-500">季節のおすすめと定番の道具をご紹介します。</p>
        )}
      </div>

      {loading && (
        <p className="text-gray-600 flex items-center">
          <Spinner className="mr-2" />
          読み込み中...
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}

      {!loading && !error && products.length === 0 && (
        <div>
          <p className="text-gray-600 mb-2">該当する商品がありません。</p>
          {search && (
            <Link href="/" className="text-brand-600 hover:underline">
              検索条件をクリアして全商品を見る
            </Link>
          )}
        </div>
      )}

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
        {products.map((product) => (
          <li key={product.id} className="h-full">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>

      <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <Suspense
        fallback={
          <div className="max-w-6xl mx-auto px-4 py-8 text-gray-600 flex items-center">
            <Spinner className="mr-2" />
            読み込み中...
          </div>
        }
      >
        <ProductListContent />
      </Suspense>
    </>
  );
}
