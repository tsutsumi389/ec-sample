'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Product } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import SectionHead from '@/components/SectionHead';
import { ProductGridSkeleton } from '@/components/Skeleton';
import { ArrowRightIcon } from '@/components/Icons';
import { MOTIFS, type MotifName } from '@/components/BrandMotifs';

/**
 * 列組みは **件数によらず 4 列で固定**する。
 *
 * 以前は件数に応じて `lg:mx-auto lg:w-1/2` のように ul ごと版面の中央へ絞っていた。
 * カード寸法は一定に保てたが、見出し・説明文が版面左端（x=176）に立つのに対して
 * カードだけが中央（x=448）に寄り、1つの帯に柱が2本立っていた。
 * 4列固定なら寸法も一定のまま、左端は見出しと同じ柱に乗る。
 * 余った列は「もっと見る」の札で埋める（下の MORE_TILE_SPAN）。
 */
const goesWellGrid = 'grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4';

/**
 * 余った列を埋める札の占有列数。件数 → クラスの静的表
 * （Tailwind の content 走査に載せるため、連結で組み立てない）。
 * モバイル(2列)・lg(4列)のどちらでも最終行がちょうど埋まる値にしてある。
 */
const MORE_TILE_SPAN: Record<number, string> = {
  1: 'col-span-1 lg:col-span-3',
  2: 'col-span-2 lg:col-span-2',
  3: 'col-span-1 lg:col-span-1',
};

/** 実際に画面へ出した商品の識別子。親が下のセクションから同じ絵を落とすために使う。 */
export interface ShownProducts {
  ids: number[];
  imageUrls: string[];
}

interface ProductRecommendationsProps {
  productId: number;
  /**
   * すでに同じページに出ている図版（閲覧中の商品の image_url など）。
   * 商品SVGは10種しかなく、同じ絵が隣り合うと「描画バグ」に見えるため、
   * id ではなく **図版** の重複でも落とす。
   */
  excludeImageUrls?: string[];
  /** 末尾の札のリンク先に使う。無ければ商品一覧へ送る。 */
  categoryId?: number | null;
  /** 末尾の札に置く線画（扉と同じカテゴリ図案）。'none' なら図版を持たせない。 */
  motif?: MotifName | 'none';
  /**
   * 実際に描画した商品の id と image_url を親へ返す。
   * 呼び出し側でこれを RelatedProducts の除外条件に渡す。
   */
  onShownChange?: (shown: ShownProducts) => void;
}

/**
 * 商品詳細ページに表示する「合わせておすすめ」(最大4件)。
 * GET /products/{id}/recommendations の結果が0件の場合は何も表示しない。
 *
 * 面について:
 * PDP は「扉（沈んだ地）→ 主部（生成り）」のあと最後まで生成り1色で、
 * 3,000px 超に面の交替がまったく無かった。ホームのランキングと同じ
 * 深緑のフルブリード帯をここに1本置き、同じ判型記号でページ後半に段落を作る。
 */
export default function ProductRecommendations({
  productId,
  excludeImageUrls,
  categoryId,
  motif = 'none',
  onShownChange,
}: ProductRecommendationsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // 親から渡るコールバックは毎レンダー参照が変わり得るので ref に退避し、
  // fetch の effect が productId 以外で再実行されないようにする。
  const onShownChangeRef = useRef(onShownChange);
  useEffect(() => {
    onShownChangeRef.current = onShownChange;
  }, [onShownChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Product[]>(`/products/${productId}/recommendations`)
      .then((items) => {
        if (!cancelled) setProducts(items);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // 除外・重複落としは描画時に行う（excludeImageUrls は後から届くため、
  // 取得の effect の依存に入れると無駄な再取得やループの元になる）。
  const excludeKey = (excludeImageUrls ?? []).join('\n');
  const visible = useMemo(() => {
    const seen = new Set(excludeKey ? excludeKey.split('\n') : []);
    const out: Product[] = [];
    for (const p of products) {
      if (seen.has(p.image_url)) continue;
      seen.add(p.image_url);
      out.push(p);
    }
    return out;
  }, [products, excludeKey]);

  useEffect(() => {
    onShownChangeRef.current?.({
      ids: visible.map((p) => p.id),
      imageUrls: visible.map((p) => p.image_url),
    });
  }, [visible]);

  // 読み込み中は見出し＋スケルトンで高さを確保する。0件が確定したときのみ非表示にする。
  if (loading) {
    return (
      <section className="on-dark band-lg bg-invert text-on-dark">
        <div className="wrap">
          <SectionHead title="合わせておすすめ" eyebrow="GOES WELL WITH" tone="onDark" />
          <div className="mt-6">
            <ProductGridSkeleton count={4} className={goesWellGrid} />
          </div>
        </div>
      </section>
    );
  }

  if (visible.length === 0) return null;

  // 4列に満たないぶんを埋める札。件数が 4 のときは出さない（行がすでに埋まっている）。
  const tileSpan = MORE_TILE_SPAN[visible.length];
  const MoreMotif = motif !== 'none' ? MOTIFS[motif] : null;
  const moreHref = categoryId ? `/categories/${categoryId}` : '/products';

  return (
    <section className="on-dark band-lg bg-invert text-on-dark">
      <div className="wrap">
        <SectionHead
          title="合わせておすすめ"
          eyebrow="GOES WELL WITH"
          subtitle="いっしょに使うと、日々がすこし楽になる道具。"
          tone="onDark"
        />
        {/* 出現の段は親の .stagger が配る（子ごとの inline style を持たない）。
            `motion-safe:` は付けない: media variant の `animation:` ショートハンドが
            生成 CSS の最後に出て .stagger の animation-delay を巻き戻すため。
            低モーション環境は globals.css §5 の全称ガードが止める。 */}
        <ul className={`stagger mt-6 grid items-stretch ${goesWellGrid}`}>
          {visible.map((product) => (
            <li key={product.id} className="h-full min-w-0 animate-rise">
              <ProductCard product={product} tone="onDark" trackSection="recommendations" />
            </li>
          ))}

          {/* 巻末の札。図版の重複落としで件数が減っても行の右側が空かないよう、
              余った列をそのまま「次の一手」に使う（ホームの新着グリッド末尾と同じ装置）。
              地は深緑帯そのものなので、面ではなく細い枠で1段持ち上げる。 */}
          {tileSpan && (
            <li className={`min-w-0 animate-rise ${tileSpan}`}>
              <Link
                href={moreHref}
                className="group relative flex h-full flex-col justify-end overflow-hidden rounded-xl bg-white/[0.04] p-6 ring-1 ring-white/10 transition-transform duration-base ease-standard hover:-translate-y-1 motion-reduce:hover:translate-y-0"
              >
                {/* 線画は扉（PageMasthead）と同じ「隅で裁ち落とす透かし」の作法で置く。
                    札の幅は件数で 1〜3 列に変わるので、寸法に依存しない置き方にする。 */}
                {MoreMotif && (
                  <MoreMotif
                    aria-hidden
                    className="pointer-events-none absolute -top-6 right-2 h-32 w-auto select-none text-brand-300 opacity-[0.16] md:-top-8 md:right-6 md:h-40"
                  />
                )}
                <span className="relative block">
                  <span className="block text-eyebrow uppercase font-num text-on-dark-muted">
                    More
                  </span>
                  <span className="mt-3 block font-mincho text-h3 text-on-dark jp-name">
                    {categoryId ? '同じ棚をのぞく' : 'すべての商品を見る'}
                  </span>
                  <span className="mt-4 flex items-center gap-2 text-body text-on-dark-muted">
                    {categoryId ? 'カテゴリの一覧へ' : '商品一覧へ'}
                    <ArrowRightIcon className="h-4 w-4 transition-transform duration-base ease-standard group-hover:translate-x-1" />
                  </span>
                </span>
              </Link>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
