import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * パンくずリスト。最後の要素を現在地（aria-current="page"）として扱う。
 * 余白（mb 等）は呼び出し側で付与する。
 * 誌面の「柱」として細い字面（text-caption）と薄い区切りで軽く置き、見出しの邪魔をしない。
 */
export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="パンくずリスト" className="text-caption">
      {/* リンクの上下 padding でタップ領域を稼ぐぶん、-my-1.5 で見た目の行高を戻す */}
      <ol className="-my-1.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-x-1 min-w-0">
              {index > 0 && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5 shrink-0 text-line-strong"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {item.href && !isLast ? (
                /* .hit（::after inset -6px）で見た目を変えずに当たり判定を広げる。
                   実測: 22(文字丈) + py-1.5(12) = 34px、+12px で **46px**。
                   横は -mx-1 と合わせて左右 10px 広がるが、項目間は
                   gap-x-1 + 区切り 14px + gap-x-1 = 実効 14px あるので重ならない。 */
                <Link
                  href={item.href}
                  className="hit -mx-1 block max-w-[12rem] truncate rounded px-1 py-1.5 text-ink-muted transition-colors duration-fast ease-standard hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className="block max-w-[16rem] truncate py-1.5 text-ink"
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
