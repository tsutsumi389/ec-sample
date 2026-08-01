'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon } from './Icons';

interface ScrollableTableProps {
  children: ReactNode;
}

/**
 * 横スクロールが必要なテーブル（管理画面など）を、モバイル幅でも
 * 「スクロールできる」ことに気づけるようにラップするコンテナ。
 * - コンテンツが実際にはみ出している場合のみヒントを表示する
 * - 右端まで見えたらフェードは消える
 */
export default function ScrollableTable({ children }: ScrollableTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // 寸法（scrollWidth / clientWidth）はレイアウトの同期読みなので、スクロール中は読まない。
    // 動くのはリサイズのときだけで、それは下の resize が拾う。
    let scrollWidth = 0;
    let clientWidth = 0;

    const update = () => {
      setHasOverflow(scrollWidth > clientWidth + 1);
      setAtEnd(el.scrollLeft + clientWidth >= scrollWidth - 1);
    };

    const measure = () => {
      scrollWidth = el.scrollWidth;
      clientWidth = el.clientWidth;
      update();
    };

    measure();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', measure);
    // 中身の入れ替え（行の増減・フォント適用）でも測り直す。ProductLane と同じ手当て。
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div>
      {hasOverflow && (
        <p className="px-4 pt-3 pb-1 text-xs text-gray-600 sm:hidden flex items-center gap-1.5">
          <ArrowLeftIcon className="w-3 h-3" />
          横にスクロールできます
          <ArrowRightIcon className="w-3 h-3" />
        </p>
      )}
      <div className="relative">
        <div ref={scrollRef} className="overflow-x-auto">
          {children}
        </div>
        {hasOverflow && !atEnd && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent"
          />
        )}
      </div>
    </div>
  );
}
