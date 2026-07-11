import Link from 'next/link';
import { btnPrimary } from '@/lib/buttonStyles';

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center">
      {/* 道具モチーフ（虫めがね付きの箱）の小さなイラスト */}
      <svg
        viewBox="0 0 120 120"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="mx-auto mb-6 h-24 w-24 text-brand-400"
      >
        <path d="M20 44 60 26l40 18-40 18-40-18Z" />
        <path d="M20 44v34l40 18 40-18V44" />
        <path d="M60 62v34" />
        <circle cx="78" cy="72" r="11" />
        <path d="m86 80 9 9" />
      </svg>

      <p className="text-6xl sm:text-7xl font-bold tracking-tight text-brand-600">404</p>
      <h1 className="mt-4 text-xl font-bold text-gray-900">お探しの道具は見つかりませんでした</h1>
      <p className="mt-3 text-gray-600">
        ページが移動または削除されたのかもしれません。
        <br className="hidden sm:block" />
        よろしければ、トップから道具をゆっくり眺めてみてください。
      </p>

      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link href="/" className={btnPrimary}>
          トップへ戻る
        </Link>
        <Link href="/?sort=newest" className="text-sm text-brand-600 font-medium hover:underline">
          新着の道具を見る →
        </Link>
      </div>
    </div>
  );
}
