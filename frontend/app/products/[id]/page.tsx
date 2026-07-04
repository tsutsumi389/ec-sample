'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const id = params?.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setError('');
    api
      .get<Product>(`/products/${id}`)
      .then(setProduct)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true);
        } else {
          setError('商品情報の取得に失敗しました');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddToCart = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setAdding(true);
    setMessage('');
    setError('');
    try {
      await api.post('/cart/items', { product_id: Number(id), quantity });
      setMessage('カートに追加しました');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'カートへの追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-gray-500">読み込み中...</div>;
  }

  if (notFound || !product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600">{notFound ? '商品が見つかりませんでした。' : error || '商品情報の取得に失敗しました。'}</p>
        <Link href="/" className="text-indigo-600 hover:underline">
          商品一覧に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-indigo-600 hover:underline">
        ← 商品一覧に戻る
      </Link>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-gray-100 rounded-lg overflow-hidden aspect-[4/3]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="mt-2 text-3xl font-bold text-indigo-600">¥{product.price.toLocaleString()}</p>
          <p className="mt-1 text-sm text-gray-500">在庫: {product.stock}個</p>
          <p className="mt-4 text-gray-700 whitespace-pre-wrap">{product.description}</p>

          {product.stock > 0 ? (
            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <label htmlFor="quantity" className="text-sm text-gray-700">
                数量
              </label>
              <select
                id="quantity"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              >
                {Array.from({ length: Math.min(product.stock, 10) }, (_, i) => i + 1).map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={adding}
                className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {adding ? '追加中...' : 'カートに追加'}
              </button>
            </div>
          ) : (
            <p className="mt-6 text-red-600 font-medium">在庫切れ</p>
          )}

          {message && <p className="mt-3 text-green-600">{message}</p>}
          {error && <p className="mt-3 text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
