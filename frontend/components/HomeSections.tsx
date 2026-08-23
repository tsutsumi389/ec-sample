'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { HomeResponse, HomeSection } from '@/lib/types';
import { getRecentlyViewedIds } from '@/lib/recentlyViewed';
import { ProductCardSkeleton, PULSE, Skeleton } from '@/components/Skeleton';
import BrandHero from '@/components/BrandHero';
import HomeBillboard from '@/components/HomeBillboard';
import SignatureBand from '@/components/SignatureBand';
import ProductLane, { LANE_STYLES, type ProductLaneVariant } from '@/components/ProductLane';
import EmptyState from '@/components/EmptyState';

/** 1リクエストで取得するレーンの上限（契約上 1..12）。表紙＋実際に出す3本ぶんで足りる。 */
const MAX_LANES = 5;

/**
 * ランキング帯を除いた「通常レーン」の上限。
 * ここを緩めると同じ造形のレーンが5本続き、4,000px 以上リズムが変化しない誌面になる。
 */
const MAX_PLAIN_LANES = 2;

/**
 * ホームの別の器が描くので、レーンにはしないセクションの key。
 * 新着は app/page.tsx 末尾の NewArrivals グリッドが担う。
 *
 * ⚠ 判定に表示文字列（section.title）を混ぜないこと。バックエンドが表題を変えた瞬間に
 * 無言で効かなくなり（＝同じ商品がホームに二度出る）、逆に別レーンがたまたま同じ表題を
 * 名乗ると原因不明の消失になる。どちらも型でもテストでも捕まらない。key は lib/types.ts が
 * 「同一レスポンス内で一意」と契約している唯一の識別子。
 */
const LANES_RENDERED_ELSEWHERE = ['new_arrivals'];

/** レーンの欧文の柱。key はバックエンドの build_* が付ける名前。 */
const LANE_LABEL: Record<string, string> = {
  cart_reminder: 'Left in your cart',
  top10: 'Ranking',
  for_you: 'For you',
  sale: 'On sale',
};

/**
 * 「No.02 — FOR YOU」の形に組む。表紙が No.01 を名乗るので、レーンは 02 から続ける。
 * uppercase は SectionHead 側で当たる。
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
 * 既に出した商品は後続の通常レーンから落とすが、ranked だけは間引かない
 * （間引くと index+1 が実際の順位とずれる）。
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
    if (LANES_RENDERED_ELSEWHERE.includes(section.key)) continue;

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
 * ビルボードの高さを予約するスケルトン。空の矩形ではなく表紙と同じ骨格（深緑の地・
 * 左の見出し列・右の額装）で置き、差し替わった瞬間に版面が動かないようにする。
 */
export function BillboardSkeleton() {
  // 明滅のトークンは Skeleton.tsx の PULSE（根拠もそちらに一本化してある）。地色だけが違う。
  const block = `rounded-md bg-brand-800 ${PULSE}`;
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
            <div className={`aspect-[16/9] w-full rounded-xl bg-sunken md:aspect-square ${PULSE}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * レーン1本分のスケルトン。版面（wrap-wide）とカード幅は ProductLane と揃える
 * （差し替わった瞬間に紙の左端やカードの列を動かさないため）。
 */
function LaneSkeleton({ variant = 'lane' }: { variant?: 'lane' | 'ranked' }) {
  const ranked = variant === 'ranked';
  // カード幅は ProductLane と**同じ表**から引く。写しにすると、片方だけ直したときに
  // 読み込み完了の瞬間にレーンが横へ跳ねる。
  return (
    <div className={ranked ? 'band-lg bg-invert' : 'band'} aria-hidden="true">
      <section className="wrap-wide">
        <Skeleton className={`h-7 w-48 ${ranked ? 'opacity-25' : ''}`} />
        <div className="mt-6 flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`flex-none ${LANE_STYLES[variant].item}`}>
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
 * 誌面としての並びはこの順に固定する: 表紙（深緑） → 署名帯（沈んだ地） →
 * レーン（生成り地） → ランキング帯（深緑） → レーン（沈んだ地）。面が入れ替わることが
 * このホームの唯一のリズム装置。署名帯は取得状態によらず必ず出す（読み込み中でも
 * 「日々帖の見開き」が成立し、レーンが差し替わっても上半分が動かない）。
 */
export default function HomeSections({
  /** 実際に描画したレーンの本数を親へ返す。ホーム末尾の号数（No.05 / No.06）の起点になる。 */
  onLaneCount,
}: {
  onLaneCount?: (n: number) => void;
}) {
  const { user, loading: authLoading } = useAuth();
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // user を依存に入れ、ログイン状態が変わったら取り直す（パーソナライズが切り替わるため）。
  // ただし認証が確定するまでは引かない。AuthProvider は null → 確定 の2段階で user を
  // 決めるので、待たないとログイン済みの訪問者は /home（このサイトで最も重い口）を
  // 2本投げ、1本目のゲスト向けレスポンスを捨ててスケルトンに巻き戻る。
  useEffect(() => {
    if (authLoading) return;
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
  }, [authLoading, user]);

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

  // 失敗時はレーンを諦める。下の商品一覧（NewArrivals）は独立に動くのでホームは成立する。
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
          eyebrow={laneEyebrow(section.key, i + 2)}
          items={section.items}
          variant={variant}
          // レーン key をそのまま計測の枠名にする（1 レーン = 1 アルゴリズムなので、
          // これで「どの推薦が押されたか」をレーン単位で比べられる）。
          trackSection={section.key}
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
