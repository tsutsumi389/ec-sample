'use client';

import Link from 'next/link';
import type { RecommendationItem } from '@/lib/types';
import { ArrowRightIcon } from '@/components/Icons';
import ProductPrice from '@/components/ProductPrice';
import WishlistButton from '@/components/WishlistButton';
import { KettleMotif } from '@/components/BrandMotifs';
import { btn } from '@/lib/buttonStyles';
import { onImageError } from '@/lib/productImage';
// 可変長の和文（商品名）は例外なくこれを通す（lib/wordBreak.ts の頭注）。
import { withWordBreaks } from '@/lib/wordBreak';
import { productCardTracking } from '@/lib/analytics';

/**
 * ホーム最上部のビルボード（layout: "hero"）＝「日々帖」の表紙。
 * 商品1件と、その商品を薦める理由（reason）を大きく訴求する。
 *
 * 造形の意図:
 * - 地は bg-invert の単色フルブリード。紙の色が一段沈み、後続の生成りの署名帯との落差が
 *   「見開き」になる（グラデーションにしないこと）。
 * - 背面のケトル線画は画面外へ食み出させる。右カラムの額装も版面の外へ送って（translate-x /
 *   scale）、誌面の「裁ち落とし」を作る。切れているからこそ紙面の続きが想像される。
 * - モバイルには min-h を付けない。ヒーローが縦に伸びると最初のレーンが折り返しの下へ落ち、
 *   「おすすめで構成したホーム」なのに初期表示で商品が1件も見えなくなるため。
 * - 縦は 390px で1画面（旧版は 814px = 1.23 画面あった）に収める。逆に 768px は図版が
 *   213×172 しかなく右半分が空くので、額装を正方形に太らせる（商品SVGが 600×600 なので、
 *   正方形の器が最も切り取りの少ない見せ方でもある）。
 */
export default function HomeBillboard({ item }: { item: RecommendationItem }) {
  const { product, reason } = item;

  return (
    <section className="on-dark band-lg relative flex items-center overflow-hidden bg-invert text-on-dark md:min-h-[440px] lg:band-xl lg:min-h-[600px]">
      {/* 背面のケトルは「透かし」。図案の全体が版面に入る大きさで置き、隅で断つ。
          大きくして額装の裏に隠すと、特徴のない弧の断片だけが残って裁ち落としではなく
          描き損じのパスに見える（裁ち落としは「切れているから続きが想像される」のが要件）。
          位置を左下の隅から動かさないこと——中央寄りにすると注ぎ口と肩の線が
          「詳しく見る」と♡の高さを横切り、CTA が線画をぶつ切りにしているように見える。 */}
      <KettleMotif
        aria-hidden
        strokeWidth={2}
        // 390px は額装が版面の下半分を占めるので、透かしは額装の裏に隠れて
        // 左下に弧の断片だけが残る。モバイルでは出さない。
        className="pointer-events-none absolute -bottom-16 -left-16 hidden w-[340px] select-none text-brand-400 opacity-[0.07] md:block lg:w-[420px]"
      />

      {/* 2段組は md から効かせる。lg 起点にしていた頃は 768px で表紙だけが 1,147px（1画面超）に
          膨らみ、最初のレーンまでが遠すぎた。md/lg とも 7:5 ＋ 右端で裁ち落とす。 */}
      <div className="wrap-wide relative w-full md:grid md:grid-cols-12 md:items-center md:gap-x-8 lg:gap-x-10">
        {/* 左は 7カラム。見出しは text-display（768px で 53px）なので、6カラム（768px で
            336px）だと「ドリップケトル」の7文字（約339px）が1行に入らず、balance が選べる
            改行位置が「ドリップ／ケトル」まで落ちる。見出しの器を先に確保してから額装の幅を決める。
            relative z-10: 透かし（KettleMotif）より必ず前。装飾が字面や CTA に触れない保証を
            重ね順で持たせる（位置だけの調整は、幅が変わると簡単に破れる）。 */}
        <div className="stagger relative z-10 [--stagger-step:60ms] md:col-span-7">
          <div aria-hidden className="h-px w-12 animate-rise bg-brand-400/50" />
          {/* eyebrow は行の中で字間の系統を1つに保つ（和文だけ別の tracking に振らない）。
              font-num（Inter）は和文グリフを持たないので、フェイスを書き分けなくても
              和文は自動で Noto Sans JP に落ちる。 */}
          <p className="mt-4 flex animate-rise flex-wrap items-center gap-x-3 gap-y-1 text-eyebrow uppercase font-num text-on-dark-muted">
            <span>HIBINO JOURNAL — No.01</span>
            <span aria-hidden className="h-3 w-px bg-brand-400/40" />
            {/* このレーンが「あなた向けの推薦」であることは情報として落とさない。 */}
            <span>あなたへのおすすめ</span>
          </p>

          {/* 商品名は可変長なので、組版は3つセットで効かせる（1つでも欠けると崩れる）。
              ・withWordBreaks … 語の切れ目に <wbr>、連続カタカナに span.kana（lib/wordBreak.ts）
              ・jp-name … keep-all。<wbr> 以外の位置に改行機会を作らせない
              ・jp-display … balance ＋ カタカナの字送り補正（globals.css §2）。<wbr> 以外の
                改行機会が無い状態でだけ balance を許すと、「温度調整ドリップ／ケトル」（8:3）が
                「温度調整／ドリップケトル」（4:7）になる。text-pretty は併記しない。 */}
          <h1 className="mt-4 animate-rise font-mincho text-display text-on-dark jp-name jp-display md:mt-5">
            {withWordBreaks(product.name)}
          </h1>

          {reason && (
            <p className="mt-4 max-w-[34rem] animate-rise text-body-lg text-on-dark-muted jp-body md:mt-5">
              {reason}
            </p>
          )}

          {/* 価格の造形（tnum・¥ の階調・打ち消し定価）は全画面で ProductPrice に集約する。 */}
          <ProductPrice
            product={product}
            size="num-lg"
            tone="onDark"
            className="mt-5 animate-rise gap-x-4 md:mt-7"
          />

          <div className="mt-6 flex animate-rise items-center gap-3 md:mt-8">
            <Link
              href={`/products/${product.id}`}
              // 計測の属性は必ずこのヘルパで付ける。手書きすると data-track-view を落として
              // impression が記録されず、表紙だけ CTR の分母が他の枠と揃わない（実際に起きた）。
              {...productCardTracking(product.id, 'billboard')}
              className={btn('onDark', 'lg')}
            >
              詳しく見る
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            {/* 隣の CTA が btn('onDark','lg')＝52px なので、こちらも size='lg'（52px）で揃える。
                ※ className で h-13 を渡しても Tailwind の出力順で基底が勝つので prop で渡すこと。 */}
            <WishlistButton productId={product.id} size="lg" />
          </div>
        </div>

        {/* 額装ごと版面の外へ送り、右端で裁ち落とす。md から効かせて 768px の空地を埋める。 */}
        <div className="mt-6 md:col-span-5 md:col-start-8 md:mt-0 md:translate-x-4 md:scale-[1.05] lg:translate-x-6 lg:scale-[1.04]">
          <Link
            href={`/products/${product.id}`}
            aria-label={`${product.name}の商品ページを見る`}
            // bg-tile は商品SVGの地色そのもの。額縁とイラストが1枚の紙に見える。
            className="group block rounded-2xl bg-tile p-4 md:p-6"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.image_url}
              alt={product.name}
              onError={onImageError}
              // モバイルは 16/9 に寝かせて縦を稼がない（上のコメント参照）。
              // md は正方形。商品SVGが 600×600 なので切り取りが起きず、768px で右カラムの
              // 高さを左カラムに近づけられる。lg は列幅が 470px あり、正方形にすると額装だけが
              // 左カラムより 250px 高くなって今度は文字側に空地が出るので 4:3 に戻す。
              className="aspect-[16/9] w-full rounded-xl object-cover transition-transform duration-slow ease-entrance group-hover:scale-[1.03] motion-reduce:group-hover:scale-100 md:aspect-square lg:aspect-[4/3]"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
