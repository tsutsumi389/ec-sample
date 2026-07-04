'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { Product, ProductListResponse } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import Pagination from '@/components/Pagination';

const LIMIT = 12;

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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{search ? `「${search}」の検索結果` : '商品一覧'}</h1>

      {loading && <p className="text-gray-500">読み込み中...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && products.length === 0 && (
        <p className="text-gray-500">該当する商品がありません。</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 py-8 text-gray-500">読み込み中...</div>}>
      <ProductListContent />
    </Suspense>
  );
}
