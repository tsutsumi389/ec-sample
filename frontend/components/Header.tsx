'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { iconButton } from '@/lib/buttonStyles';
import {
  SearchIcon,
  CartIcon,
  MenuIcon,
  CloseIcon,
  UserIcon,
  PackageIcon,
  HeartIcon,
  BoxIcon,
  ClipboardListIcon,
  ChevronRightIcon,
  ArrowRightIcon,
} from '@/components/Icons';

export default function Header() {
  const { user, loading, logout } = useAuth();
  const { count } = useCart();
  const router = useRouter();
  const pathname = usePathname();

  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  // カート数の増加時に一瞬バッジを弾ませる。
  const [bump, setBump] = useState(false);
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) {
      setBump(true);
      const t = window.setTimeout(() => setBump(false), 300);
      prevCount.current = count;
      return () => window.clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  // ページ遷移でドロワーと検索バーを閉じる。
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // ドロワー表示中は Esc で閉じ、背面スクロールを止め、Tab を内部で循環させる（フォーカストラップ）。
  // 開いたら閉じるボタンにフォーカスし、閉じたら開いた元のハンバーガーボタンへフォーカスを戻す。
  useEffect(() => {
    if (!menuOpen) return;
    const triggerButton = menuBtnRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;

      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      triggerButton?.focus();
    };
  }, [menuOpen]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearchOpen(false);
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set('search', search.trim());
    }
    router.push(params.toString() ? `/?${params.toString()}` : '/');
  };

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    router.push('/');
  };

  const pillClass = (href: string) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
      isActive(href)
        ? 'bg-brand-50 text-brand-700 font-semibold'
        : 'text-gray-700 hover:bg-brand-50 hover:text-brand-600'
    }`;

  const cartBadge =
    count > 0 ? (
      <span
        aria-hidden="true"
        className={`absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[0.625rem] font-bold leading-none text-white transition-transform duration-200 ${
          bump ? 'scale-125' : 'scale-100'
        }`}
      >
        {count > 9 ? '9+' : count}
      </span>
    ) : null;

  const cartLabel = count > 0 ? `カート（${count}点）` : 'カート';

  const drawerLinkClass = (href: string) =>
    `flex items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
      isActive(href) ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-700 hover:bg-brand-50'
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center gap-3 py-3">
          {/* ロゴ */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded text-xl font-bold text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
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

          {/* 検索（sm以上で常時表示） */}
          <form onSubmit={handleSearch} className="hidden flex-1 sm:flex">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="商品を検索"
              aria-label="商品を検索"
              className="w-full rounded-l-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-r-md border border-l-0 border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            >
              <SearchIcon />
              検索
            </button>
          </form>

          {/* ナビ（sm以上） */}
          <nav className="hidden items-center gap-1 whitespace-nowrap text-sm sm:flex">
            <Link
              href="/cart"
              className={`relative ${pillClass('/cart')}`}
              aria-current={isActive('/cart') ? 'page' : undefined}
              aria-label={cartLabel}
            >
              <span className="relative inline-flex">
                <CartIcon className="h-5 w-5" />
                {cartBadge}
              </span>
              <span>カート</span>
            </Link>

            {!loading && user && (
              <>
                <Link
                  href="/orders"
                  className={pillClass('/orders')}
                  aria-current={isActive('/orders') ? 'page' : undefined}
                >
                  <PackageIcon className="h-5 w-5" />
                  注文履歴
                </Link>
                <Link
                  href="/wishlist"
                  className={pillClass('/wishlist')}
                  aria-current={isActive('/wishlist') ? 'page' : undefined}
                >
                  <HeartIcon className="h-5 w-5" />
                  お気に入り
                </Link>
                <Link
                  href="/account"
                  className={pillClass('/account')}
                  aria-current={isActive('/account') ? 'page' : undefined}
                >
                  <UserIcon className="h-5 w-5" />
                  アカウント
                </Link>
                {user.role === 'admin' && (
                  <Link
                    href="/admin"
                    className={pillClass('/admin')}
                    aria-current={pathname?.startsWith('/admin') ? 'page' : undefined}
                  >
                    <ClipboardListIcon className="h-5 w-5" />
                    管理画面
                  </Link>
                )}
                <span className="hidden pl-1 text-gray-500 lg:inline">{user.name} さん</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-gray-700 transition-colors duration-150 hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                >
                  ログアウト
                </button>
              </>
            )}

            {!loading && !user && (
              <>
                <Link href="/login" className={pillClass('/login')}>
                  ログイン
                </Link>
                <Link href="/register" className={pillClass('/register')}>
                  会員登録
                </Link>
              </>
            )}
          </nav>

          {/* モバイル操作群（sm未満） */}
          <div className="ml-auto flex items-center gap-1 sm:hidden">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="検索"
              aria-expanded={searchOpen}
              className={iconButton}
            >
              <SearchIcon className="h-5 w-5" />
            </button>
            <Link href="/cart" aria-label={cartLabel} className={`relative ${iconButton}`}>
              <CartIcon className="h-5 w-5" />
              {cartBadge}
            </Link>
            <button
              type="button"
              ref={menuBtnRef}
              onClick={() => setMenuOpen(true)}
              aria-label="メニューを開く"
              aria-expanded={menuOpen}
              className={iconButton}
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* モバイル検索バー（開閉式） */}
        {searchOpen && (
          <form onSubmit={handleSearch} className="flex pb-3 sm:hidden">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="商品を検索"
              aria-label="商品を検索"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="w-full rounded-l-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-r-md border border-l-0 border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            >
              <SearchIcon />
              検索
            </button>
          </form>
        )}
      </div>

      {/* モバイルドロワー（右からスライドイン） */}
      <div
        className={`fixed inset-0 z-40 sm:hidden ${menuOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!menuOpen}
      >
        {/* オーバーレイ */}
        <div
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
            menuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* パネル */}
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="メニュー"
          className={`absolute right-0 top-0 flex h-full w-72 max-w-[80%] flex-col bg-white shadow-xl transition-transform duration-200 ${
            menuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <span className="text-sm font-semibold text-gray-800">メニュー</span>
            <button
              type="button"
              ref={closeBtnRef}
              onClick={() => setMenuOpen(false)}
              aria-label="メニューを閉じる"
              className={iconButton}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          {!loading && user && (
            <p className="border-b border-gray-100 px-4 py-3 text-sm text-gray-500">
              <span className="font-medium text-gray-700">{user.name}</span> さん、こんにちは
            </p>
          )}

          <nav className="flex-1 overflow-y-auto p-2">
            <Link href="/" className={drawerLinkClass('/')}>
              <BoxIcon className="h-5 w-5 text-gray-400" />
              <span className="flex-1">商品一覧</span>
              <ChevronRightIcon className="h-4 w-4 text-gray-300" />
            </Link>
            <Link href="/cart" className={drawerLinkClass('/cart')}>
              <CartIcon className="h-5 w-5 text-gray-400" />
              <span className="flex-1">カート{count > 0 ? `（${count}点）` : ''}</span>
              <ChevronRightIcon className="h-4 w-4 text-gray-300" />
            </Link>

            {!loading && user && (
              <>
                <Link href="/orders" className={drawerLinkClass('/orders')}>
                  <PackageIcon className="h-5 w-5 text-gray-400" />
                  <span className="flex-1">注文履歴</span>
                  <ChevronRightIcon className="h-4 w-4 text-gray-300" />
                </Link>
                <Link href="/wishlist" className={drawerLinkClass('/wishlist')}>
                  <HeartIcon className="h-5 w-5 text-gray-400" />
                  <span className="flex-1">お気に入り</span>
                  <ChevronRightIcon className="h-4 w-4 text-gray-300" />
                </Link>
                <Link href="/account" className={drawerLinkClass('/account')}>
                  <UserIcon className="h-5 w-5 text-gray-400" />
                  <span className="flex-1">アカウント</span>
                  <ChevronRightIcon className="h-4 w-4 text-gray-300" />
                </Link>
                {user.role === 'admin' && (
                  <Link href="/admin" className={drawerLinkClass('/admin')}>
                    <ClipboardListIcon className="h-5 w-5 text-gray-400" />
                    <span className="flex-1">管理画面</span>
                    <ChevronRightIcon className="h-4 w-4 text-gray-300" />
                  </Link>
                )}
              </>
            )}

            {!loading && !user && (
              <>
                <Link href="/login" className={drawerLinkClass('/login')}>
                  <UserIcon className="h-5 w-5 text-gray-400" />
                  <span className="flex-1">ログイン</span>
                  <ChevronRightIcon className="h-4 w-4 text-gray-300" />
                </Link>
                <Link href="/register" className={drawerLinkClass('/register')}>
                  <UserIcon className="h-5 w-5 text-gray-400" />
                  <span className="flex-1">会員登録</span>
                  <ChevronRightIcon className="h-4 w-4 text-gray-300" />
                </Link>
              </>
            )}
          </nav>

          {!loading && user && (
            <div className="border-t border-gray-100 p-2">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              >
                <ArrowRightIcon className="h-5 w-5 text-gray-400" />
                <span>ログアウト</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
