'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
// フォントは自己ホスト。next/font/google は使わない（理由は scripts/fetch-fonts.mjs 参照）。
// fonts.css が @font-face と --font-sans-jp / --font-mincho / --font-num を :root に定義する。
import './fonts.css';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { CartProvider } from '@/lib/cart-context';
import { ToastProvider } from '@/lib/toast-context';
import { ExperimentProvider } from '@/lib/experiment-context';
import { AssistantProvider } from '@/lib/assistant-context';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AssistantWidget from '@/components/assistant/AssistantWidget';
import AnalyticsTracker from '@/components/AnalyticsTracker';

// 収録ウェイト（fonts.css）:
//   Noto Sans JP 400/700 … 本文・UI。font-medium(500) は 400 にマッチする。
//   Zen Old Mincho 700 …… 見出し・ブランド表記専用。900 は持たないので指定しないこと
//                          （合成ボールドは明朝の線を潰す。text-display も 700 で組む）。
//   Inter 400/500/600/700 … 価格・件数などの数値専用。

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
  if (pathname === '/products') return `商品一覧 | ${SITE_NAME}`;
  if (/^\/products\/[^/]+$/.test(pathname)) return `商品詳細 | ${SITE_NAME}`;
  // カテゴリ名はクライアント側で解決するため、タイトルは固定文言に留める。
  if (/^\/categories\/[^/]+$/.test(pathname)) return `カテゴリ | ${SITE_NAME}`;
  if (pathname === '/admin') return `管理画面 | ${SITE_NAME}`;
  if (pathname === '/admin/products') return `商品管理 | ${SITE_NAME}`;
  if (pathname === '/admin/orders') return `注文管理 | ${SITE_NAME}`;
  if (pathname === '/admin/users') return `会員管理 | ${SITE_NAME}`;
  if (pathname === '/admin/experiments') return `A/Bテスト | ${SITE_NAME}`;
  if (/^\/admin\/experiments\/[^/]+$/.test(pathname)) return `実験結果 | ${SITE_NAME}`;
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
      <body className="font-sans min-h-screen bg-page text-ink-soft flex flex-col antialiased">
        <AuthProvider>
          {/* 実験の割り当てはログイン状態に応じて取り直すため AuthProvider の内側に置く。 */}
          <ExperimentProvider>
            <CartProvider>
              <ToastProvider>
                {/* アシスタントの開閉状態。ページ側（検索0件の相談導線など）からも開けるよう、
                    本文（main）と AssistantWidget の両方を覆う位置に置く。 */}
                <AssistantProvider>
                  <AnalyticsTracker />
                  <Header />
                  {/*
                    下端のセーフエリアはここでは取らない。FAB は position:fixed なので
                    main に padding を足しても被りは変わらず、全ページ一律で 80px の
                    無地帯が本文と奥付のあいだに挟まるだけだった（モバイルで顕著）。
                    固定バーを持つページ（商品詳細）だけが自分の器で逃げ幅を持つ。
                  */}
                  {/* スキップリンク（components/Header.tsx 先頭）の着地点。
                      tabIndex={-1} が無いと href="#main" でスクロールはしてもフォーカスが
                      移らず、次の Tab がヘッダーの先頭へ戻ってしまう。 */}
                  <main id="main" tabIndex={-1} className="flex-1 focus-visible:outline-none">
                    {children}
                  </main>
                  <Footer />
                  <AssistantWidget />
                </AssistantProvider>
              </ToastProvider>
            </CartProvider>
          </ExperimentProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
