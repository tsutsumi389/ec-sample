'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { EVENT_PAGE_VIEW, track, trackClick, trackImpression } from '@/lib/analytics';

/**
 * 画面の行動ログを自動収集する常駐コンポーネント（layout に 1 つだけ置く）。
 *
 * 収集するもの:
 * - ページ遷移ごとの page_view
 * - `data-track-click="キー"` を持つ要素のクリック
 * - `data-track-view="キー"` を持つ要素が画面に入ったこと（impression）
 *
 * どちらの属性も `data-track-props='{"product_id":1}'` で付随情報を渡せる。
 * 属性を書くだけで計測できるので、レイアウト実験で要素を移動しても計測側の修正が要らない。
 */

// 要素が「見られた」とみなす可視割合。1画面に収まらない大きなセクションでも発火するよう
// 控えめにしている（0.5 にすると縦に長いセクションが永久に発火しない）。
const IMPRESSION_THRESHOLD = 0.25;

function parseProps(element: Element): Record<string, unknown> | undefined {
  const raw = element.getAttribute('data-track-props');
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 属性の書き間違いで画面を壊さない。計測されないだけに留める。
  }
  return undefined;
}

export default function AnalyticsTracker() {
  const pathname = usePathname();

  // ページビュー。App Router のクライアント遷移でも pathname の変化で発火する。
  useEffect(() => {
    if (!pathname) return;
    track(EVENT_PAGE_VIEW);
  }, [pathname]);

  // クリックの委譲収集。個々のボタンに onClick を足さなくても属性だけで拾える。
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const element = target.closest('[data-track-click]');
      if (!element) return;
      trackClick(element.getAttribute('data-track-click') || 'unknown', parseProps(element));
    };
    // キャプチャ段階で拾う。途中で stopPropagation されても計測を落とさないため。
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // 表示（impression）の収集。「見られたのに押されなかった」を測れるようにする。
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    // 同じ要素を二重に数えないための記録。ページが変われば作り直され、遷移先で再度数える。
    const seen = new WeakSet<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || seen.has(entry.target)) continue;
          seen.add(entry.target);
          observer.unobserve(entry.target);
          trackImpression(
            entry.target.getAttribute('data-track-view') || 'unknown',
            parseProps(entry.target)
          );
        }
      },
      { threshold: IMPRESSION_THRESHOLD }
    );

    const scan = () => {
      document.querySelectorAll('[data-track-view]').forEach((element) => {
        if (!seen.has(element)) observer.observe(element);
      });
    };
    scan();
    // 非同期に描画される要素（商品一覧やレコメンドなど）も後から拾う。
    const mutationObserver = new MutationObserver(scan);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
