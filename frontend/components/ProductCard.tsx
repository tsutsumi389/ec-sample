import Link from 'next/link';
import type { Product } from '@/lib/types';
import ProductPrice from '@/components/ProductPrice';
import Badge from '@/components/Badge';
import StockLabel from '@/components/StockLabel';
import RatingStars from '@/components/RatingStars';
import WishlistButton from '@/components/WishlistButton';
import { PRODUCT_STATUS_META } from '@/lib/productStatus';

export default function ProductCard({ product }: { product: Product }) {
  const statusMeta = PRODUCT_STATUS_META[product.status];
  // on_sale のときだけ在庫切れオーバーレイを出す。その他の状態は状態バッジを優先。
  const soldOut = product.status === 'on_sale' && product.stock <= 0;

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex h-full flex-col bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-150"
    >
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
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
          className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
        />
        <WishlistButton productId={product.id} className="absolute top-2 left-2" />
        {statusMeta.storefrontLabel && (
          <Badge variant={statusMeta.variant} className="absolute top-2 right-2">
            {statusMeta.storefrontLabel}
          </Badge>
        )}
        {soldOut && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <Badge variant="neutral">在庫切れ</Badge>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-base font-medium text-gray-900 line-clamp-1">{product.name}</h3>
        <div className="mt-1">
          <RatingStars value={product.avg_rating} count={product.review_count} size="sm" />
        </div>
        <div className="mt-auto pt-2">
          <ProductPrice product={product} size="lg" showBadge />
          {product.status === 'on_sale' && (
            <div className="mt-1">
              <StockLabel stock={product.stock} />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
