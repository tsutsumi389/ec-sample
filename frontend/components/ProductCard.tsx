import { memo } from 'react';
import Link from 'next/link';
import type { Product } from '@/lib/types';
import ProductPrice, { DiscountBadge, discountPercent } from '@/components/ProductPrice';
import Badge from '@/components/Badge';
import StockLabel from '@/components/StockLabel';
import RatingStars from '@/components/RatingStars';
import WishlistButton from '@/components/WishlistButton';
import { onImageError } from '@/lib/productImage';
import { isLowStock, isSoldOut, PRODUCT_STATUS_META, SOLD_OUT_BADGE } from '@/lib/productStatus';
import { withWordBreaks } from '@/lib/wordBreak';
import { productCardTracking } from '@/lib/analytics';

function ProductCard({
  product,
  hideWishlistButton = false,
  size = 'md',
  tone = 'default',
  trackSection,
}: {
  product: Product;
  /** お気に入り一覧など、別の解除操作がある画面ではハートボタンを非表示にする。省略時は表示。 */
  hideWishlistButton?: boolean;
  /** 'lg' は新着グリッドの大判セル用。図版を大きく取り、商品名を明朝の見出しに格上げする。 */
  size?: 'md' | 'lg';
  /** 'onDark' は深緑帯（ランキングレーン）の上に置くとき。影が効かないので縁を1本足す。 */
  tone?: 'default' | 'onDark';
  /**
   * このカードが置かれている枠の名前（'recommendations' / 'listing' / 'home_lane' など）。
   * クリック・表示の記録に添えるので、枠ごとの CTR を比べられる。渡さないと同じ
   * product_card として一括計上され、「どの枠が効いているか」が読めなくなる。
   */
  trackSection?: string;
}) {
  const statusMeta = PRODUCT_STATUS_META[product.status];
  // 在庫切れは status ではなく stock で決まる（status は on_sale のまま）。
  // storefrontLabel を持つ状態とは排他（on_sale の storefrontLabel は null）。
  const soldOut = isSoldOut(product);
  // 図版を沈ませる条件も沈ませ方も1系統だけ——(a) 図版は opacity-50、(b) 札は左下の1席。
  // 2系統あると、同じ「買えない」を同じグリッドの中で2度学習させることになる。
  const unavailable = soldOut || statusMeta.dimmed;
  const large = size === 'lg';
  // 評価は星5つを敷かず、価格行の右端に「★ 4.0 (12)」として畳む。
  // レビューが無い商品では行ごと出さない（空の星列がカードの一等地を占有していたのを解消）。
  const hasRating = product.review_count > 0 && product.avg_rating != null;
  // 在庫は「急ぐ理由がある」ときだけ知らせる。通常在庫の「在庫 78 点」はカードに出さない。
  const lowStock = isLowStock(product);

  return (
    // カード全体を relative なラッパーにし、Link は stretched-link（after 疑似要素で
    // カード全面を覆う）として配置する。WishlistButton は Link の兄弟として z 上位に置き、
    // anchor 内に button を入れ子にしない構造にしている。
    // 深度の規律: カードは「影だけ」で立たせる（ボーダーは付けない）。
    <div
      data-card="product"
      // 計測はカードの器に 1 つだけ付ける。AnalyticsTracker が委譲で拾うので、この 1 行で
      // 一覧・検索結果・レコメンド・ホームのレーン・お気に入りまで全部の枠が同じ鍵で測れる
      // （どのカードが見られて、どれが押されたか）。個々の呼び出し側に計測を書かせない。
      // 属性の綴りと props の形は lib/analytics.ts が持つ（tracker と同じ層）。
      {...productCardTracking(product.id, trackSection)}
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl bg-surface shadow-paper transition-[transform,box-shadow] duration-base ease-standard hover:-translate-y-1 hover:shadow-lift motion-reduce:hover:translate-y-0 ${
        tone === 'onDark' ? 'ring-1 ring-white/10' : ''
      }`}
    >
      {/* 地色は商品イラストの地（tile）と同色にして額縁を消す。
          large は新着グリッドで lg:col-span-2 lg:row-span-2 の大判セルに入るので、そこだけ
          比率を捨てて「2行ぶん − 本文」を図版が引き受ける（lg:flex-1 + min-h-0）。比率を固定
          すると 2行ぶんの行高との差 26〜34px が本文か隣のカードに余りとして出る。
          lg 未満では 1セル幅なので通常と同じ 4:3 に戻す。 */}
      <div
        className={`relative overflow-hidden bg-tile ${
          large ? 'aspect-[4/3] lg:aspect-auto lg:min-h-0 lg:flex-1' : 'aspect-[4/3]'
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image_url}
          // 図版は装飾。直後の h3 のリンクテキストが同じ商品名を読ませるため、
          // alt に商品名を入れると支援技術で名前が2回読まれる（alt="" が正）。
          alt=""
          onError={onImageError}
          // absolute inset-0: 図版の高さは器（aspect-[4/3] か flex-1）だけが決める。
          // 通常フローに置くと画像の固有比（商品SVGは 150×150 = 1:1）が器の
          // max-content 高になり、大判セルではそれが grid の行高を押し上げて
          // 同じ行の通常カードに余りを転嫁していた（実測 1440px: 行高 315.8→349.4px）。
          className={`absolute inset-0 h-full w-full object-cover transition-transform duration-slow ease-entrance group-hover:scale-[1.04] motion-reduce:group-hover:scale-100 ${
            unavailable ? 'opacity-50' : ''
          }`}
        />
        {/*
          札は図版の左下「1席」だけ。在庫切れ／状態（近日発売・販売停止中・販売終了）／
          残りN点／%OFF はすべてこの席を奪い合う。優先順位は 買えない ＞ 急ぐ理由 ＞ 得する理由:
            在庫切れ → 状態 → 残りN点 → NN%OFF
          ・本文側に札の行を作ると、札を持つ1枚だけ本文が高くなり、同じ行の
            他のカードに引き伸ばされた空白が転嫁される（実測 55〜67px の空洞）。
          ・色は lib/productStatus.ts の variant をそのまま使う。写真の上での可読性は
            色ではなく Badge の elevated（縁＋影）で担保する。
        */}
        {soldOut ? (
          <Badge variant={SOLD_OUT_BADGE.variant} elevated className="absolute bottom-3 left-3 z-10">
            {SOLD_OUT_BADGE.label}
          </Badge>
        ) : statusMeta.storefrontLabel ? (
          <Badge variant={statusMeta.variant} elevated className="absolute bottom-3 left-3 z-10">
            {statusMeta.storefrontLabel}
          </Badge>
        ) : lowStock ? (
          <StockLabel stock={product.stock} elevated className="absolute bottom-3 left-3 z-10" />
        ) : discountPercent(product) > 0 ? (
          <DiscountBadge product={product} elevated className="absolute bottom-3 left-3 z-10" />
        ) : null}
      </div>

      {/*
        本文は「商品名 → 価格」の2段だけ。meta 行の予約高は置かない。

        縦位置の規律（justify-between）: カードの高さはグリッドの行（items-stretch）で揃うので、
        名前が1行のカードと2行のカードが同じ行に混ざると、1行ぶん（text-h3 なら 27.9px）の余りが
        必ずどこかに出る。図版の直下に出すと図版下の余白が枚ごとに違って見え、価格の下に出すと
        ¥ の基準線が行内で揃わない。そこで名前を上端・価格を下端に固定し、余りを名前と価格の
        あいだに落とす。同じ行のカードは 図版下=16px / 価格の基準線 / カード下端=16px が一致する。

        ⚠ 名前欄に min-h-[2lh]（＝常に2行ぶん確保）を持たせてはいけない。行内の全員が
          1行名のときにも空の2行目が残り、名前と価格の字面アキが 15.9px → 43.8px に開いて、
          余りを必要としないカードにまで穴が空く。
        ⚠ components/Skeleton.tsx の ProductCardSkeleton はこの構成（名前=上端 / 価格=下端）
          と1対1で対応させること。ずれると読み込み完了の瞬間に価格が跳ねる。
      */}
      <div className={`flex flex-1 flex-col justify-between ${large ? 'p-4 lg:flex-none lg:p-6' : 'p-4'}`}>
        <h3
          className={
            // 明朝への格上げは全幅で効かせる。号数だけは lg から上げる——lg 未満では大判セルに
            // ならず通常カードと同じ1セル幅に収まるため、号数まで上げるとその1枚だけ本文が
            // 2行になって隣のカードに空白が転嫁される。
            //
            // text-wrap は globals.css の h3 既定（balance）に任せる。text-pretty だと行を
            // 埋めきってから折るので「ワイヤレスイヤ／ホン」になる。withWordBreaks() が <wbr> を
            // 挿し jp-name の keep-all が他の改行機会を消すので、balance は語の切れ目しか選べない。
            large
              ? 'font-mincho text-h3 text-ink jp-name line-clamp-2 lg:text-h2'
              : 'text-h3 text-ink jp-name line-clamp-2'
          }
        >
          <Link
            href={`/products/${product.id}`}
            // フォーカスリングは文字ではなくカード全面（after 疑似要素）に出す。
            className="after:absolute after:inset-0 after:z-10 after:rounded-xl focus-visible:outline-none focus-visible:after:border-2 focus-visible:after:border-brand-600"
          >
            {/* 語中改行（「ブルートゥースス／ピーカー」）を止める。可変長の和文は必ずこれを通す。 */}
            {withWordBreaks(product.name)}
          </Link>
        </h3>

        {/* 価格行。評価はこの行の右端に畳む（独立した行にすると、レビューの有無で
            カードの高さが変わり、同じ行の他のカードに空白が転嫁される）。
            mt は 6px。行ボックスのハーフレディング（名前側 6px + 価格側 7px）が乗るので、
            字面どうしの実測アキは約 19px になり、カード下端の余白（19.5px）と揃う。 */}
        <div className="mt-1.5 flex items-center justify-between gap-x-2">
          <ProductPrice product={product} size={large ? 'feature' : 'lg'} compact className="shrink-0" />
          {hasRating && (
            <RatingStars
              value={product.avg_rating}
              count={product.review_count}
              size="sm"
              compact
              className="shrink-0"
            />
          )}
        </div>
      </div>

      {!hideWishlistButton && (
        // 不透明で常時置く。opacity-60 では合成後のアイコン(157,149,135) 対 自身の白丸
        // (242,236,225) が実測 2.52:1 で、非テキストUI部品の 3:1（WCAG 1.4.11）に届かない。
        // 主張は不透明度ではなく造形（36px の小径・生成りの丸・ink-muted の線）で抑える。
        <WishlistButton
          productId={product.id}
          // カードの図版を隠さないよう、ここだけ 36px（.hit でタップ領域は 48px 確保）。
          size="sm"
          className="absolute right-3 top-3 z-20"
        />
      )}
    </div>
  );
}

/**
 * memo 境界。一覧は products と categories を同じコンポーネントの state に持ち、/categories は
 * /products と独立に返るので**必ず**もう1回グリッド全体が再描画される（カード12枚にカテゴリは
 * 関係が無い）。props は配列要素の同一性が保たれるので、比較関数は要らない。
 */
export default memo(ProductCard);
