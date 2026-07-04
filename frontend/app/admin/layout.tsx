'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const NAV_ITEMS = [
  { href: '/admin', label: 'ダッシュボード' },
  { href: '/admin/products', label: '商品管理' },
  { href: '/admin/orders', label: '注文管理' },
  { href: '/admin/users', label: 'ユーザー管理' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.replace('/');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'admin') {
    return <div className="max-w-6xl mx-auto px-4 py-8 text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="md:w-48 shrink-0">
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
