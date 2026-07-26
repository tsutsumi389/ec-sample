'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Product, ProductListResponse } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import SectionHead from '@/components/SectionHead';
import { ProductGridSkeleton } from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import ErrorNotice from '@/components/ErrorNotice';
import HomeSections from '@/components/HomeSections';
import CategoryTiles from '@/components/CategoryTiles';
import { ArrowRightIcon } from '@/components/Icons';
import { PlantMotif } from '@/components/BrandMotifs';
import { newArrivalsGrid } from '@/lib/gridStyles';

/**
 * 新着セクションに出す件数。
 * 8 件 + 巻末の「すべての商品を見る」札 = lg で 12 セル（先頭が 2×2 なので 4+7+1）ちょうど 3 行、
 * 2 列のときは 4 行 + 全幅の札。どの幅でも行が閉じる数として選んでいる。
 * 続きは /products に送るので、ホームで在庫を並べ切る必要はない。
 */
const NEW_ARRIVALS_LIMIT = 8;

/** 先頭カードを大判（2×2）にする最小件数。これ未満だとグリッドに穴が空くため均等割りに戻す。 */
const FEATURED_MIN_ITEMS = 5;

// 一覧・検索がトップページに同居していた頃の URL パラメータ。
// これらが付いていたら /products へ引き継ぐ（旧ブックマーク・共有リンクの互換用）。
const LEGACY_LISTING_PARAMS = ['search', 'category_id', 'sort', 'min_price', 'max_price', 'page'];

/**
 * 旧URL互換リダイレクト。/?search=...&category_id=... のような一覧系パラメータ付きの
 * トップページアクセスは、クエリごと /products に付け替える。
 * useSearchParams を使うため Suspense 配下に置くこと。
 */
function LegacyListingRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasLegacyParams = LEGACY_LISTING_PARAMS.some((key) => searchParams.get(key) !== null);

  useEffect(() => {
    if (!hasLegacyParams) return;
    // 戻るボタンで再度リダイレクトが走らないよう、履歴には残さない（replace）。
    router.replace(`/products?${searchParams.toString()}`);
  }, [hasLegacyParams, router, searchParams]);

  return null;
}

/**
 * 新着セクション。フィルタもページネーションも持たない「見せるだけ」のグリッドで、
 * 続きは /products に任せる。id="products" は BrandHero の「#products」CTA の飛び先として維持。
 *
 * 造形の意図: 先頭 1 枚だけを 2×2 の大判にした非対称グリッド。等間隔に並べると
 * 「カタログの在庫一覧」に見えるため、行送り（gap-y）を列間（gap-x）の 2 倍に取り、
 * 誌面の行間を作っている。最終セルは深緑の「巻末の札」で、グリッドの穴埋めと
 * 一覧への導線を兼ねる。
 */
function NewArrivals({ order }: { order: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    // sort 未指定 = 新着順（バックエンドの既定）。
    api
      .get<ProductListResponse>(`/products?page=1&limit=${NEW_ARRIVALS_LIMIT}`)
      .then((data) => {
        if (cancelled) return;
        setProducts(data.items);
        setTotal(data.total);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : '商品の取得に失敗しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const featured = products.length >= FEATURED_MIN_ITEMS;
  const showTotal = !loading && !error && total > 0;

  return (
    // sticky ヘッダーの下に見出しが潜らないよう、アンカー到達位置をヘッダー高さぶん下げる。
    //
    // 地は沈んだ面（bg-sunken）＋上下ヘアライン（.edge-y）。
    // r2 では「カテゴリから探す」以降が最後まで生成り1色で、PC 1,904px / SP 2,718px の
    // あいだ面がまったく変わらなかった（ページ後半4割でリズム装置が止まっていた）。
    // 直前のカテゴリ帯を生成りのまま残し、ここを沈めることで交替を巻末まで続ける。
    // カードは bg-surface なので、沈んだ地の上ではむしろ浮きが強くなる。
    <section
      id="products"
      className="band-lg edge-y bg-sunken scroll-mt-[calc(var(--header-h)+1rem)]"
    >
      <div className="wrap-wide">
        <SectionHead
          title="新着アイテム"
          eyebrow={`No.${String(order).padStart(2, '0')} — New arrivals`}
          subtitle="季節のおすすめと定番の道具をご紹介します。"
          right={
            showTotal ? (
              <p className="whitespace-nowrap text-body text-ink-muted">
                全 <span className="text-num-lg tnum text-ink">{total}</span> 件
              </p>
            ) : undefined
          }
        />

        <div className="mt-8">
          {loading && <ProductGridSkeleton count={NEW_ARRIVALS_LIMIT} className={newArrivalsGrid} />}

          {!loading && error && (
            <ErrorNotice description={error} onRetry={() => setReloadKey((k) => k + 1)} />
          )}

          {!loading && !error && products.length === 0 && (
            <EmptyState
              title="商品がまだ登録されていません"
              description="商品が入荷したらここに新着として並びます。もうしばらくお待ちください。"
            />
          )}

          {!loading && !error && products.length > 0 && (
            // .stagger（globals.css §3b）で直下の子の animation-delay を 45ms ずつ増やす。
            // 遅れは 8 枚で頭打ちになるので、末尾のカードがいつまでも出ない状態にならない。
            <ul className={`stagger grid [--stagger-step:45ms] ${newArrivalsGrid}`}>
              {products.map((product, i) => (
                // min-w-0 は必須。グリッドアイテムの既定 min-width:auto だと、カード内の
                // 価格行（¥ + 評価）の min-content 幅が列幅の下限になり、モバイルで
                // ページ全体に横スクロールが出る。
                <li
                  key={product.id}
                  className={`h-full min-w-0 animate-rise ${
                    // lg:min-h-0 は大判セルに必須。grid アイテムの既定 min-height:auto は
                    // 中身の min-content 高を下限にするので、大判セルの図版（画像の
                    // 固有比 1:1 × 幅 616px = 616px）が2行ぶんの行高を 315.8 → 349.4px へ
                    // 押し上げ、同じ行の通常カードに 33.6px の余りが転嫁されていた
                    // （実測 1440px: 通常カードの名前↔価格が 15.9 → 49.5px）。
                    // 行高は通常カードが決め、大判セルは与えられた高さに図版で合わせる。
                    featured && i === 0 ? 'lg:col-span-2 lg:row-span-2 lg:min-h-0' : ''
                  }`}
                >
                  <ProductCard
                    product={product}
                    size={featured && i === 0 ? 'lg' : 'md'}
                    trackSection="home_new_arrivals"
                  />
                </li>
              ))}

              {/* 巻末の札。中央のボタン1個をグリッドの最終セルに畳み込むことで、
                  (a) 均質な白カードの連なりを深緑で断ち切り、(b) 4列グリッドの穴を埋め、
                  (c) 「続きは商品一覧で」という導線を誌面の一部として持たせる。 */}
              <li className="col-span-2 min-w-0 animate-rise lg:col-span-1">
                <Link
                  href="/products"
                  className="on-dark group flex h-full flex-col justify-between gap-6 rounded-xl bg-invert p-6 text-on-dark transition-transform duration-base ease-standard hover:-translate-y-1 motion-reduce:hover:translate-y-0"
                >
                  {/* 線画は左揃え・大きめに。中央寄せの小さな図版＋左揃えの文字にすると
                      揃えが二重になり、未完成のプレースホルダに見える。 */}
                  <PlantMotif
                    aria-hidden
                    className="h-20 w-auto shrink-0 select-none self-start text-brand-300 opacity-60 md:h-24"
                  />
                  <span className="block">
                    <span className="block text-eyebrow uppercase font-num text-on-dark-muted">
                      All items
                    </span>
                    <span className="mt-3 block font-mincho text-h3 text-on-dark jp-name">
                      すべての商品を見る
                    </span>
                    <span className="mt-4 flex items-center gap-2 text-body text-on-dark-muted">
                      一覧へ
                      <ArrowRightIcon className="h-4 w-4 transition-transform duration-base ease-standard group-hover:translate-x-1" />
                    </span>
                  </span>
                </Link>
              </li>
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  // 「日々帖」の号数。表紙が No.01、レーンが No.02… と続くので、
  // 巻末の2セクションは「レーン本数 + 2 / + 3」を名乗る。
  // r2 ではレーンの No.04 のあと CATEGORIES / NEW ARRIVALS で番号が消え、
  // 誌面の通し番号という約束が途中で切れていた。
  const [laneCount, setLaneCount] = useState(2);

  return (
    <>
      {/* 旧 /?search=... 形式の互換リダイレクト。描画には関与しない。 */}
      <Suspense fallback={null}>
        <LegacyListingRedirect />
      </Suspense>
      {/* 「最近見た商品」はレーン（key: recently_viewed）が担うため、ここでは出さない。
          RecentlyViewed 自体は商品詳細ページで引き続き使われている。
          並びは 表紙 → 署名帯 → レーン群（HomeSections）→ カテゴリ → 新着 で固定。
          地の交替は 深緑 → 沈み → 生成り → 深緑 → 沈み → 生成り(カテゴリ) → 沈み(新着)。 */}
      <HomeSections onLaneCount={setLaneCount} />
      <CategoryTiles order={laneCount + 2} />
      <NewArrivals order={laneCount + 3} />
    </>
  );
}
