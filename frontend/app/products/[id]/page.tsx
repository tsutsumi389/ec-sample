'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import Spinner from '@/components/Spinner';
import Badge from '@/components/Badge';
import ProductPrice from '@/components/ProductPrice';
import StockLabel from '@/components/StockLabel';
import { ArrowLeftIcon } from '@/components/Icons';
import RatingStars from '@/components/RatingStars';
import WishlistButton from '@/components/WishlistButton';
import RelatedProducts from '@/components/RelatedProducts';
import ProductRecommendations from '@/components/ProductRecommendations';
import ReviewSection from '@/components/ReviewSection';
import { PRODUCT_STATUS_META } from '@/lib/productStatus';

const SELECT_CHEVRON =
  "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const id = params?.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setError('');
    api
      .get<Product>(`/products/${id}`)
      .then((p) => {
        setProduct(p);
        setSelectedImage(0);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true);
        } else {
          setError('商品情報の取得に失敗しました');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddToCart = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setAdding(true);
    setMessage('');
    setError('');
    try {
      await api.post('/cart/items', { product_id: Number(id), quantity });
      setMessage('カートに追加しました');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'カートへの追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-gray-600 flex items-center">
        <Spinner className="mr-2" />
        読み込み中...
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p role="alert" className="text-red-600">
          {notFound ? '商品が見つかりませんでした。' : error || '商品情報の取得に失敗しました。'}
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          商品一覧に戻る
        </Link>
      </div>
    );
  }

  const statusMeta = PRODUCT_STATUS_META[product.status];
  const isOnSale = product.status === 'on_sale';
  const soldOut = isOnSale && product.stock <= 0;
  // メイン画像を先頭に、ギャラリー画像を続けて並べる。
  const gallery = [product.image_url, ...product.images.map((i) => i.image_url)].filter(Boolean);
  const activeImage = gallery[selectedImage] ?? product.image_url;
  // on_sale 以外は購入不可。状態ごとに理由を提示する。
  const purchaseNotice: Record<string, string> = {
    coming_soon: 'この商品は近日発売予定です。公開までもうしばらくお待ちください。',
    suspended: 'この商品は現在販売を停止しています。再開までお待ちください。',
    discontinued: 'この商品は販売を終了しました。',
  };

  const onImageError = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.src.endsWith('/no-image.svg')) return;
    img.onerror = null;
    img.src = '/no-image.svg';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        商品一覧に戻る
      </Link>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="self-start">
          <div className="relative bg-gray-100 rounded-lg p-4 md:p-6">
            <WishlistButton
              productId={product.id}
              className="absolute top-3 right-3 z-10"
            />
            <div className="aspect-[4/3] overflow-hidden rounded-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeImage}
                alt={product.name}
                onError={onImageError}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          {gallery.length > 1 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {gallery.map((src, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImage(idx)}
                  aria-label={`画像${idx + 1}を表示`}
                  aria-current={idx === selectedImage}
                  className={`w-16 h-16 rounded-md overflow-hidden border-2 transition-colors ${
                    idx === selectedImage
                      ? 'border-brand-600'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" onError={onImageError} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {/* グループ1: 商品名・価格・在庫 */}
          <h1 className="text-2xl font-bold leading-tight">{product.name}</h1>
          {product.sku && (
            <p className="mt-1 text-xs text-gray-500">商品コード: {product.sku}</p>
          )}
          <div className="mt-2">
            <RatingStars value={product.avg_rating} count={product.review_count} size="sm" />
          </div>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <ProductPrice product={product} size="3xl" showBadge />
            {isOnSale && <StockLabel stock={product.stock} />}
            {statusMeta.storefrontLabel && (
              <Badge variant={statusMeta.variant}>{statusMeta.storefrontLabel}</Badge>
            )}
          </div>

          {/* グループ2: 説明文 */}
          <p className="mt-8 text-gray-700 leading-relaxed whitespace-pre-wrap">
            {product.description}
          </p>

          {/* グループ3: 購入パネル（on_sale のみ。その他は理由を表示） */}
          {isOnSale ? (
            <div className="mt-8 border border-gray-200 bg-gray-50 rounded-lg p-4 md:p-5">
              <div>
                <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
                  数量
                </label>
                <select
                  id="quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  disabled={soldOut}
                  className="mt-1 w-24 appearance-none border border-gray-300 rounded-md bg-white px-3 py-2.5 pr-9 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundImage: SELECT_CHEVRON,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.625rem center',
                    backgroundSize: '1rem 1rem',
                  }}
                >
                  {soldOut ? (
                    <option value={1}>-</option>
                  ) : (
                    Array.from({ length: Math.min(product.stock, 10) }, (_, i) => i + 1).map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={adding || soldOut}
                className="mt-4 w-full sm:w-auto sm:px-8 bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 text-sm font-medium rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {soldOut ? '在庫切れ' : adding ? '追加中...' : 'カートに追加'}
              </button>
            </div>
          ) : (
            <div className="mt-8 border border-gray-200 bg-gray-50 rounded-lg p-4 md:p-5">
              <p className="text-sm text-gray-700">
                {purchaseNotice[product.status] ?? 'この商品は現在購入いただけません。'}
              </p>
            </div>
          )}

          {message && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-sm"
            >
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>

      <ProductRecommendations productId={product.id} />

      <RelatedProducts productId={product.id} />

      <ReviewSection
        productId={product.id}
        avgRating={product.avg_rating}
        reviewCount={product.review_count}
      />
    </div>
  );
}
