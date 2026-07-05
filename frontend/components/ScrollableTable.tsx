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

    const update = () => {
      const overflow = el.scrollWidth > el.clientWidth + 1;
      const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      setHasOverflow(overflow);
      setAtEnd(end);
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
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
