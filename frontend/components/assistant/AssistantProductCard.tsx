'use client';

import { MouseEvent, memo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { onImageError } from '@/lib/productImage';
import { withRedirect } from '@/lib/redirect';
import { isLowStock, isSoldOut, PRODUCT_STATUS_META, SOLD_OUT_BADGE } from '@/lib/productStatus';
import { truncateAtSentence, withWordBreaks } from '@/lib/wordBreak';
import { chip } from '@/lib/buttonStyles';
import Badge from '@/components/Badge';
import ProductPrice from '@/components/ProductPrice';
import RatingStars from '@/components/RatingStars';
import Spinner from '@/components/Spinner';
import StockLabel from '@/components/StockLabel';
import { ArrowRightIcon, CartIcon, CheckCircleIcon } from '@/components/Icons';

interface AssistantProductCardProps {
  product: Product;
  /** LLM が付けた提案理由。あれば商品名の下に控えめに表示する。 */
  reason?: string | null;
  /**
   * 商品詳細へ遷移する直前に呼ぶ。パネルを閉じて背景の inert を外すために必須。
   * リンクの onClick へそのまま渡す（修飾キー付きクリック＝新規タブの判定は呼び出し元の
   * AssistantPanel が行う）。引数なしでも呼べるのは、ボタンから router.push する
   * ログイン導線で無条件に閉じたいため。
   */
  onNavigate?: (e?: MouseEvent<HTMLElement>) => void;
}

/**
 * 提案理由（reason）を丸める文字数。**行数ではなく文字数で持つ**理由は
 * components/ProductLane.tsx の REASON_BUDGET と同じ（同じ文字列が幅の違う器に流れる）。
 * この器の実効幅は 296〜366px（列幅の下限 20rem からカードの p-3 を引いた値が最狭）、
 * text-caption は 0.8125rem + letter-spacing .02em なので1行に全角22〜27字しか入らない。
 * 1行に収める上限として 24 文字を取る（超過分は line-clamp-1 が最後の砦になる）。
 */
const REASON_BUDGET = 24;

/**
 * カート投入の結果。成功・要ログイン・失敗は同時に成り立たないので 1 つの値で持つ。
 * 独立した3つの真偽値にすると、型の上では 8 通り取れてしまい、
 * ハンドラの先頭に「他方を潰す」リセット行を並べて手で排他を作ることになる
 * （結果の種類を1つ足すたびに、全ハンドラのリセット行が増える）。
 */
type CartResult = { kind: 'added' } | { kind: 'login' } | { kind: 'error'; message: string };

/**
 * 操作行の2つの粒。造形は lib/buttonStyles.ts が持つ（アシスタント内の chip と同じ源）。
 * 記号と語の間隔だけはここで言う——chip() は gap を握らない。
 */
const DETAIL_LINK_CLASS = `${chip('action')} flex-1 gap-1`;
const ADD_BUTTON_CLASS = `${chip('action', 'solid')} flex-1 gap-1.5`;

/**
 * チャット内に表示する商品カード。
 * 画像（96px）・商品名（2行まで）・評価・価格・在庫状況を示し、
 * 「商品を見る」リンクと「カートに追加」ボタンを 1 行に並置して導線を明示する。
 * 一覧の走査性を保つため縦丈を抑え（画像 96px・提案理由は 1 行に折り畳み）、
 * 操作行はモバイルで 44px を確保しつつデスクトップでは高さを詰める。
 * 買えない理由は Product.status から導く（lib/productStatus.ts）。文言も色も表の値を
 * そのまま Badge に渡す（「在庫なし」の灰色一色に潰すと、近日発売＝brand も
 * 販売停止中＝accent も同じ死札になり、次の期待が持てない）。
 * 画像・商品名クリックでも商品詳細へ遷移する。遷移時は onNavigate でパネルを閉じる
 * （閉じないと背景に張った inert が残ったまま遷移し、遷移先が一切操作できない）。
 * カート追加の結果（成功／要ログイン／失敗）はトーストではなくカードの中に残す
 * （トーストの器はパネルと下端・右端が重なって入力欄を数秒覆ううえ、
 *   パネルは aria-modal なのでトースト内のリンクにキーボードでも SR でも到達できない）。
 */
function AssistantProductCard({ product, reason, onNavigate }: AssistantProductCardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { count, refresh } = useCart();
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<CartResult | null>(null);

  const statusMeta = PRODUCT_STATUS_META[product.status];
  // 在庫切れは status ではなく stock で決まる（status は on_sale のまま）。
  const soldOut = isSoldOut(product);
  // 在庫は「急ぐ理由がある」ときだけ知らせる。通常在庫の「在庫 78 点」は
  // ProductCard.tsx:39 と同じ規律でカードに出さない。
  const lowStock = isLowStock(product);

  // カート追加。API 呼び出しとカート再取得の手順は商品詳細ページ
  // （app/products/[id]/page.tsx の handleAddToCart）と揃える。ただし未ログイン時の遷移と
  // トーストは意図的に分ける（理由は下の分岐コメントと、このコンポーネントの docstring）。
  const handleAddToCart = async () => {
    if (!user) {
      // ここで /login へ飛ばすとパネルが畳まれ、相談中の会話ごと視界から消える。
      // 遷移はユーザーが「ログイン」を押したときだけにする。
      setResult({ kind: 'login' });
      return;
    }
    setAdding(true);
    try {
      await api.post('/cart/items', { product_id: product.id, quantity: 1 });
      await refresh();
      // 手応えは自動で消さない（PDP と同じ判断）。「入ったのか／いま何点か／
      // 次にどこへ行くか」が画面に残らないと、追加したこと自体を見失う。
      setResult({ kind: 'added' });
    } catch (e) {
      setResult({
        kind: 'error',
        message: e instanceof ApiError ? e.message : 'カートへの追加に失敗しました',
      });
    } finally {
      setAdding(false);
    }
  };

  // 戻り先を redirect に持たせる（app/cart/page.tsx と同じ形）。usePathname/useSearchParams は
  // layout 常駐の AssistantWidget 配下に Suspense 境界の要件を持ち込むので、クリック時に window から読む。
  const handleLogin = () => {
    onNavigate?.();
    router.push(withRedirect('/login', window.location.pathname + window.location.search));
  };

  const detailHref = `/products/${product.id}`;

  return (
    <div
      // 計測はカードの器に1つだけ付ける（ProductCard.tsx と同じ鍵・同じ規律）。
      // AnalyticsTracker が委譲と MutationObserver で拾うので、後からマウントされる
      // このパネル内でも属性を置くだけで効く。付けないと AI 提案経由の表示・クリックだけが
      // product_card の集計から欠落し、他の枠と同じ物差しで比べられなくなる。
      data-track-click="product_card"
      data-track-view="product_card"
      data-track-props={JSON.stringify({ product_id: product.id, section: 'assistant' })}
      className="flex flex-col gap-2 rounded-xl bg-surface p-3 shadow-paper transition-shadow duration-base ease-standard hover:shadow-lift"
    >
      <div className="flex gap-3">
        <Link
          href={detailHref}
          onClick={onNavigate}
          aria-label={`${product.name}の詳細を見る`}
          className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image_url}
            alt={product.name}
            onError={onImageError}
            className="h-full w-full object-cover transition-transform duration-slow ease-entrance group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <h4 className="text-body font-medium leading-snug text-ink line-clamp-2 jp-name">
            <Link
              href={detailHref}
              onClick={onNavigate}
              className="rounded hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              {/* 語中改行（「ワイヤレスイヤホ／ン」）を止める。可変長の和文は必ずこれを通す。
                  列幅の下限は 20rem（globals.css の .assistant-product-grid）なので、この器は
                  最狭でも約 190px（320 − p-3 の 24 − 画像 96 − gap-3 の 12）。サイトの中では
                  依然として狭い部類で、語中改行がいちばん出やすい場所でもある。 */}
              {withWordBreaks(product.name)}
            </Link>
          </h4>
          <div className="mt-1">
            <RatingStars value={product.avg_rating} count={product.review_count} size="sm" />
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <ProductPrice product={product} size="base" />
            {lowStock && <StockLabel stock={product.stock} />}
          </div>
        </div>
      </div>

      {reason && (
        // 丸めは文字数ではなく「文」で行う（truncateAtSentence）。line-clamp だけだと
        // 「食卓の必…」と文節の途中で断ち切られ、組版の中でここだけ無配慮になる。
        // withWordBreaks は通さない（散文なので .jp-body の text-wrap: pretty が正。
        // .jp-name の keep-all を散文に掛けると行末が痩せる）。
        // line-clamp-1 は想定外に長い reason が来ても器を壊さない最後の砦として残す。
        <p className="line-clamp-1 text-caption text-ink-muted jp-body">
          {truncateAtSentence(reason, REASON_BUDGET)}
        </p>
      )}

      {/* mt-auto: カード高はグリッドのストレッチで揃うので、reason の有無で
          ボタン行の位置が上下しないよう下端に固定する。 */}
      <div className="mt-auto flex items-stretch gap-2">
        <Link href={detailHref} onClick={onNavigate} className={DETAIL_LINK_CLASS}>
          商品を見る
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
        {product.purchasable ? (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={adding}
            aria-label={`${product.name}をカートに追加`}
            className={ADD_BUTTON_CLASS}
          >
            {adding ? (
              <Spinner label="追加中" />
            ) : (
              <>
                <CartIcon className="h-4 w-4" />
                カートに追加
              </>
            )}
          </button>
        ) : (
          // 買えない理由は status が唯一の源。在庫切れ（on_sale + stock 0）だけ status に
          // 現れないので SOLD_OUT_BADGE から採る。色は表の variant をそのまま Badge へ渡す
          // （近日発売＝brand / 販売停止中＝accent / 販売終了・在庫切れ＝neutral）。
          // 灰色のベタ札で受けていた頃は、どの状態も同じ死札になって次の期待が持てず、
          // ProductCard・関連商品・商品ページと同じ status がここだけ別の見えになっていた。
          // flex-1 は付けない：札は語の幅だけ取り、余りは「商品を見る」に渡す。
          <span className="inline-flex shrink-0 items-center">
            <Badge variant={soldOut ? SOLD_OUT_BADGE.variant : statusMeta.variant}>
              {soldOut ? SOLD_OUT_BADGE.label : (statusMeta.storefrontLabel ?? '購入できません')}
            </Badge>
          </span>
        )}
      </div>

      {result?.kind === 'added' && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-brand-700"
        >
          <CheckCircleIcon className="h-4 w-4 shrink-0" />
          カートに追加しました（現在 <span className="tnum">{count}</span> 点）
          <Link
            href="/cart"
            onClick={onNavigate}
            className="font-medium underline underline-offset-2 hover:text-brand-800"
          >
            カートを見る
          </Link>
        </p>
      )}

      {result?.kind === 'login' && (
        <p role="status" className="text-caption text-ink-muted">
          カートに入れるにはログインが必要です。
          <button
            type="button"
            onClick={handleLogin}
            className="ml-1 font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
          >
            ログイン
          </button>
        </p>
      )}

      {result?.kind === 'error' && (
        <p role="alert" className="text-caption text-critical-700">
          {result.message}
        </p>
      )}
    </div>
  );
}

/**
 * memo 境界。カードを描く AssistantPanel は入力欄の値も同じ state に持つので、
 * 相談文を1文字打つたびにメッセージ列ごと再描画される。カードは商品名の語分割
 * （withWordBreaks = Intl.Segmenter）と reason の文丸めを毎回やり直すので、
 * 30字打てば「30回 × 画面上の全カード」ぶんの無駄になる。
 * props は messages state 内のオブジェクトと useCallback 済みの関数で同一性が保たれるため、
 * 比較関数は要らない（ProductCard.tsx と同じ判断）。
 */
export default memo(AssistantProductCard);
