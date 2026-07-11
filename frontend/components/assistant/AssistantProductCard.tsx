import Link from 'next/link';
import type { Product } from '@/lib/types';
import ProductPrice from '@/components/ProductPrice';

interface AssistantProductCardProps {
  product: Product;
  /** LLM が付けた提案理由。あれば商品名の下に控えめに表示する。 */
  reason?: string | null;
}

/**
 * チャット内に表示するコンパクトな商品カード。
 * 幅の狭いパネル（PC 380px / モバイル全画面）に収まるよう横並びレイアウトにし、
 * 画像・商品名・価格（ProductPrice 再利用）と任意の提案理由を表示する。
 * クリックで商品詳細へ遷移する（next/link のクライアント遷移なのでパネルは開いたまま）。
 */
export default function AssistantProductCard({ product, reason }: AssistantProductCardProps) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex gap-3 bg-white rounded-lg border border-gray-200 p-2 hover:shadow-md transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-gray-100">
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
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h4 className="text-sm font-medium text-gray-900 line-clamp-1">{product.name}</h4>
        <div className="mt-0.5">
          <ProductPrice product={product} size="sm" />
        </div>
        {reason && <p className="mt-1 text-xs text-gray-500 leading-relaxed line-clamp-2">{reason}</p>}
      </div>
    </Link>
  );
}
