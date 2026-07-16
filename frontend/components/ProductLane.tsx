'use client';

import { useEffect, useRef, useState } from 'react';
import type { RecommendationItem } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/Icons';

/** レーンの描画バリエーション。ranked は順位番号を大きく併記する（社会的証明の可視化）。 */
export type ProductLaneVariant = 'lane' | 'ranked';

interface ProductLaneProps {
  title: string;
  subtitle?: string | null;
  items: RecommendationItem[];
  variant?: ProductLaneVariant;
}

/** 1ステップのスクロール量（可視幅に対する割合）。端の見切れカードを次の先頭に送る。 */
const SCROLL_RATIO = 0.85;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Netflix 型の横スクロールレーン。
 *
 * 実装方針:
 * - カルーセルライブラリは使わず、素の CSS scroll snap（snap-x snap-mandatory + snap-start）で実現する。
 * - 端の検知は ScrollableTable と同じ scrollLeft / clientWidth / scrollWidth の比較で行い、
 *   スクロールできない方向の矢印とフェードを消す。
 * - キーボード: スクロールコンテナ自体を tabIndex={0} にして矢印キーでスクロールできるようにしつつ、
 *   矢印ボタンも通常のボタンとして残す（aria-hidden にしない）。
 * - ProductCard は stretched-link（after:absolute inset-0）でカード全面がリンクになるため、
 *   カードの上に要素を重ねない構造にしている（ranked の順位番号もカードの外に置く）。
 */
export default function ProductLane({ title, subtitle, items, variant = 'lane' }: ProductLaneProps) {
  const scrollRef = useRef<HTMLUListElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const overflow = el.scrollWidth > el.clientWidth + 1;
      setCanScrollLeft(overflow && el.scrollLeft > 1);
      setCanScrollRight(overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // カード画像の読み込みやフォント適用で幅が変わる場合にも追随する
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [items.length]);

  const scrollBy = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * SCROLL_RATIO,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  if (items.length === 0) return null;

  const ranked = variant === 'ranked';

  // カード幅: モバイルで約1.6枚、デスクトップで約5枚が見える。
  // 「次がある」ことが常に見えるよう、割り切れない幅をあえて選んでいる。
  const itemWidth = ranked
    ? 'w-[72%] sm:w-[48%] md:w-[36%] lg:w-[24%]'
    : 'w-[60%] sm:w-[38%] md:w-[30%] lg:w-[19%]';

  const arrowButton =
    'inline-flex items-center justify-center h-9 w-9 rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2';

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label={title}
      className="max-w-6xl mx-auto px-4 pt-8"
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-gray-900 truncate">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {/* 矢印は端で消す。モバイルは指スクロールが自然なので md 以上でのみ表示する。 */}
        <div className="hidden md:flex shrink-0 items-center gap-2">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label={`${title}を前へスクロール`}
              className={arrowButton}
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
          )}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label={`${title}を次へスクロール`}
              className={arrowButton}
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-4">
        <ul
          ref={scrollRef}
          tabIndex={0}
          aria-label={`${title}の商品一覧（横にスクロールできます）`}
          className="flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]"
        >
          {items.map((item, index) => (
            // relative は必須。中の sr-only（position:absolute）の包含ブロックを li に閉じ込める。
            // これが無いと包含ブロックがスクローラの外（下の div.relative）になり、
            // 静的位置（レーン右端の遥か先）に置かれてページ全体に横スクロールが発生する。
            <li key={item.product.id} className={`relative snap-start flex-none ${itemWidth}`}>
              {ranked ? (
                <div className="flex h-full items-stretch gap-2">
                  {/* 順位はカードの外（兄弟）に置く。カード上に重ねると stretched-link を塞ぐため。 */}
                  <div className="flex w-12 shrink-0 items-center justify-center lg:w-16">
                    <span className="sr-only">{index + 1}位</span>
                    <span
                      aria-hidden="true"
                      className="text-4xl font-bold leading-none tabular-nums text-brand-500 lg:text-5xl"
                    >
                      {index + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <ProductCard product={item.product} />
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  <ProductCard product={item.product} />
                  {item.reason && (
                    <p className="mt-2 text-xs leading-relaxed text-gray-500 line-clamp-2">
                      {item.reason}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* スクロールできる方向にだけフェードを出す。クリックを妨げないよう pointer-events-none。
            グラデーションの起点はページ背景（body の bg-gray-50）に合わせる。 */}
        {canScrollLeft && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-gray-50 to-transparent"
          />
        )}
        {canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-gray-50 to-transparent"
          />
        )}
      </div>
    </section>
  );
}
