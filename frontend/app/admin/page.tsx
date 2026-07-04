'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AdminOrder, Product, User } from '@/lib/types';

export default function AdminDashboardPage() {
  const [productCount, setProductCount] = useState<number | null>(null);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<Product[]>('/admin/products'),
      api.get<AdminOrder[]>('/admin/orders'),
      api.get<User[]>('/admin/users'),
    ])
      .then(([products, orders, users]) => {
        setProductCount(products.length);
        setOrderCount(orders.length);
        setUserCount(users.length);
      })
      .catch(() => setError('サマリの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: '商品数', value: productCount },
    { label: '注文数', value: orderCount },
    { label: 'ユーザー数', value: userCount },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ダッシュボード</h1>

      {loading && <p className="text-gray-500">読み込み中...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-6">
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="mt-2 text-3xl font-bold text-indigo-600">{card.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
