'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { HomeResponse, HomeSection } from '@/lib/types';
import { getRecentlyViewedIds } from '@/lib/recentlyViewed';
import { ProductCardSkeleton, Skeleton } from '@/components/Skeleton';
import BrandHero from '@/components/BrandHero';
import HomeBillboard from '@/components/HomeBillboard';
import SignatureBand from '@/components/SignatureBand';
import ProductLane, { type ProductLaneVariant } from '@/components/ProductLane';
import EmptyState from '@/components/EmptyState';

/** 1リクエストで取得するレーンの上限（契約上 1..12）。表紙＋実際に出す3本ぶんで足りる。 */
const MAX_LANES = 5;

/**
 * ランキング帯を除いた「通常レーン」の上限。
 * ここを緩めると同じ造形のレーンが5本続き、4,000px 以上リズムが変化しない誌面になる。
 * 通常レーンは1本目を lane（生成り地）、2本目を quiet（沈んだ地）にして面を交替させる。
 */
const MAX_PLAIN_LANES = 2;

/** レーンの欧文の柱。key はバックエンドの build_* が付ける名前。 */
const LANE_LABEL: Record<string, string> = {
  cart_reminder: 'Left in your cart',
  top10: 'Ranking',
  for_you: 'For you',
  sale: 'On sale',
};

/**
 * 「No.02 — FOR YOU」の形に組む。表紙が No.01 を名乗るので、レーンは 02 から続ける
 * （号数の約束を誌面の中で回収する）。uppercase は SectionHead 側で当たる。
 *
 * 号数はレーンで終わらせない。ホーム末尾の「カテゴリから探す」「新着アイテム」も
 * 続き番号を名乗る（app/page.tsx が onLaneCount で受け取った本数から算出する）。
 * 途中で番号が消えると、いちばん効いている世界観の仕掛けがそこで自壊する。
 */
function laneEyebrow(key: string, order: number): string {
  const label =
    LANE_LABEL[key] ??
    (key.startsWith('byw')
      ? 'Because you viewed'
      : key.split(':')[0].replace(/_/g, ' ') || 'Selection');
  return `No.${String(order).padStart(2, '0')} — ${label}`;
}

/**
 * 出すレーンを選ぶ。ここが誌面のリズムを決める唯一の場所。
 *  - 新着はページ下部の NewArrivals グリッドが担うのでレーンにしない
 *    （key と title の二段構えで弾く。将来 key が変わっても title で拾える）
 *  - 通常レーンは MAX_PLAIN_LANES 本まで。残りは捨てる（「◯◯を見たあなたに」系が
 *    2本3本と続くと、同じ造形のレーンだけで 4,000px スクロールすることになる）
 *  - 既に出した商品は後続の通常レーンから落とす。ただし ranked は順位が意味を持つので
 *    間引かない（間引くと index+1 が実際の順位とずれる）
 *
 * レンダリング前に本数を数えたい（＝号数を後続セクションへ渡したい）ので、
 * コンポーネントの外の純関数にしてある。
 */
function selectLanes(sections: HomeSection[]) {
  const seenIds = new Set<number>();
  const lanes: { section: HomeSection; variant: ProductLaneVariant }[] = [];
  let plainCount = 0;

  for (const section of sections) {
    if (section.layout === 'hero') continue;
    if (section.key === 'new_arrivals' || section.title === '新着アイテム') continue;

    const ranked = section.layout === 'ranked';
    const items = ranked
      ? section.items
      : section.items.filter((item) => !seenIds.has(item.product.id));
    // 3枚を切ったレーンは横スクロールとして成立しないので、セクションごと出さない。
    if (items.length < 3) continue;
    if (!ranked) {
      if (plainCount >= MAX_PLAIN_LANES) continue;
      plainCount += 1;
    }

    items.forEach((item) => seenIds.add(item.product.id));
    lanes.push({
      section: { ...section, items },
      // 通常レーンは 1本目=生成り地 / 2本目=沈んだ地。ranked を挟んで面が3回変わる。
      variant: ranked ? 'ranked' : plainCount === 1 ? 'lane' : 'quiet',
    });
  }

  return lanes;
}

/**
 * ビルボードの高さを予約するスケルトン。読み込み後の段差を防ぐ。
 * 空の矩形ではなく表紙と同じ骨格（深緑の地・左の見出し列・右の額装）で置くことで、
 * 差し替わった瞬間に版面が動かないようにしている。
 */
export function BillboardSkeleton() {
  // 明滅は体系のトークン animate-breathe（1.6s / ease-standard）。Tailwind 既定の
  // animate-pulse は 2s / cubic-bezier(.4,0,.6,1) でこの体系の duration・easing に属さない。
  const block = 'rounded-md bg-brand-800 animate-breathe motion-reduce:animate-none';
  return (
    <div
      aria-hidden="true"
      className="band-lg flex items-center bg-invert md:min-h-[440px] lg:band-xl lg:min-h-[600px]"
    >
      <div className="wrap-wide w-full md:grid md:grid-cols-12 md:items-center md:gap-x-8 lg:gap-x-10">
        <div className="md:col-span-7">
          <div className="h-px w-12 bg-brand-400/50" />
          <div className={`mt-4 h-3 w-52 ${block}`} />
          <div className={`mt-5 h-9 w-4/5 ${block}`} />
          <div className={`mt-3 h-9 w-3/5 ${block}`} />
          <div className={`mt-6 h-13 w-44 rounded-lg md:mt-8 ${block}`} />
        </div>
        <div className="mt-6 md:col-span-5 md:col-start-8 md:mt-0">
          <div className="rounded-2xl bg-tile p-4 md:p-6">
            <div className="aspect-[16/9] w-full animate-breathe rounded-xl bg-sunken motion-reduce:animate-none md:aspect-square" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * レーン1本分のスケルトン。版面（wrap-wide）とカード幅は ProductLane と揃える。
 * 差し替わった瞬間に紙の左端やカードの列が動かないようにするための骨格。
 */
function LaneSkeleton({ variant = 'lane' }: { variant?: 'lane' | 'ranked' }) {
  const ranked = variant === 'ranked';
  return (
    <div className={ranked ? 'band-lg bg-invert' : 'band'} aria-hidden="true">
      <section className="wrap-wide">
        <Skeleton className={`h-7 w-48 ${ranked ? 'opacity-25' : ''}`} />
        <div className="mt-6 flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={
                ranked
                  ? 'w-[72%] flex-none sm:w-[48%] md:w-[36%] lg:w-[27%]'
                  : 'w-[60%] flex-none sm:w-[38%] md:w-[30%] lg:w-[21%]'
              }
            >
              <ProductCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * ホームのレーン群。GET /home を **1リクエストだけ** 叩き、返ってきた sections を
 * layout に応じて HomeBillboard / ProductLane（lane / ranked / quiet）へ振り分ける。
 *
 * 設計上の制約:
 * - 認証トークンが localStorage 保持のため Server Component 化できない。クライアント fetch のまま、
 *   レーンごとの個別 fetch によるウォーターフォールを避けるべく /home に集約している。
 * - ゲストのパーソナライズは localStorage の閲覧履歴を recently_viewed_ids として送ることで効かせる。
 * - 取得失敗時はブランドヒーローだけを出し、画面を壊さない。
 *
 * 誌面としての並び（この順に固定）:
 *   表紙（深緑・HomeBillboard / BrandHero） → 署名帯（沈んだ地・SignatureBand）
 *   → レーン（生成り地） → ランキング帯（深緑） → レーン（沈んだ地）。
 * 署名帯は取得状態によらず必ず出す。読み込み中でも「日々帖の見開き」が成立し、
 * レーンが差し替わっても上半分が動かないため。
 * 面が 深緑→沈み→生成り→深緑→沈み と入れ替わることが、このホームの唯一のリズム装置。
 */
export default function HomeSections({
  /** 実際に描画したレーンの本数を親へ返す。ホーム末尾の号数（No.05 / No.06）の起点になる。 */
  onLaneCount,
}: {
  onLaneCount?: (n: number) => void;
}) {
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

  // 早期 return より前に置くこと（フックの順序を固定する）。
  const lanes = useMemo(() => selectLanes(sections), [sections]);

  // 読み込み中は骨組みが2本ぶんの場所を予約しているので、その本数を先に伝える。
  // 差し替わった瞬間に「No.06 → No.05」と番号が飛ぶのを防ぐ。
  const laneCount = loading ? 2 : failed ? 0 : lanes.length;
  useEffect(() => {
    onLaneCount?.(laneCount);
  }, [laneCount, onLaneCount]);

  if (loading) {
    return (
      <>
        <BillboardSkeleton />
        <SignatureBand />
        <LaneSkeleton />
        <LaneSkeleton variant="ranked" />
      </>
    );
  }

  // 取得に失敗したときはレーンを諦め、ブランドヒーローだけ出す。
  // 下の商品一覧（NewArrivals）は独立に動くので、ホームとして成立する。
  if (failed) {
    return (
      <>
        <BrandHero />
        <SignatureBand />
      </>
    );
  }

  // hero は先頭の1本だけを採用する（契約上も billboard は1本）。
  const heroSection = sections.find((s) => s.layout === 'hero' && s.items.length > 0);

  return (
    <>
      {/* ゲストのコールドスタート等で billboard が返らない場合はブランドヒーローにフォールバックする。 */}
      {heroSection ? <HomeBillboard item={heroSection.items[0]} /> : <BrandHero />}

      {/* 見開きの右頁。表紙の直後に必ず置く。 */}
      <SignatureBand />

      {lanes.map(({ section, variant }, i) => (
        <ProductLane
          key={section.key}
          title={section.title ?? 'おすすめ'}
          subtitle={section.subtitle}
          // 表紙が No.01 なので、レーンは 02 から続ける。
          eyebrow={laneEyebrow(section.key, i + 2)}
          items={section.items}
          variant={variant}
        />
      ))}

      {sections.length === 0 && (
        <div className="wrap-wide band-lg">
          <EmptyState
            title="ご紹介できる商品がまだありません"
            description="商品が追加されると、あなたに合わせたおすすめがここに並びます。"
          />
        </div>
      )}
    </>
  );
}
