'use client';

import { useCallback, useEffect, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError, getToken } from '@/lib/api';
import type { Category, Product } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useVariant } from '@/lib/experiment-context';
import { useToast } from '@/lib/toast-context';
import { useCart } from '@/lib/cart-context';
import Badge from '@/components/Badge';
import ProductPrice from '@/components/ProductPrice';
import StockLabel from '@/components/StockLabel';
import {
  ArrowLeftIcon,
  PlusIcon,
  BoxIcon,
  ArrowPathIcon,
  PackageIcon,
  CheckCircleIcon,
} from '@/components/Icons';
import RatingStars from '@/components/RatingStars';
import WishlistButton from '@/components/WishlistButton';
import RelatedProducts from '@/components/RelatedProducts';
import ProductRecommendations, { type ShownProducts } from '@/components/ProductRecommendations';
import ReviewSection from '@/components/ReviewSection';
import ProductQA from '@/components/ProductQA';
import RecentlyViewed from '@/components/RecentlyViewed';
import { type BreadcrumbItem } from '@/components/Breadcrumbs';
import PageMasthead from '@/components/PageMasthead';
import { motifForCategory } from '@/lib/categoryMotifs';
import SectionHead from '@/components/SectionHead';
import { Skeleton } from '@/components/Skeleton';
import { btn, iconBtn } from '@/lib/buttonStyles';
import { recordRecentlyViewed } from '@/lib/recentlyViewed';
import { PRODUCT_STATUS_META } from '@/lib/productStatus';
import { EVENT_ADD_TO_CART, EVENT_VIEW_ITEM, track } from '@/lib/analytics';
import { addToGuestCart } from '@/lib/guestCart';

// 下部セクションの既定の並び。実験の config が無い・壊れている場合はこれを使う。
const DEFAULT_SECTION_ORDER = ['recommendations', 'related', 'reviews', 'qa', 'recently'];

/** 商品ページ下部の並び順を差し替える実験（seed の pdp_section_order）の config。 */
interface SectionOrderConfig {
  sections?: string[];
}

/** カート追加ボタンの文言を差し替える実験（seed の pdp_cta_copy）の config。 */
interface CtaCopyConfig {
  label?: string;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { count: cartCount, refresh } = useCart();
  const id = params?.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  // カート投入の手応えを画面に残すためのフラグ（トーストは数秒で消えるため）。
  const [added, setAdded] = useState(false);
  // 「合わせておすすめ」が実際に出した商品の id と図版。関連商品セクションから
  // 同じ商品／同じ絵を落とすために使う（商品SVGは10種しかないので、id が違っても
  // 絵が同じカードが上下に並ぶと「描画バグ」に見える）。
  const [shownIds, setShownIds] = useState<number[]>([]);
  const [shownImages, setShownImages] = useState<string[]>([]);
  const handleRecommendationsShown = useCallback(
    ({ ids, imageUrls }: ShownProducts) => {
      setShownIds(ids);
      setShownImages(imageUrls);
    },
    []
  );

  // A/Bテスト。どちらも「割り当てが無ければ既定の見た目」になるので、実験が止まって
  // いても未取得でも画面は現行のまま動く。
  const sectionOrderExperiment = useVariant<SectionOrderConfig>('pdp_section_order');
  const ctaCopyExperiment = useVariant<CtaCopyConfig>('pdp_cta_copy');

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
        setAdded(false);
        // 取得に成功した商品だけを閲覧履歴に残す。
        recordRecentlyViewed(p.id);
        // ファネルの「商品を見た」段。page_view は全ページ共通なので、これが無いと
        // 「一覧 → 商品ページ」と「商品ページ → カート投入」を分けて読めない。
        track(EVENT_VIEW_ITEM, {
          value: p.effective_price,
          props: { product_id: p.id, status: p.status },
        });
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

  // 曝露は「実験対象のUIを実際に描画した」時点で記録する。読み込み中や 404 の段階で
  // 記録すると、見ていない人まで分母に入って効果が薄まって見えるため。
  const { trackExposure: trackSectionExposure } = sectionOrderExperiment;
  useEffect(() => {
    if (product) trackSectionExposure();
  }, [product, trackSectionExposure]);

  const { trackExposure: trackCtaExposure } = ctaCopyExperiment;
  useEffect(() => {
    // 購入パネルは on_sale のときだけ描画されるので、それ以外は曝露にしない。
    if (product?.status === 'on_sale') trackCtaExposure();
  }, [product, trackCtaExposure]);

  const handleAddToCart = async () => {
    if (!product) return;

    // 未ログインでも入れられるようにする。「欲しい」と思った瞬間にログインを挟むと、
    // その意思はほとんど戻ってこない。控えは端末に置き（lib/guestCart.ts）、ログイン・
    // 会員登録の直後に POST /cart/merge でサーバーのカートへ合算する。
    if (!user) {
      const { quantity: inCart, added: addedCount } = addToGuestCart(
        product.id,
        quantity,
        product.stock
      );
      if (addedCount <= 0) {
        showToast(
          inCart > 0
            ? 'すでにカートに在庫数分入っています'
            : 'この商品はただいま在庫がありません',
          { type: 'info' }
        );
        return;
      }
      // ゲストの投入はサーバーを通らないので、ファネルの段はここで記録する
      // （ログイン時は routers/cart.py がサーバー側で記録するため、二重にはならない）。
      track(EVENT_ADD_TO_CART, {
        value: product.effective_price * addedCount,
        props: { product_id: product.id, quantity: addedCount, guest: true },
      });
      setAdded(true);
      showToast('カートに追加しました', {
        type: 'success',
        action: { label: 'カートを見る', href: '/cart' },
      });
      return;
    }

    setAdding(true);
    setError('');
    try {
      await api.post('/cart/items', { product_id: Number(id), quantity });
      await refresh();
      setAdded(true);
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
    // 扉（沈んだ帯）＋ 7:5 の骨格を本番と同じ順で敷き、解決後に段差が出ないようにする。
    return (
      <div aria-hidden="true">
        <div className="bg-sunken band-lg">
          <div className="wrap">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="mt-6 h-3 w-24" />
            <Skeleton className="mt-4 h-9 w-2/3 max-w-md" />
          </div>
        </div>
        <div className="wrap band-lg">
          <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Skeleton className="aspect-[4/3] w-full rounded-2xl lg:aspect-square" />
              <div className="mt-4 flex gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] w-[72px]" />
                ))}
              </div>
            </div>
            <div className="lg:col-span-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-5 h-10 w-44" />
              <div className="mt-10 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <Skeleton className="mt-10 h-52 w-full rounded-xl" />
              <Skeleton className="mt-10 h-40 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="wrap-read band-lg text-center">
        <p role="alert" className="font-mincho text-h3 text-ink">
          {notFound ? '商品が見つかりませんでした。' : error || '商品情報の取得に失敗しました。'}
        </p>
        <Link
          href="/products"
          className={`${btn('secondary', 'md')} mt-6`}
        >
          <ArrowLeftIcon className="h-4 w-4" />
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
  // 買えないとき・売り切れのときの逃げ先。カテゴリが分かっていれば同じ棚へ、
  // 分からなければ商品一覧へ送る（行き止まりを作らない）。
  const shelfHref = product.category_id ? `/categories/${product.category_id}` : '/products';
  // on_sale 以外は購入不可。状態ごとに理由を提示する。
  const purchaseNotice: Record<string, string> = {
    coming_soon: 'この商品は近日発売予定です。公開までもうしばらくお待ちください。',
    suspended: 'この商品は現在販売を停止しています。再開までお待ちください。',
    discontinued: 'この商品は販売を終了しました。',
  };

  // 実験が指定した並び順。未指定・壊れた設定のときは既定の並びに戻す。
  const configuredSections = sectionOrderExperiment.config?.sections;
  const sectionOrder =
    Array.isArray(configuredSections) && configuredSections.length > 0
      ? configuredSections
      : DEFAULT_SECTION_ORDER;

  const sectionNodes: Record<string, ReactNode> = {
    recommendations: (
      <ProductRecommendations
        productId={product.id}
        excludeImageUrls={[product.image_url]}
        // 図版の重複落としで件数が 4 未満になったとき、余った列を埋める札の行き先と図案。
        categoryId={product.category_id}
        motif={motifForCategory(categoryName)}
        onShownChange={handleRecommendationsShown}
      />
    ),
    related: (
      <RelatedProducts
        productId={product.id}
        excludeIds={shownIds}
        excludeImageUrls={[product.image_url, ...shownImages]}
      />
    ),
    reviews: (
      <ReviewSection
        productId={product.id}
        avgRating={product.avg_rating}
        reviewCount={product.review_count}
      />
    ),
    qa: <ProductQA productId={product.id} />,
    recently: <RecentlyViewed excludeId={product.id} />,
  };

  // 文言だけを差し替える実験。config が無ければ現行の文言。
  const addToCartLabel = ctaCopyExperiment.config?.label ?? 'カートに追加';

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'ホーム', href: '/' },
    ...(product.category_id && categoryName
      ? [{ label: categoryName, href: `/categories/${product.category_id}` }]
      : []),
    { label: product.name },
  ];

  const onImageError = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.src.endsWith('/no-image.svg')) return;
    img.onerror = null;
    img.src = '/no-image.svg';
  };

  // 商品の「奥付」。すでに取得済みの値だけを並べる。
  // 以前は左（図版）カラムの中に閉じていたため、右カラムが購入パネルで終わって
  // 下半分が空になり、7:5 の版面が最後まで持たなかった。買い物かごパネルの直後、
  // 右カラムの末尾に置いて2段組を下端まで閉じる。
  const specRows: { label: string; value: string }[] = [
    ...(product.sku ? [{ label: '商品コード', value: product.sku }] : []),
    ...(categoryName ? [{ label: 'カテゴリ', value: categoryName }] : []),
    ...(isOnSale ? [{ label: '在庫', value: `${product.stock} 点` }] : []),
  ];

  return (
    <>
      {/* 扉。他ページと同じ判型記号（沈んだ地のフルブリード帯＋裁ち落とした線画＋
          パンくず＋明朝の h1）を PDP にも入れる。ここだけ扉も面の交替も持たず、
          ヘッダー直下からフッターまで 3,000px 超が同じ地色のまま続いていた。
          商品名は扉の h1 が唯一の席（右カラムに二重に置かない）。 */}
      <PageMasthead
        eyebrow="PRODUCT"
        title={product.name}
        // 扉の線画はこの商品のカテゴリに対応させる（ホームのカテゴリ札・カテゴリ扉と同じ図案）。
        motif={motifForCategory(categoryName)}
        width="default"
        breadcrumbs={breadcrumbItems}
      />

      {/* 末尾に逃げ余白は持たない。
          以前はここに `pb-28 lg:pb-20`（固定購入バーの逃げ）を置いていたが、
          (a) バーは position:fixed で、この器のあとにも署名帯とフッターが続くため
              逃げとしては働かず、
          (b) 最後のセクションが色帯（沈み／深緑）のときだけ、帯と署名帯のあいだに
              80px（lg）〜112px（<lg）の意味のない地色の帯が1本挟まっていた。
          縦の間隔は下のセクション器（.wrap py-8）が配る。 */}
      <div>
        <div className="wrap band-lg">
          {/* 7:5 の非対称。左（図版）が主、右（買う＋奥付）が従で、右は追従する。 */}
          <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              {/* 額縁の地をイラストの地色（tile）に合わせ、枠と絵の境目を消す */}
              <div className="relative rounded-2xl bg-tile p-6 md:p-10">
                <WishlistButton productId={product.id} className="absolute top-4 right-4 z-10" />
                <div className="aspect-[4/3] overflow-hidden rounded-xl lg:aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeImage}
                    alt={product.name}
                    onError={onImageError}
                    className="h-full w-full object-cover transition-transform duration-slow ease-entrance hover:scale-[1.04] motion-reduce:hover:scale-100"
                  />
                </div>
              </div>
              {gallery.length > 1 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {gallery.map((src, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedImage(idx)}
                      aria-label={`画像${idx + 1}を表示`}
                      aria-current={idx === selectedImage}
                      // 選択状態は「箱の内側」に描く（outline + 負のオフセット）。
                      // ring-offset や border-2 だと選択中のサムネイルだけ外寸が 4〜8px 太り、
                      // 行の中で1枚だけ大きく上下にずれて見える。外寸は常に 72px で固定する。
                      // ring-inset は inset box-shadow なので、不透明な画像の下に隠れて見えない。
                      className={`h-[72px] w-[72px] overflow-hidden rounded-md bg-tile transition-opacity duration-fast ease-standard ${
                        idx === selectedImage
                          ? 'outline outline-2 -outline-offset-2 outline-brand-600'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        onError={onImageError}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
              {/* グループ1: 評価・価格・在庫（商品名は扉の h1 が持つ）

                  在庫は「急ぐ理由があるときだけ」ここに出す（残り N点／在庫切れ）。
                  通常在庫の「在庫 44 点」は購入の判断を変えないうえ、下の奥付
                  （specRows の「在庫 | 44 点」）と同じ数字が同じ画面に2度出ていた。
                  数え方の統一（点）だけでは重複は消えないので、席を1つに絞る。
                  一覧カード（components/ProductCard.tsx の lowStock）と同じ規律。 */}
              <RatingStars value={product.avg_rating} count={product.review_count} size="sm" />
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <ProductPrice product={product} size="3xl" showBadge />
                {isOnSale && product.stock <= 5 && <StockLabel stock={product.stock} />}
                {statusMeta.storefrontLabel && (
                  <Badge variant={statusMeta.variant}>{statusMeta.storefrontLabel}</Badge>
                )}
              </div>

              {/* グループ2: 説明文。節記号は全ページ共通の SectionHead に寄せる
                  （eyebrow＋見出しの手組みをやめ、1ページに2様式が混ざらないようにする）。 */}
              <div className="mt-10">
                <SectionHead as="h2" size="sm" eyebrow="ABOUT" title="この道具について" />
                <p className="mt-3 max-w-[38rem] whitespace-pre-wrap text-body-lg jp-body text-ink-soft">
                  {product.description}
                </p>
              </div>

              {/* グループ3: 購入パネル（on_sale のみ。その他は理由を表示）。
                  境界は捨て、影＋上辺のアクセント罫だけで浮かせる（§5-4 手段③）。 */}
              {isOnSale ? (
                <div className="mt-10 rounded-xl border-t-2 border-t-brand-600 bg-surface p-5 shadow-paper md:p-6">
                  <div role="group" aria-label="数量">
                    <span className="block text-caption font-medium text-ink-muted">数量</span>
                    <div className="mt-2 inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={decQty}
                        disabled={soldOut || quantity <= 1}
                        aria-label="数量を1つ減らす"
                        className={iconBtn('md')}
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
                        className="w-12 text-center text-body-lg font-medium tnum text-ink"
                      >
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={incQty}
                        disabled={soldOut || quantity >= maxQty}
                        aria-label="数量を1つ増やす"
                        className={iconBtn('md')}
                      >
                        <PlusIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={adding || soldOut}
                    // 未ログインだとカート投入はサーバーに届かない（ログイン画面へ送られる）ため、
                    // ボタン押下そのものは click イベントとして別途記録する。
                    data-track-click="pdp_add_to_cart"
                    data-track-props={JSON.stringify({ product_id: product.id })}
                    className={`${btn('primary', 'lg')} mt-5 w-full`}
                  >
                    {soldOut ? '在庫切れ' : adding ? '追加中...' : addToCartLabel}
                  </button>

                  {/* 在庫切れでも行き止まりにしない。同じ棚（カテゴリ）へ逃がす。 */}
                  {soldOut && (
                    <Link href={shelfHref} className={`${btn('secondary', 'md')} mt-3 w-full`}>
                      {categoryName ? `${categoryName}の棚を見る` : '商品一覧を見る'}
                    </Link>
                  )}

                  {/* 追加後の手応えをトーストだけに任せない。トーストは数秒で消えるため、
                      「入ったのか／いま何点か／次にどこへ行くか」が画面に残らなかった。
                      既存の行を書き換えず下に足すので、押した位置のものは動かない。 */}
                  {added && (
                    <p
                      role="status"
                      className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-brand-700"
                    >
                      <CheckCircleIcon className="h-4 w-4 shrink-0" />
                      カートに追加しました（現在 <span className="tnum">{cartCount}</span> 点）
                      <Link
                        href="/cart"
                        className="font-medium underline underline-offset-2 hover:text-brand-800"
                      >
                        カートを見る
                      </Link>
                    </p>
                  )}

                  {/* 配送・返品の安心情報。送料は購入の判断材料なので、
                      出荷・返品より先に、CTA のすぐ下（決める位置）に置く。 */}
                  <div className="mt-5 space-y-2 border-t border-line pt-5">
                    <p className="flex items-center gap-2 text-caption text-ink-muted">
                      <PackageIcon className="h-4 w-4 shrink-0 text-brand-600" />
                      全国一律 送料無料
                    </p>
                    <p className="flex items-center gap-2 text-caption text-ink-muted">
                      <BoxIcon className="h-4 w-4 shrink-0 text-brand-600" />
                      14時までのご注文で翌営業日に出荷いたします
                    </p>
                    <p className="flex items-center gap-2 text-caption text-ink-muted">
                      <ArrowPathIcon className="h-4 w-4 shrink-0 text-brand-600" />
                      お届けから30日間の返品保証つき
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-10 rounded-xl bg-sunken p-5 md:p-6">
                  <p className="text-body text-ink-soft">
                    {purchaseNotice[product.status] ?? 'この商品は現在購入いただけません。'}
                  </p>
                  {/* 買えない状態でも次の行き先を必ず持たせる。 */}
                  <Link href={shelfHref} className={`${btn('secondary', 'md')} mt-4`}>
                    {categoryName ? `${categoryName}の棚を見る` : '商品一覧を見る'}
                  </Link>
                </div>
              )}

              {/* 失敗を告げるだけで終わらせない。復帰の造形はホーム（app/page.tsx）の
                  エラー面と同じ（警告面＋btn('secondary','sm')）に揃える。 */}
              {error && (
                <div
                  role="alert"
                  className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-critical-200 bg-critical-50 p-5"
                >
                  <p className="text-body text-critical-700">{error}</p>
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={adding}
                    className={btn('secondary', 'sm')}
                  >
                    もう一度試す
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 奥付。以前は左（図版）カラムの中に閉じていて、右カラムだけが購入パネルで終わり、
              2段組の下半分が空いていた。2段組の外・全幅に出し、行を横に流す。
              これで左右どちらのカラムにも「そのカラムだけの末端」が生まれない。 */}
          {specRows.length > 0 && (
            <section className="mt-16 border-t border-line pt-8">
              <SectionHead as="h2" size="sm" eyebrow="SPECIFICATION" title="仕様" />
              <dl className="mt-5 grid sm:grid-cols-2 sm:gap-x-12 lg:grid-cols-3">
                {specRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-6 border-b border-line py-3"
                  >
                    <dt className="shrink-0 text-caption text-ink-muted">{row.label}</dt>
                    <dd className="min-w-0 text-right text-body tnum text-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>

        {/* 下部セクションは実験の config が指定した順に描画する。順序は設定値なので、
            枝を増やしてもここに分岐を足す必要はない。各セクションは data-track-view で
            「実際に画面に入ったか」を記録し、並び替えの効果を追えるようにしている。
            「合わせておすすめ」（深緑）と Q&A（沈んだ地）はフルブリード帯を自前で持つ（版面の
            外へ出す）ので .wrap で包まない。この2本が 3,000px の本文に段落を入れる装置。 */}
        {sectionOrder.map((key) => {
          const node = sectionNodes[key];
          if (!node) return null;
          const fullBleed = key === 'recommendations' || key === 'qa';
          return (
            <div
              key={key}
              data-track-view={`pdp_section_${key}`}
              // 縦の間隔は器が配り、子の mt は無効化する（[&>section]:mt-0）。
              // 器が持つことで「最後に描かれたセクションの下」にだけ余白が付き、
              // 0件で何も描かないセクション（empty:hidden）は器ごと畳まれる。
              // 色帯（fullBleed）は自前の band-lg を持つので上下の余白を足さない。
              className={
                fullBleed ? 'empty:hidden' : 'wrap py-8 empty:hidden lg:py-10 [&>section]:mt-0'
              }
            >
              {node}
            </div>
          );
        })}
      </div>

      {/* 単カラム時の固定購入バー。画面をスクロールしても価格と CTA が視野から消えない。
          2カラム（＝右の買い物かごパネルが追従する）になるのは lg 以上なので、
          バーを消すのも lg から。768px は単カラムなのにバーが無く、
          購入導線が本文の中に埋もれていた。
          セーフエリア（ホームバー）ぶんの余白を padding に足している。
          z-30 はヘッダーと同値。ヘッダーのモバイルメニュー（z-40）が開いたときは
          その下に潜り、アシスタント FAB（z-50）・トースト（z-[60]）より下になる。 */}
      {isOnSale && (
        <div
          role="region"
          aria-label="購入操作"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-float backdrop-blur lg:hidden"
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <ProductPrice product={product} size="xl" />
              {/* バーは <lg で購入パネルが視野の外に出たときの唯一の判断材料になる。
                  価格だけでなく送料（と選んだ数量）もここで読めるようにする。 */}
              <p className="text-caption text-ink-muted">
                {quantity > 1 && (
                  <>
                    数量 <span className="tnum">{quantity}</span>・
                  </>
                )}
                送料無料
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={adding || soldOut}
              data-track-click="pdp_add_to_cart"
              data-track-props={JSON.stringify({ product_id: product.id })}
              className={`${btn('primary', 'lg')} flex-1`}
            >
              {soldOut ? '在庫切れ' : adding ? '追加中...' : addToCartLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
