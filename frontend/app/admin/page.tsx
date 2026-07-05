'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AdminOrder, OrderStatus, Product, User } from '@/lib/types';
import { ORDER_STATUS_LABELS } from '@/lib/order-status';
import Spinner from '@/components/Spinner';
import Badge, { BadgeVariant } from '@/components/Badge';
import Price from '@/components/Price';
import ScrollableTable from '@/components/ScrollableTable';
import { BoxIcon, CartIcon, UsersIcon } from '@/components/Icons';

const STATUS_BADGE_VARIANTS: Record<OrderStatus, BadgeVariant> = {
  pending: 'warning',
  paid: 'info',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'neutral',
};

export default function AdminDashboardPage() {
  const [productCount, setProductCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<Product[]>('/admin/products'),
      api.get<AdminOrder[]>('/admin/orders'),
      api.get<User[]>('/admin/users'),
    ])
      .then(([products, allOrders, users]) => {
        setProductCount(products.length);
        setOrders(allOrders);
        setUserCount(users.length);
      })
      .catch(() => setError('サマリの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, []);

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const cards = [
    { label: '商品数', value: productCount, Icon: BoxIcon },
    { label: '注文数', value: orders.length, Icon: CartIcon },
    { label: 'ユーザー数', value: userCount, Icon: UsersIcon },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ダッシュボード</h1>

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

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {cards.map((card) => (
              <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-6 flex items-center gap-4">
                <span className="flex items-center justify-center w-12 h-12 rounded-full bg-brand-100 text-brand-700 shrink-0">
                  <card.Icon className="w-6 h-6" />
                </span>
                <div>
                  <p className="text-sm text-gray-600">{card.label}</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900 leading-tight">{card.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold leading-tight">最近の注文</h2>
              <Link href="/admin/orders" className="text-sm text-brand-600 hover:underline">
                すべて見る
              </Link>
            </div>

            {recentOrders.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-600">
                注文はまだありません。
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <ScrollableTable>
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap">注文番号</th>
                        <th className="px-4 py-3 whitespace-nowrap">注文者</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">合計金額</th>
                        <th className="px-4 py-3 whitespace-nowrap">注文日</th>
                        <th className="px-4 py-3 whitespace-nowrap">ステータス</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {recentOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium whitespace-nowrap">#{order.id}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{order.user.name}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <Price value={order.total_amount} size="sm" strong />
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {new Date(order.created_at).toLocaleString('ja-JP')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge variant={STATUS_BADGE_VARIANTS[order.status]}>
                              {ORDER_STATUS_LABELS[order.status]}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
