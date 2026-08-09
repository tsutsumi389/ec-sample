'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AdminOrder, Category, Coupon, Product, User } from '@/lib/types';
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from '@/lib/order-status';
import Spinner from '@/components/Spinner';
import Badge from '@/components/Badge';
import Price from '@/components/Price';
import AdminList, {
  AdminError,
  AdminListHeader,
  adminRowClass,
} from '@/components/admin/AdminList';
import { BoxIcon, CartIcon, ClipboardListIcon, UsersIcon } from '@/components/Icons';
import { formatDateTime } from '@/lib/formatDate';

export default function AdminDashboardPage() {
  const [productCount, setProductCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [categoryCount, setCategoryCount] = useState<number | null>(null);
  const [couponCount, setCouponCount] = useState<number | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [recentOrders, setRecentOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<Product[]>('/admin/products'),
      api.get<AdminOrder[]>('/admin/orders'),
      api.get<User[]>('/admin/users'),
      api.get<Category[]>('/admin/categories'),
      api.get<Coupon[]>('/admin/coupons'),
    ])
      .then(([products, allOrders, users, categories, coupons]) => {
        setProductCount(products.length);
        // この画面が注文から使うのは「件数」と「直近5件」だけ。全件を state に残すと、
        // カタログと注文台帳をまるごと画面が開いている間ずっと抱えることになる。
        setOrderCount(allOrders.length);
        setRecentOrders(
          [...allOrders]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5)
        );
        setUserCount(users.length);
        setCategoryCount(categories.length);
        setCouponCount(coupons.length);
      })
      .catch(() => setError('サマリの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: '商品数', value: productCount, Icon: BoxIcon, href: '/admin/products' },
    { label: '注文数', value: orderCount, Icon: CartIcon, href: '/admin/orders' },
    { label: 'ユーザー数', value: userCount, Icon: UsersIcon, href: '/admin/users' },
    { label: 'カテゴリ数', value: categoryCount, Icon: ClipboardListIcon, href: '/admin/categories' },
    { label: 'クーポン数', value: couponCount, Icon: ClipboardListIcon, href: '/admin/coupons' },
  ];

  return (
    <div>
      <AdminListHeader title="ダッシュボード" />

      {loading && (
        <p className="text-gray-600 flex items-center">
          <Spinner className="mr-2" />
          読み込み中...
        </p>
      )}
      <AdminError message={error} />

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {cards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                className="bg-white rounded-lg border border-gray-200 p-6 flex items-center gap-4 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center justify-center w-12 h-12 rounded-full bg-brand-100 text-brand-700 shrink-0">
                  <card.Icon className="w-6 h-6" />
                </span>
                <div>
                  <p className="text-sm text-gray-600">{card.label}</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900 leading-tight">{card.value}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold leading-tight">最近の注文</h2>
              <Link href="/admin/orders" className="text-sm text-brand-600 hover:underline">
                すべて見る
              </Link>
            </div>

            <AdminList
              loading={false}
              error=""
              isEmpty={recentOrders.length === 0}
              emptyText="注文はまだありません。"
              minWidth={640}
              head={
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">注文番号</th>
                  <th className="px-4 py-3 whitespace-nowrap">注文者</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">合計金額</th>
                  <th className="px-4 py-3 whitespace-nowrap">注文日</th>
                  <th className="px-4 py-3 whitespace-nowrap">ステータス</th>
                </tr>
              }
            >
              {recentOrders.map((order) => (
                <tr key={order.id} className={adminRowClass}>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">#{order.id}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{order.user.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <Price value={order.total_amount} size="sm" strong />
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDateTime(order.created_at)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge {...ORDER_STATUS_BADGE[order.status]}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </AdminList>
          </div>
        </>
      )}
    </div>
  );
}
