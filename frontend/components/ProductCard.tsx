import Link from 'next/link';
import type { Product } from '@/lib/types';
import ProductPrice, { DiscountBadge, discountPercent } from '@/components/ProductPrice';
import Badge from '@/components/Badge';
import StockLabel from '@/components/StockLabel';
import RatingStars from '@/components/RatingStars';
import WishlistButton from '@/components/WishlistButton';
import { PRODUCT_STATUS_META, SOLD_OUT_BADGE } from '@/lib/productStatus';
import { withWordBreaks } from '@/lib/wordBreak';

export default function ProductCard({
  product,
  hideWishlistButton = false,
  size = 'md',
  tone = 'default',
}: {
  product: Product;
  /** お気に入り一覧など、別の解除操作がある画面ではハートボタンを非表示にする。省略時は表示。 */
  hideWishlistButton?: boolean;
  /** 'lg' は新着グリッドの大判セル用。図版を大きく取り、商品名を明朝の見出しに格上げする。 */
  size?: 'md' | 'lg';
  /** 'onDark' は深緑帯（ランキングレーン）の上に置くとき。影が効かないので縁を1本足す。 */
  tone?: 'default' | 'onDark';
}) {
  const statusMeta = PRODUCT_STATUS_META[product.status];
  // 在庫切れは status ではなく stock で決まる（status は on_sale のまま）。
  // storefrontLabel を持つ状態とは排他（on_sale の storefrontLabel は null）。
  const soldOut = product.status === 'on_sale' && product.stock <= 0;
  // 図版を沈ませる条件も、沈ませ方も1つに揃える。「在庫切れは全面スクリム＋中央スタンプ、
  // 販売停止中は opacity だけ＋左下の札」と2系統あると、同じ「買えない」が同じグリッドの中で
  // 別の造形になり、買えるかどうかを2度学習させることになる。
  // いまは (a) 図版は opacity-50、(b) 札は左下の1席、の1系統だけ。
  const unavailable = soldOut || statusMeta.dimmed;
  const large = size === 'lg';
  // 評価は星5つを敷かず、価格行の右端に「★ 4.0 (12)」として畳む。
  // レビューが無い商品では行ごと出さない（空の星列がカードの一等地を占有していたのを解消）。
  const hasRating = product.review_count > 0 && product.avg_rating != null;
  // 在庫は「急ぐ理由がある」ときだけ知らせる。通常在庫の「在庫 78 点」はカードに出さない。
  const lowStock = product.status === 'on_sale' && product.stock > 0 && product.stock <= 5;

  return (
    // カード全体を relative なラッパーにし、Link は stretched-link（after 疑似要素で
    // カード全面を覆う）として配置する。WishlistButton は Link の兄弟として z 上位に置き、
    // anchor 内に button を入れ子にしない構造にしている。
    // 深度の規律: カードは「影だけ」で立たせる（ボーダーは付けない）。
    <div
      data-card="product"
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl bg-surface shadow-paper transition-[transform,box-shadow] duration-base ease-standard hover:-translate-y-1 hover:shadow-lift motion-reduce:hover:translate-y-0 ${
        tone === 'onDark' ? 'ring-1 ring-white/10' : ''
      }`}
    >
      {/* 画像タイル。地色は商品イラストの地（tile）と同色にして額縁を消す。
          large は新着グリッドで lg:col-span-2 lg:row-span-2 の大判セルに入る。
          そこだけ比率を捨てて「2行ぶん − 本文」を図版が引き受ける（lg:flex-1 + min-h-0）。
          正方形に固定していた頃は、2行ぶんの行高との差 26〜34px が本文か隣のカードの
          どちらかに余りとして出ていた（実測 1440px: 大判の名前↔価格が 49.5px）。
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
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src.endsWith('/no-image.svg')) return;
            img.onerror = null;
            img.src = '/no-image.svg';
          }}
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
          残りN点／%OFF はすべてこの席を奪い合う（同時には立たない優先順位を持たせる）。
          優先順位は 買えない ＞ 急ぐ理由 ＞ 得する理由 の順:
            在庫切れ → 状態 → 残りN点 → NN%OFF
          ・在庫切れだけ図版中央のスタンプ＋スクリムにしていたのをやめた。同じ「買えない」が
            同じグリッドの中で2つの造形（中央スタンプ／左下チップ）になり、席の規律が崩れる。
            買えないことは (a) 図版の opacity-50 と (b) この席の札 の2点で、状態によらず同じ形で伝える。
          ・本文側に札の行を作ると、札を持つ1枚だけ本文が高くなり、同じ行の
            他のカードに引き伸ばされた空白が転嫁される（r2 で 55〜67px の空洞になっていた）。
          ・色は lib/productStatus.ts の variant をそのまま使う。関連商品の行と同じ色になる。
            写真の上での可読性は色ではなく Badge の elevated（縁＋影）で担保する。
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
        本文は「商品名 → 価格」の2段だけ。meta 行の予約高（旧 min-h-[1.5rem]）は置かない。

        縦位置の規律（justify-between）:
        カードの高さはグリッドの行（items-stretch）で揃うので、名前が1行のカードと2行の
        カードが同じ行に混ざると、1行ぶん（text-h3 なら 27.9px）の余りがどこかに必ず出る。
        行き先は3つしかない。
          (a) 図版の直下   … 図版と名前のアキが行内で 27.9px 食い違う
          (b) 名前と価格の間 … 名前と価格が離れるカードができる
          (c) 価格の下     … ¥ の基準線が行内で揃わない
        (a) は「図版の下の余白」が枚ごとに違って見え、(c) は価格の表組みが崩れる。
        そこで名前を上端・価格を下端に固定し（justify-between）、余りを (b) に落とす。
        同じ行のカードは 図版下=16px / 価格の基準線 / カード下端=16px が必ず一致する。

        ⚠ 名前欄に min-h-[2lh]（＝常に2行ぶん確保）を持たせてはいけない。行内の全員が
          1行名のとき（実測: 1024px 以上の /products は12枚すべて1行）にも空の2行目が
          残り、名前と価格の字面アキが 15.9px → 43.8px に開いて、余りを必要としない
          カードにまで穴が空く。行に2行名が居るときだけ余りが出るのが正しい。
        ⚠ components/Skeleton.tsx の ProductCardSkeleton はこの構成（名前=上端 / 価格=下端）
          と1対1で対応させること。ずれると読み込み完了の瞬間に価格が跳ねる。
      */}
      <div className={`flex flex-1 flex-col justify-between ${large ? 'p-4 lg:flex-none lg:p-6' : 'p-4'}`}>
        <h3
          className={
            // 明朝への格上げは全幅で効かせる（型の優位が md 以下で消えないように）。
            // 号数だけは lg から上げる。lg 未満では大判セルにならず通常カードと同じ
            // 1セル幅に収まるため、号数まで上げるとその1枚だけ本文が2行になって
            // 隣のカードに空白が転嫁される。
            //
            // text-wrap は globals.css の h3 既定（balance）に任せる。text-pretty を
            // 明示していた頃は行を埋めきってから折るため「ワイヤレスイヤ／ホン」になっていた。
            // withWordBreaks() が <wbr> を挿し jp-name の keep-all がそれ以外の改行機会を
            // 消しているので、balance は語の切れ目からしか選べず「ワイヤレス／イヤホン」に割れる。
            // 高さは自然高（1〜2行）。予約高は持たせない（本文ブロックのコメント参照）。
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
        // 不透明で常時置く。以前は opacity-60 で hover のときだけ 100% にしていたが、
        // 合成後のアイコン(157,149,135) 対 自身の白丸(242,236,225) が実測 2.52:1 で、
        // 非テキストUI部品の 3:1（WCAG 1.4.11）に届いていなかった。
        // 主張は不透明度ではなく造形（36px の小径・生成りの丸・ink-muted の線）で抑える。
        // 不透明にすると全カードで同じ濃さになるので、ポインタ環境と
        // タッチ環境で「そこに操作があるか」の読み取りも一致する。
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
