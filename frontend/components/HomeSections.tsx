'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { HomeResponse, HomeSection } from '@/lib/types';
import { getRecentlyViewedIds } from '@/lib/recentlyViewed';
import { ProductCardSkeleton, Skeleton } from '@/components/Skeleton';
import BrandHero from '@/components/BrandHero';
import HomeBillboard from '@/components/HomeBillboard';
import ProductLane from '@/components/ProductLane';
import EmptyState from '@/components/EmptyState';
import { BoxIcon } from '@/components/Icons';

/** 1リクエストで取得するレーンの上限（契約上 1..12）。 */
const MAX_LANES = 8;

/** ビルボードの高さを予約するスケルトン。読み込み後の段差を防ぐ。 */
export function BillboardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 h-[320px] md:h-[420px]"
    />
  );
}

/** レーン1本分のスケルトン。カード幅は ProductLane の lane variant と揃えている。 */
function LaneSkeleton() {
  return (
    <section className="max-w-6xl mx-auto px-4 pt-8" aria-hidden="true">
      <Skeleton className="h-6 w-40" />
      <div className="mt-4 flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-none w-[60%] sm:w-[38%] md:w-[30%] lg:w-[19%]">
            <ProductCardSkeleton />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * ホームのレーン群。GET /home を **1リクエストだけ** 叩き、返ってきた sections を
 * layout に応じて HomeBillboard / ProductLane（ranked / lane）へ振り分ける。
 *
 * 設計上の制約:
 * - 認証トークンが localStorage 保持のため Server Component 化できない。クライアント fetch のまま、
 *   レーンごとの個別 fetch によるウォーターフォールを避けるべく /home に集約している。
 * - ゲストのパーソナライズは localStorage の閲覧履歴を recently_viewed_ids として送ることで効かせる。
 * - 取得失敗時はブランドヒーローだけを出し、画面を壊さない（RecommendationSection と同じ流儀）。
 */
export default function HomeSections() {
  const { user } = useAuth();
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // user を依存に入れ、ログイン状態が変わったら取り直す（パーソナライズが切り替わるため）。
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    const params = new URLSearchParams();
    // 契約上バックエンドが先頭10件までに切り詰めるが、無駄な長さを送らないよう手前でも絞る。
    const recentIds = getRecentlyViewedIds().slice(0, 10);
    if (recentIds.length > 0) params.set('recently_viewed_ids', recentIds.join(','));
    params.set('max_lanes', String(MAX_LANES));

    api
      .get<HomeResponse>(`/home?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setSections(data.sections ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setSections([]);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return (
      <>
        <BillboardSkeleton />
        <LaneSkeleton />
        <LaneSkeleton />
      </>
    );
  }

  // 取得に失敗したときはレーンを諦め、ブランドヒーローだけ出す。
  // 下の商品一覧（ProductListContent）は独立に動くので、ホームとして成立する。
  if (failed) return <BrandHero />;

  // hero は先頭の1本だけを採用する（契約上も billboard は1本）。
  const heroSection = sections.find((s) => s.layout === 'hero' && s.items.length > 0);
  const laneSections = sections.filter((s) => s.layout !== 'hero' && s.items.length > 0);

  return (
    <>
      {/* ゲストのコールドスタート等で billboard が返らない場合はブランドヒーローにフォールバックする。 */}
      {heroSection ? <HomeBillboard item={heroSection.items[0]} /> : <BrandHero />}

      {laneSections.map((section) => (
        <ProductLane
          key={section.key}
          title={section.title ?? 'おすすめ'}
          subtitle={section.subtitle}
          items={section.items}
          variant={section.layout === 'ranked' ? 'ranked' : 'lane'}
        />
      ))}

      {sections.length === 0 && (
        <div className="max-w-6xl mx-auto px-4">
          <EmptyState
            icon={<BoxIcon />}
            title="ご紹介できる商品がまだありません"
            description="商品が追加されると、あなたに合わせたおすすめがここに並びます。"
          />
        </div>
      )}
    </>
  );
}
