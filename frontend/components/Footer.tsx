import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white text-sm text-gray-600">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p>&copy; 2026 Hibino — 日々の暮らしの道具店</p>
        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-block px-2 py-2 -m-2 rounded-md text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-brand-600 hover:decoration-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            商品一覧
          </Link>
          <Link
            href="/orders"
            className="inline-block px-2 py-2 -m-2 rounded-md text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-brand-600 hover:decoration-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            注文履歴
          </Link>
        </nav>
      </div>
    </footer>
  );
}
