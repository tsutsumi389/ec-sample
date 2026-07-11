/**
 * 読み込み中のプレースホルダ表示。
 * 共通の Skeleton ブロックと、ProductCard の構造に合わせたカード・グリッドを提供する。
 */

/** 汎用スケルトンブロック。className で形・サイズを調整する。 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={`rounded-md bg-gray-200 animate-pulse ${className ?? ''}`} />;
}

/** ProductCard と同じ骨格のカードスケルトン。 */
export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="aspect-[4/3] bg-gray-200 animate-pulse" />
      <div className="flex flex-1 flex-col p-3">
        {/* タイトル行 */}
        <Skeleton className="h-5 w-3/4" />
        {/* 星行 */}
        <Skeleton className="mt-2 h-4 w-1/2" />
        {/* 価格行 */}
        <div className="mt-auto pt-2">
          <Skeleton className="h-6 w-2/5" />
        </div>
      </div>
    </div>
  );
}

/** ProductCardSkeleton を並べた商品グリッドのスケルトン。 */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
