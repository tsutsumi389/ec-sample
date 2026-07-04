import Link from 'next/link';
import type { Product } from '@/lib/types';
import Price from '@/components/Price';

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="group block bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
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
          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
        />
      </div>
      <div className="p-3">
        <h2 className="text-sm font-medium text-gray-900 line-clamp-2">{product.name}</h2>
        <Price value={product.price} size="lg" as="p" className="mt-1" />
        <p className="text-xs text-gray-600">
          {product.stock > 0 ? `在庫: ${product.stock}` : '在庫切れ'}
        </p>
      </div>
    </Link>
  );
}
