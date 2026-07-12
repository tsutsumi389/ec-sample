'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError, getToken } from '@/lib/api';
import type { Category, Product } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useCart } from '@/lib/cart-context';
import Badge from '@/components/Badge';
import ProductPrice from '@/components/ProductPrice';
import StockLabel from '@/components/StockLabel';
import { ArrowLeftIcon, PlusIcon, BoxIcon, ArrowPathIcon } from '@/components/Icons';
import RatingStars from '@/components/RatingStars';
import WishlistButton from '@/components/WishlistButton';
import RelatedProducts from '@/components/RelatedProducts';
import ProductRecommendations from '@/components/ProductRecommendations';
import ReviewSection from '@/components/ReviewSection';
import RecentlyViewed from '@/components/RecentlyViewed';
import Breadcrumbs, { type BreadcrumbItem } from '@/components/Breadcrumbs';
import { Skeleton } from '@/components/Skeleton';
import { iconButton } from '@/lib/buttonStyles';
import { recordRecentlyViewed } from '@/lib/recentlyViewed';
import { PRODUCT_STATUS_META } from '@/lib/productStatus';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { refresh } = useCart();
  const id = params?.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
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
        setQuantity(1);
        // 取得に成功した商品だけを閲覧履歴に残す。
        recordRecentlyViewed(p.id);
        // ログイン時のみサーバー側にも閲覧を記録する（パーソナライズ用）。
        // サーバー側はゲストを no-op にするため、未ログイン時は無駄なリクエストを避けて呼ばない。
        // 閲覧記録は補助機能なので fire-and-forget とし、失敗は握りつぶして UI に影響させない。
        if (getToken()) {
          api.post<void>(`/products/${p.id}/view`).catch(() => {});
        }
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

  // パンくず用にカテゴリ名を解決する（category_id があるときのみ）。
  useEffect(() => {
    const categoryId = product?.category_id;
    if (!categoryId) {
      setCategoryName(null);
      return;
    }
    let cancelled = false;
    api
      .get<Category[]>('/categories')
      .then((cats) => {
        if (!cancelled) setCategoryName(cats.find((c) => c.id === categoryId)?.name ?? null);
      })
      .catch(() => {
        if (!cancelled) setCategoryName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [product?.category_id]);

  const handleAddToCart = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setAdding(true);
    setError('');
    try {
      await api.post('/cart/items', { product_id: Number(id), quantity });
      await refresh();
      showToast('カートに追加しました', {
        type: 'success',
        action: { label: 'カートを見る', href: '/cart' },
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'カートへの追加に失敗しました';
      setError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Skeleton className="h-4 w-56" />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="self-start">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="mt-3 flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-16" />
              ))}
            </div>
          </div>
          <div>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="mt-3 h-4 w-32" />
            <Skeleton className="mt-4 h-10 w-44" />
            <div className="mt-8 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="mt-8 h-44 w-full" />
          </div>
        </div>
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
  const maxQty = Math.max(1, Math.min(product.stock, 10));
  const decQty = () => setQuantity((q) => Math.max(1, q - 1));
  const incQty = () => setQuantity((q) => Math.min(maxQty, q + 1));
  // メイン画像を先頭に、ギャラリー画像を続けて並べる。
  const gallery = [product.image_url, ...product.images.map((i) => i.image_url)].filter(Boolean);
  const activeImage = gallery[selectedImage] ?? product.image_url;
  // on_sale 以外は購入不可。状態ごとに理由を提示する。
  const purchaseNotice: Record<string, string> = {
    coming_soon: 'この商品は近日発売予定です。公開までもうしばらくお待ちください。',
    suspended: 'この商品は現在販売を停止しています。再開までお待ちください。',
    discontinued: 'この商品は販売を終了しました。',
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'ホーム', href: '/' },
    ...(product.category_id && categoryName
      ? [{ label: categoryName, href: `/?category_id=${product.category_id}` }]
      : []),
    { label: product.name },
  ];

  const onImageError = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.src.endsWith('/no-image.svg')) return;
    img.onerror = null;
    img.src = '/no-image.svg';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Breadcrumbs items={breadcrumbItems} />

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
                className="w-full h-full object-cover transition-transform duration-300 ease-out hover:scale-105"
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
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-900">この道具について</h2>
            <p className="mt-2 text-gray-700 leading-relaxed whitespace-pre-wrap">
              {product.description}
            </p>
          </div>

          {/* グループ3: 購入パネル（on_sale のみ。その他は理由を表示） */}
          {isOnSale ? (
            <div className="mt-8 rounded-lg border border-gray-200 border-t-2 border-t-brand-600 bg-white p-4 md:p-5">
              <div role="group" aria-label="数量">
                <span className="block text-sm font-medium text-gray-700">数量</span>
                <div className="mt-2 inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={decQty}
                    disabled={soldOut || quantity <= 1}
                    aria-label="数量を1つ減らす"
                    className={iconButton}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="w-4 h-4"
                    >
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <span
                    aria-live="polite"
                    aria-label={`数量 ${quantity}`}
                    className="w-10 text-center text-base font-medium tabular-nums text-gray-900"
                  >
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={incQty}
                    disabled={soldOut || quantity >= maxQty}
                    aria-label="数量を1つ増やす"
                    className={iconButton}
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={adding || soldOut}
                className="mt-4 w-full sm:w-auto sm:px-8 bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 text-sm font-medium rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {soldOut ? '在庫切れ' : adding ? '追加中...' : 'カートに追加'}
              </button>

              {/* 配送・返品の安心情報 */}
              <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                <p className="flex items-center gap-2 text-xs text-gray-600">
                  <BoxIcon className="w-4 h-4 shrink-0 text-brand-600" />
                  14時までのご注文で翌営業日に出荷いたします
                </p>
                <p className="flex items-center gap-2 text-xs text-gray-600">
                  <ArrowPathIcon className="w-4 h-4 shrink-0 text-brand-600" />
                  お届けから30日間の返品保証つき
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4 md:p-5">
              <p className="text-sm text-gray-700">
                {purchaseNotice[product.status] ?? 'この商品は現在購入いただけません。'}
              </p>
            </div>
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

      <RecentlyViewed excludeId={product.id} />
    </div>
  );
}
