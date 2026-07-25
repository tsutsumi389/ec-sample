'use client';

import { btn } from '@/lib/buttonStyles';

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

/**
 * ページ番号セルの共通造形。44px 角に揃え、数字は tnum で桁位置を固定する。
 * 罫は前へ／次へ（btn secondary = border-line-strong）と同じものを当て、
 * 1行の中の枠が「枠あり／枠なし／塗り」の3種に割れないようにする。
 */
const pageCell =
  'inline-flex h-11 min-w-[2.75rem] items-center justify-center rounded-md border px-2 text-body tnum ' +
  'transition-[background-color,color,border-color] duration-fast ease-standard ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2';

export default function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const items = buildPageItems(page, totalPages);

  return (
    // グリッドの終端を1本の罫で締める（誌面のノド）。数字はすべて tnum で縦位置が揃う。
    <nav aria-label="ページ送り" className="mt-14 border-t border-line pt-8 text-center">
      {/*
        390px の版面（実効 358px）には 前へ(72) + 番号5枚(220) + gap + 次へ(72) が入らず、
        flex-wrap が発動して「次へ」だけが2行目に孤立していた。
        sm 未満は番号列を畳んで「前へ / 3 / 5 / 次へ」の3要素に縮約し、
        前へ＝左端・次へ＝右端の1行（justify-between）に固定する。
        sm 以上は従来どおり中央寄せの番号列。折り返しは起こさない（flex-nowrap）。
      */}
      <div className="flex flex-nowrap items-center justify-between gap-1.5 sm:justify-center">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className={`${btn('secondary', 'md')} shrink-0`}
        >
          前へ
        </button>

        {/* sm 未満の現在地表示。下の「全 N ページ中 M ページ目」は sm 未満では
            出さない（同じ情報を 2 書式で重ねない）ので、読み上げ用の全文はここに持つ。 */}
        <p className="tnum text-body text-ink-soft sm:hidden">
          <span aria-hidden="true">
            {page} / {totalPages}
          </span>
          <span className="sr-only">
            全 {totalPages} ページ中 {page} ページ目
          </span>
        </p>

        <div className="hidden items-center gap-1.5 sm:flex">
          {items.map((item) =>
            typeof item === 'number' ? (
              <button
                type="button"
                key={item}
                onClick={() => onChange(item)}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`${item}ページ目`}
                className={`${pageCell} ${
                  item === page
                    ? 'border-brand-600 bg-brand-600 font-medium text-white shadow-paper'
                    : 'border-line-strong text-ink-soft hover:bg-sunken'
                }`}
              >
                {item}
              </button>
            ) : (
              // 省略記号は「読ませる文字」なので ink-faint（AA 未達）は使わない。
              <span
                key={item.ellipsis}
                aria-hidden="true"
                className="inline-flex h-11 select-none items-center px-1 text-body text-ink-muted"
              >
                …
              </span>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className={`${btn('secondary', 'md')} shrink-0`}
        >
          次へ
        </button>
      </div>
      {/* sm 未満は上の「M / N」だけにする（同じ情報の二重表示を避ける）。 */}
      <p className="mt-4 hidden text-caption text-ink-muted sm:block">
        全 <span className="tnum">{totalPages}</span> ページ中{' '}
        <span className="tnum">{page}</span> ページ目
      </p>
    </nav>
  );
}
