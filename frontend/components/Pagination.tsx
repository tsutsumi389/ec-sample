'use client';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

type PageItem = number | { ellipsis: string };

/**
 * 表示するページ番号の並びを組み立てる。
 * 先頭・末尾は常に表示し、現在ページの前後2ページを表示。
 * それ以外に隙間がある場合は「…」で省略する（隙間が1ページ分だけならその番号を出す）。
 * 例: 1 … 4 5 [6] 7 8 … 20
 */
function buildPageItems(page: number, totalPages: number): PageItem[] {
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let p = page - 2; p <= page + 2; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const items: PageItem[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev) {
      if (p - prev === 2) {
        // 隙間が1ページ分だけなら省略せずその番号を出す
        items.push(prev + 1);
      } else if (p - prev > 2) {
        items.push({ ellipsis: `gap-${prev}` });
      }
    }
    items.push(p);
    prev = p;
  }
  return items;
}

export default function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const items = buildPageItems(page, totalPages);

  return (
    <nav
      aria-label="ページ送り"
      className="flex justify-center items-center gap-1 mt-8 flex-wrap"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        前へ
      </button>
      {items.map((item) =>
        typeof item === 'number' ? (
          <button
            type="button"
            key={item}
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`${item}ページ目`}
            className={`px-3 py-1.5 rounded-md border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
              item === page
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            {item}
          </button>
        ) : (
          <span
            key={item.ellipsis}
            aria-hidden="true"
            className="px-2 py-1.5 text-sm text-gray-400 select-none"
          >
            …
          </span>
        )
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        次へ
      </button>
    </nav>
  );
}
