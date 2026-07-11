import Link from 'next/link';

const footerLinkClass =
  'inline-block rounded text-gray-600 hover:text-brand-600 hover:underline decoration-gray-300 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2';

export default function Footer() {
  return (
    <footer className="border-t border-brand-100 bg-white text-sm text-gray-600">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* ブランド */}
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-lg font-bold text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
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
            <p className="mt-3 leading-relaxed text-gray-500">
              使うたびに気分が上向く、暮らしの道具を。
            </p>
          </div>

          {/* お買い物 */}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">お買い物</h2>
            <ul className="space-y-2">
              <li>
                <Link href="/" className={footerLinkClass}>
                  商品一覧
                </Link>
              </li>
              <li>
                <Link href="/cart" className={footerLinkClass}>
                  カート
                </Link>
              </li>
              <li>
                <Link href="/orders" className={footerLinkClass}>
                  注文履歴
                </Link>
              </li>
              <li>
                <Link href="/wishlist" className={footerLinkClass}>
                  お気に入り
                </Link>
              </li>
            </ul>
          </div>

          {/* アカウント */}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">アカウント</h2>
            <ul className="space-y-2">
              <li>
                <Link href="/login" className={footerLinkClass}>
                  ログイン
                </Link>
              </li>
              <li>
                <Link href="/register" className={footerLinkClass}>
                  会員登録
                </Link>
              </li>
              <li>
                <Link href="/account" className={footerLinkClass}>
                  アカウント設定
                </Link>
              </li>
            </ul>
          </div>

          {/* ご案内 */}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ご案内</h2>
            <ul className="space-y-2 text-gray-500">
              <li>配送について</li>
              <li>返品・交換について</li>
              <li>お支払い方法</li>
              <li>よくあるご質問</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-brand-100 pt-6 text-gray-400">
          <p>&copy; 2026 Hibino — 日々の暮らしの道具店</p>
        </div>
      </div>
    </footer>
  );
}
