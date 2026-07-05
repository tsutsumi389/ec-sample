'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { SearchIcon } from '@/components/Icons';

export default function Header() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState('');

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  const navLinkClass = (href: string) =>
    `inline-block px-2 py-2 -m-2 rounded-md underline decoration-gray-300 underline-offset-2 hover:decoration-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
      isActive(href) ? 'text-brand-600 font-semibold decoration-brand-400' : 'text-gray-700 hover:text-brand-600'
    }`;

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set('search', search.trim());
    }
    router.push(params.toString() ? `/?${params.toString()}` : '/');
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
        <Link href="/" className="flex items-center gap-1.5 text-xl font-bold text-brand-600 whitespace-nowrap">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <path
              d="M4 6h16l-1.5 9.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 6Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M8 6V5a4 4 0 0 1 8 0v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Hibino
        </Link>

        <form onSubmit={handleSearch} className="flex flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="商品を検索"
            className="w-full border border-gray-300 rounded-l-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 bg-white border border-l-0 border-gray-300 text-gray-700 px-4 py-1.5 rounded-r-md text-sm hover:bg-gray-50 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <SearchIcon />
            検索
          </button>
        </form>

        <nav className="flex items-center gap-2 text-sm whitespace-nowrap">
          <Link href="/cart" className={navLinkClass('/cart')} aria-current={isActive('/cart') ? 'page' : undefined}>
            カート
          </Link>

          {!loading && user && (
            <>
              <Link
                href="/orders"
                className={navLinkClass('/orders')}
                aria-current={isActive('/orders') ? 'page' : undefined}
              >
                注文履歴
              </Link>
              <Link
                href="/wishlist"
                className={navLinkClass('/wishlist')}
                aria-current={isActive('/wishlist') ? 'page' : undefined}
              >
                お気に入り
              </Link>
              <Link
                href="/account"
                className={navLinkClass('/account')}
                aria-current={isActive('/account') ? 'page' : undefined}
              >
                アカウント
              </Link>
              {user.role === 'admin' && (
                <Link
                  href="/admin"
                  className={navLinkClass('/admin')}
                  aria-current={pathname?.startsWith('/admin') ? 'page' : undefined}
                >
                  管理画面
                </Link>
              )}
              <span className="text-gray-600 hidden sm:inline">{user.name} さん</span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-block px-2 py-2 -m-2 rounded-md text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-brand-600 hover:decoration-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              >
                ログアウト
              </button>
            </>
          )}

          {!loading && !user && (
            <>
              <Link href="/login" className={navLinkClass('/login')}>
                ログイン
              </Link>
              <Link href="/register" className={navLinkClass('/register')}>
                会員登録
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
