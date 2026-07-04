import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white text-sm text-gray-600">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p>&copy; {new Date().getFullYear()} EC Sample Store</p>
        <nav className="flex items-center gap-4">
          <Link href="/" className="hover:text-indigo-600 underline decoration-gray-300 underline-offset-2">
            商品一覧
          </Link>
          <Link href="/orders" className="hover:text-indigo-600 underline decoration-gray-300 underline-offset-2">
            注文履歴
          </Link>
        </nav>
      </div>
    </footer>
  );
}
