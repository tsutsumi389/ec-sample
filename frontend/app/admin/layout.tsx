'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import Spinner from '@/components/Spinner';
import { ChevronRightIcon } from '@/components/Icons';

const NAV_ITEMS = [
  { href: '/admin', label: 'ダッシュボード' },
  { href: '/admin/products', label: '商品管理' },
  { href: '/admin/categories', label: 'カテゴリ管理' },
  { href: '/admin/coupons', label: 'クーポン管理' },
  { href: '/admin/orders', label: '注文管理' },
  { href: '/admin/users', label: 'ユーザー管理' },
  { href: '/admin/experiments', label: 'A/Bテスト' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.replace('/');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'admin') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-gray-600 flex items-center">
        <Spinner className="mr-2" />
        読み込み中...
      </div>
    );
  }

  const isActive = (href: string) => (href === '/admin' ? pathname === href : pathname?.startsWith(href));
  const currentLabel = NAV_ITEMS.find((item) => isActive(item.href))?.label;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <p className="text-xs text-gray-600 mb-4 flex items-center gap-1">
        管理画面
        {currentLabel && currentLabel !== 'ダッシュボード' && (
          <>
            <ChevronRightIcon className="w-3 h-3 text-gray-400" />
            <span>{currentLabel}</span>
          </>
        )}
      </p>
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="md:w-48 shrink-0">
          <nav className="space-y-1 bg-white border border-gray-200 rounded-lg p-2">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`block px-3 py-2 rounded-md text-sm font-medium ${
                    active ? 'bg-brand-50 text-brand-600 font-semibold' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
