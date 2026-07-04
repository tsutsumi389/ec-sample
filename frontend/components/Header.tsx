'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function Header() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');

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
        <Link href="/" className="text-xl font-bold text-indigo-600 whitespace-nowrap">
          EC Sample
        </Link>

        <form onSubmit={handleSearch} className="flex flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="商品を検索"
            className="w-full border border-gray-300 rounded-l-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit"
            className="bg-indigo-600 text-white px-4 py-1.5 rounded-r-md text-sm hover:bg-indigo-700"
          >
            検索
          </button>
        </form>

        <nav className="flex items-center gap-4 text-sm whitespace-nowrap">
          <Link href="/cart" className="text-gray-700 hover:text-indigo-600">
            カート
          </Link>

          {!loading && user && (
            <>
              <Link href="/orders" className="text-gray-700 hover:text-indigo-600">
                注文履歴
              </Link>
              {user.role === 'admin' && (
                <Link href="/admin" className="text-gray-700 hover:text-indigo-600">
                  管理画面
                </Link>
              )}
              <span className="text-gray-500 hidden sm:inline">{user.name} さん</span>
              <button type="button" onClick={handleLogout} className="text-gray-700 hover:text-indigo-600">
                ログアウト
              </button>
            </>
          )}

          {!loading && !user && (
            <>
              <Link href="/login" className="text-gray-700 hover:text-indigo-600">
                ログイン
              </Link>
              <Link href="/register" className="text-gray-700 hover:text-indigo-600">
                会員登録
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
