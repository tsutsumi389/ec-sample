'use client';

import { useEffect, useState } from 'react';
import { onImageError } from '@/lib/productImage';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Product } from '@/lib/types';
import Badge from '@/components/Badge';
import ProductPrice from '@/components/ProductPrice';
import SectionHead from '@/components/SectionHead';
import { Skeleton } from '@/components/Skeleton';
import { isSoldOut, PRODUCT_STATUS_META, SOLD_OUT_BADGE } from '@/lib/productStatus';
import { withWordBreaks } from '@/lib/wordBreak';

interface RelatedProductsProps {
  productId: number;
  /**
   * すでに上のセクション（合わせておすすめ）で出した商品ID。
   * 同じ商品が同じページに二度並ぶのを避けるため、ここに含まれるものは落とす。
   */
  excludeIds?: number[];
  /**
   * すでに同じページに出ている図版（閲覧中の商品・合わせておすすめの image_url）。
   * 商品SVGは10種しかないので、id が違っても絵が同じ行が上下に並ぶ。
   * カード内で最も面積の大きい要素が重複すると「同じ判子を2回押した」ように見えるため、
   * **図版の重複でも落とす**（セクション内どうしの重複もここで潰す）。
   */
  excludeImageUrls?: string[];
}

/**
 * 商品詳細ページ下部の「関連商品」(最大4件)。
 * GET /products/{id}/related の結果が0件の場合は何も表示しない。
 *
 * 造形について:
 * 直前の「合わせておすすめ」と同じ4枚カードグリッドを繰り返すと、ページ下半分が
 * 同じ絵の水増しに見える。ここは「同じ棚に並ぶもの」を淡々と数える**索引**として、
 * ヘアラインで区切った一列の表組みにしている（深度は §5-4 手段②＝罫だけ）。
 * 役割の違い（提案 ↔ 索引）が造形の違いとして読めるようにするための分岐。
 */
export default function RelatedProducts({
  productId,
  excludeIds,
  excludeImageUrls,
}: RelatedProductsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Product[]>(`/products/${productId}/related`)
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

  // 除外は描画時に行う。excludeIds は親の fetch 完了で後から届くため、
  // 取得の effect の依存に入れると無駄な再取得やループの元になる。
  const excluded = new Set(excludeIds ?? []);
  const seenImages = new Set(excludeImageUrls ?? []);
  const visible: Product[] = [];
  for (const p of products) {
    if (excluded.has(p.id) || seenImages.has(p.image_url)) continue;
    seenImages.add(p.image_url);
    visible.push(p);
  }

  // 読み込み中は見出し＋スケルトンで高さを確保する。0件が確定したときのみ非表示にする。
  if (loading) {
    return (
      <section>
        <SectionHead title="関連商品" eyebrow="RELATED" className="mb-6" />
        <ul className="divide-y divide-line border-y border-line" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center gap-4 py-4 md:gap-6 md:py-5">
              <Skeleton className="h-16 w-16 shrink-0 rounded-md md:h-20 md:w-20" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-3/4" />
              </div>
              <Skeleton className="h-5 w-20 shrink-0" />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (visible.length === 0) return null;

  return (
    <section>
      <SectionHead
        title="関連商品"
        eyebrow="RELATED"
        subtitle="同じ棚に並ぶもの。"
        className="mb-6"
      />
      {/* 罫だけで区切った表組み。行は全幅なので、件数が何件でも下端が揃う。
          出現の段は親の .stagger が配る（子ごとの inline style を持たない）。 */}
      <ul className="stagger divide-y divide-line border-y border-line">
        {visible.map((product) => {
          const statusMeta = PRODUCT_STATUS_META[product.status];
          const soldOut = isSoldOut(product);
          return (
            <li key={product.id} className="animate-rise">
              <Link
                href={`/products/${product.id}`}
                // この枠は ProductCard を使わない独自の行なので、計測もここに置く
                // （鍵は product_card に揃え、section で枠を見分ける）。
                data-track-click="product_card"
                data-track-view="product_card"
                data-track-props={JSON.stringify({ product_id: product.id, section: 'related' })}
                className="group flex items-center gap-4 rounded-md py-4 transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 md:gap-6 md:py-5"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-tile md:h-20 md:w-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.image_url}
                    alt=""
                    onError={onImageError}
                    className="h-full w-full object-cover transition-transform duration-slow ease-entrance group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-h3 text-ink jp-name group-hover:text-brand-700">
                      {withWordBreaks(product.name)}
                    </span>
                    {soldOut ? (
                      <Badge variant={SOLD_OUT_BADGE.variant}>{SOLD_OUT_BADGE.label}</Badge>
                    ) : (
                      statusMeta.storefrontLabel && (
                        <Badge variant={statusMeta.variant}>{statusMeta.storefrontLabel}</Badge>
                      )
                    )}
                  </p>
                  <p className="mt-1 line-clamp-1 text-caption text-ink-muted">
                    {product.description}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <ProductPrice product={product} size="lg" className="justify-end" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
