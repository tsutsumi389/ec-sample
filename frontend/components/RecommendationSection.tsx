'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { RecommendationItem, RecommendationResponse } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import ProductCard from '@/components/ProductCard';
import { ProductGridSkeleton } from '@/components/Skeleton';

/**
 * トップページに表示するおすすめ商品セクション。
 * GET /recommendations/home の source によって見出しと表示内容を切り替える。
 * - source==='llm': 「あなたへのおすすめ」。各商品の下に生成理由(reason)を表示。
 * - source==='fallback': 「人気の商品」。reason は表示しない。
 * 0件・エラー時は何も表示しない（RelatedProducts と同じ流儀）。
 */
export default function RecommendationSection() {
  const { user } = useAuth();
  const [source, setSource] = useState<RecommendationResponse['source']>('fallback');
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);

  // user を依存に入れ、ログイン状態が変わったら再取得する。
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<RecommendationResponse>('/recommendations/home?limit=8')
      .then((data) => {
        if (cancelled) return;
        setSource(data.source);
        setItems(data.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // 読み込み中は見出し＋スケルトンで高さを予約し、レイアウトのがたつきを防ぐ。
  // 取得結果が0件のときだけセクションごと非表示にする。
  if (!loading && items.length === 0) return null;

  const heading = source === 'llm' ? 'あなたへのおすすめ' : '人気の商品';

  return (
    <section className="max-w-6xl mx-auto px-4 pt-8">
      <h2 className="text-xl font-bold text-gray-900">{heading}</h2>
      {loading ? (
        <div className="mt-4">
          <ProductGridSkeleton count={8} />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <div key={item.product.id} className="flex flex-col">
              <ProductCard product={item.product} />
              {source === 'llm' && item.reason && (
                <p className="mt-2 text-xs text-gray-500 leading-relaxed line-clamp-2">
                  {item.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
