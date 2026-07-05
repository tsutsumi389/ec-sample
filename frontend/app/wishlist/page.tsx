'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { WishlistItem } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import Spinner from '@/components/Spinner';
import ProductCard from '@/components/ProductCard';

export default function WishlistPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/wishlist');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api
      .get<WishlistItem[]>('/wishlist')
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'お気に入りの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [user]);

  const handleRemove = async (productId: number) => {
    const prevItems = items;
    setItems((current) => current.filter((item) => item.product.id !== productId));
    try {
      await api.delete(`/wishlist/items/${productId}`);
    } catch (e) {
      setItems(prevItems);
      setError(e instanceof ApiError ? e.message : 'お気に入りの解除に失敗しました');
    }
  };

  if (authLoading || !user) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-gray-600 flex items-center">
        <Spinner className="mr-2" />
        読み込み中...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">お気に入り</h1>

      {loading && (
        <p className="text-gray-600 flex items-center">
          <Spinner className="mr-2" />
          読み込み中...
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600 mb-4">
          {error}
        </p>
      )}

      {!loading && items.length === 0 && (
        <div>
          <p className="text-gray-600 mb-2">お気に入りに登録した商品がありません。</p>
          <Link href="/" className="text-brand-600 hover:underline">
            商品を見る
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
          {items.map((item) => (
            <li key={item.id} className="h-full relative">
              <ProductCard product={item.product} />
              <button
                type="button"
                onClick={() => handleRemove(item.product.id)}
                className="absolute top-2 right-2 inline-flex items-center rounded-full bg-white/90 shadow-sm border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:text-red-600 hover:border-red-200 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                解除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
