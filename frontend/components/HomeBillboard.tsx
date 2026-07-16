'use client';

import Link from 'next/link';
import type { RecommendationItem } from '@/lib/types';
import { ArrowRightIcon } from '@/components/Icons';
import WishlistButton from '@/components/WishlistButton';

/**
 * ホーム最上部のビルボード（layout: "hero"）。
 * 商品1件と、その商品を薦める理由（reason）を大きく訴求する。
 *
 * 注: 価格は Price/ProductPrice が text-gray-900 固定のため、暗いブランド背景では読めない。
 * ここだけは白文字で自前描画している（打ち消し線つき定価の併記ルールは踏襲）。
 */
export default function HomeBillboard({ item }: { item: RecommendationItem }) {
  const { product, reason } = item;
  const onSale = product.sale_price != null && product.sale_price < product.price;

  return (
    <section className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 text-white">
      {/* モバイルの余白は詰める。ヒーローが縦に伸びると最初のレーンが折り返しの下へ落ち、
          「おすすめで構成したホーム」なのに初期表示で商品が1件も見えなくなるため。 */}
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-12 md:grid md:grid-cols-2 md:items-center md:gap-10">
        <div className="max-w-xl">
          <p className="text-xs md:text-sm font-medium tracking-widest text-brand-100">
            あなたへのおすすめ
          </p>
          <h1 className="mt-3 text-2xl md:text-4xl font-bold leading-tight">{product.name}</h1>
          {reason && (
            <p className="mt-4 text-sm md:text-lg text-brand-50 leading-relaxed">{reason}</p>
          )}

          <div className="mt-5 flex items-baseline gap-3 flex-wrap">
            <p className="text-2xl md:text-3xl font-bold">
              ¥{product.effective_price.toLocaleString()}
            </p>
            {onSale && (
              <span className="text-sm text-brand-100 line-through">
                ¥{product.price.toLocaleString()}
              </span>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Link
              href={`/products/${product.id}`}
              className="inline-flex items-center gap-2 bg-white text-brand-700 px-6 py-3 text-sm font-medium rounded-md hover:bg-brand-50 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
            >
              詳しく見る
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
            {/* 既定のスタイル（白い円形ピル）のまま使う。Tailwind のクラス衝突を避けるため上書きしない。 */}
            <WishlistButton productId={product.id} className="h-11 w-11" />
          </div>
        </div>

        <div className="mt-5 md:mt-0">
          <Link
            href={`/products/${product.id}`}
            aria-label={`${product.name}の商品ページを見る`}
            className="block overflow-hidden rounded-lg bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.image_url}
              alt={product.name}
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src.endsWith('/no-image.svg')) return;
                img.onerror = null;
                img.src = '/no-image.svg';
              }}
              // モバイルは 16/9 に寝かせて縦を稼がない（上のコメント参照）。
              className="aspect-[16/9] md:aspect-[4/3] w-full object-cover transition-transform duration-300 ease-out hover:scale-105"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
