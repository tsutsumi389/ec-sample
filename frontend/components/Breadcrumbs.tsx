import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * パンくずリスト。最後の要素を現在地（aria-current="page"）として扱う。
 * 余白（mb 等）は呼び出し側で付与する。
 */
export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="パンくずリスト" className="text-xs sm:text-sm">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-x-1.5 min-w-0">
              {index > 0 && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5 shrink-0 text-gray-300"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="block max-w-[12rem] truncate text-gray-500 hover:text-brand-600 rounded transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className="block max-w-[16rem] truncate text-gray-900"
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
