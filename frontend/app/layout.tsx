import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'EC Sample Store',
  description: 'Next.js + FastAPI EC サンプルサイト',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
        <AuthProvider>
          <Header />
          <main className="flex-1">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
