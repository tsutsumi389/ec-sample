'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Noto_Sans_JP } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AssistantWidget from '@/components/assistant/AssistantWidget';

const notoSansJP = Noto_Sans_JP({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const SITE_NAME = 'Hibino';
const SITE_DESCRIPTION = 'Hibino — 日々の暮らしの道具店';

// 各ページが 'use client' でメタデータAPIを使えないため、
// パスに応じてタブタイトル（document.title）をここで一括管理する。
function getPageTitle(pathname: string): string {
  if (pathname === '/') return SITE_NAME;
  if (pathname === '/login') return `ログイン | ${SITE_NAME}`;
  if (pathname === '/register') return `会員登録 | ${SITE_NAME}`;
  if (pathname === '/cart') return `カート | ${SITE_NAME}`;
  if (pathname === '/orders') return `注文履歴 | ${SITE_NAME}`;
  if (/^\/orders\/[^/]+$/.test(pathname)) return `注文詳細 | ${SITE_NAME}`;
  if (/^\/products\/[^/]+$/.test(pathname)) return `商品詳細 | ${SITE_NAME}`;
  if (pathname === '/admin') return `管理画面 | ${SITE_NAME}`;
  if (pathname === '/admin/products') return `商品管理 | ${SITE_NAME}`;
  if (pathname === '/admin/orders') return `注文管理 | ${SITE_NAME}`;
  if (pathname === '/admin/users') return `会員管理 | ${SITE_NAME}`;
  return SITE_NAME;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    document.title = getPageTitle(pathname ?? '/');
  }, [pathname]);

  return (
    <html lang="ja">
      <head>
        <title>{SITE_NAME}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
      </head>
      <body className={`${notoSansJP.className} min-h-screen bg-gray-50 text-gray-900 flex flex-col`}>
        <AuthProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <AssistantWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
