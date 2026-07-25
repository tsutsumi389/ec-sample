import { ArrowRightIcon } from '@/components/Icons';
import { CupMotif, KettleMotif, PlantMotif } from '@/components/BrandMotifs';
import { btn } from '@/lib/buttonStyles';

/**
 * ブランドヒーロー。
 * ホームのビルボード（HomeBillboard）が出せないとき——商品が無い、/home の取得に失敗した、
 * コールドスタートで hero レーンが返らなかった——のフォールバックとして使う。
 *
 * 造形は HomeBillboard と同じ「表紙」の型（深緑フルブリード・背面の裁ち落とし線画・
 * 左6カラムの縦組み見出し）に揃えてある。フォールバックだけ別の世界観にならないようにするため。
 * かつて内包していた装飾イラストは BrandMotifs.tsx に線画として切り出し済み。
 */
export default function BrandHero() {
  return (
    <section className="on-dark band-lg relative flex items-center overflow-hidden bg-invert text-on-dark md:min-h-[440px] lg:band-xl lg:min-h-[560px]">
      {/* 背面のケトルは「透かし」。図案の全体が版面に入る大きさ・位置に置き、下端だけで断つ
          （HomeBillboard と同じ扱い。大きくしすぎると特徴のない弧の断片だけが残る）。 */}
      <KettleMotif
        aria-hidden
        strokeWidth={2}
        className="pointer-events-none absolute -bottom-10 left-0 hidden w-[340px] select-none text-brand-400 opacity-[0.10] md:block lg:w-[420px]"
      />

      <div className="wrap-wide relative w-full lg:grid lg:grid-cols-12 lg:items-center lg:gap-x-10">
        <div className="lg:col-span-6">
          <div aria-hidden className="h-px w-12 bg-brand-400/50" />
          <p className="mt-4 text-eyebrow uppercase font-num text-on-dark-muted">
            HIBINO — 日々の暮らしの道具店
          </p>
          <h1 className="mt-5 font-mincho text-display text-on-dark jp-head jp-display">
            日々の暮らしに、
            <br />
            よい道具を。
          </h1>
          <p className="mt-5 max-w-[34rem] text-body-lg text-on-dark-muted jp-body">
            使うたびに気分がすこし上向く、長く付き合える生活道具を選び集めました。
          </p>
          <a href="#products" className={`${btn('onDark', 'lg')} mt-8`}>
            商品を見る
            <ArrowRightIcon className="h-4 w-4" />
          </a>
        </div>

        {/* 右: 棚。署名帯と同じ「1本の水平罫＋非等間隔の3点」を暗い面で反復する。
            3点の高さは同じ数字（h-24 md:h-32）で揃える。BrandMotifs の viewBox が
            120×120 の正方形・接地線 y=108 に統一されているので、これで光学サイズも
            接地も揃う（署名帯・フッター・ログインと同じ規律）。 */}
        <div aria-hidden className="mt-12 lg:col-span-5 lg:col-start-8 lg:mt-0">
          <div className="stagger relative h-36 border-b border-brand-400/40 [--stagger-step:90ms] md:h-44">
            <KettleMotif className="pointer-events-none absolute bottom-0 left-[0%] h-24 select-none text-brand-300 animate-rise md:h-32" />
            <CupMotif className="pointer-events-none absolute bottom-0 left-[42%] h-24 select-none text-brand-300 animate-rise md:h-32" />
            <PlantMotif className="pointer-events-none absolute bottom-0 left-[68%] h-24 select-none text-brand-300 animate-rise md:h-32" />
          </div>
        </div>
      </div>
    </section>
  );
}
