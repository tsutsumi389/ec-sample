import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-4">ページが見つかりません</h1>
      <p className="text-gray-600 mb-6">
        お探しのページは存在しないか、移動または削除された可能性があります。
      </p>
      <Link href="/" className="text-brand-600 hover:underline">
        トップに戻る
      </Link>
    </div>
  );
}
