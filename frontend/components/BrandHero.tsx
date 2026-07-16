import { ArrowRightIcon } from '@/components/Icons';

/** 「暮らしの道具店」らしい抽象的な道具モチーフ（ケトル・湯呑み・植物）の装飾イラスト。 */
function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 400 320"
      className="w-full max-w-md"
      role="img"
      aria-hidden="true"
      fill="none"
    >
      {/* やわらかな背景の面 */}
      <circle cx="228" cy="158" r="132" className="fill-brand-500" opacity="0.45" />
      <circle cx="312" cy="86" r="44" className="fill-brand-400" opacity="0.4" />

      {/* 棚のライン */}
      <line
        x1="60"
        y1="252"
        x2="360"
        y2="252"
        className="stroke-brand-200"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* ケトル */}
      <g strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M112 252 Q106 198 152 192 L206 192 Q252 198 246 252 Z"
          className="fill-brand-400 stroke-brand-100"
        />
        <path d="M152 192 q27 -17 54 0" className="stroke-brand-100" />
        <circle cx="179" cy="173" r="7" className="fill-brand-200 stroke-brand-100" />
        <path d="M112 216 q-30 -6 -40 -28" className="stroke-brand-100" />
        <path d="M152 192 q27 -46 54 0" className="stroke-brand-100" />
      </g>

      {/* 湯呑みと湯気 */}
      <g strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M266 238 h62 q-7 26 -31 26 q-24 0 -31 -26 Z"
          className="fill-brand-300 stroke-brand-100"
        />
        <path d="M328 242 q20 2 16 18 q-4 10 -18 8" className="stroke-brand-100" />
        <path d="M287 216 q-8 -10 0 -20 q8 -10 0 -20" className="stroke-brand-200" />
        <path d="M307 216 q-8 -10 0 -20 q8 -10 0 -20" className="stroke-brand-200" />
      </g>

      {/* 植物 */}
      <g strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M58 252 h48 l-7 34 h-34 Z" className="fill-brand-300 stroke-brand-100" />
        <path d="M82 252 q-2 -34 -22 -46" className="stroke-brand-100" />
        <path d="M82 252 q2 -30 22 -42" className="stroke-brand-100" />
        <path d="M60 206 q-15 4 -15 18 q17 2 21 -12 Z" className="fill-brand-400 stroke-brand-100" />
        <path d="M104 210 q15 4 15 18 q-17 2 -21 -12 Z" className="fill-brand-400 stroke-brand-100" />
        <path d="M82 206 q-9 -13 0 -26 q9 13 0 26 Z" className="fill-brand-400 stroke-brand-100" />
      </g>
    </svg>
  );
}

/**
 * ブランドヒーロー。
 * ホームのビルボード（HomeBillboard）が出せないとき——商品が無い、/home の取得に失敗した、
 * コールドスタートで hero レーンが返らなかった——のフォールバックとして使う。
 */
export default function BrandHero() {
  return (
    <section className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 text-white">
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-0 md:min-h-[360px] md:grid md:grid-cols-2 md:items-center md:gap-8">
        <div className="max-w-xl">
          <p className="text-xs md:text-sm font-medium tracking-widest text-brand-100">
            HIBINO — 日々の暮らしの道具店
          </p>
          <h1 className="mt-3 md:mt-4 text-3xl md:text-5xl font-bold leading-tight">
            日々の暮らしに、
            <br className="md:hidden" />
            よい道具を。
          </h1>
          <p className="mt-4 md:mt-5 text-sm md:text-base text-brand-100 leading-relaxed">
            使うたびに気分がすこし上向く、長く付き合える生活道具を選び集めました。
          </p>
          <a
            href="#products"
            className="mt-6 md:mt-8 inline-flex items-center gap-2 bg-white text-brand-700 px-6 py-3 text-sm font-medium rounded-md hover:bg-brand-50 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
          >
            商品を見る
            <ArrowRightIcon className="w-4 h-4" />
          </a>
        </div>
        <div className="hidden md:flex md:justify-end">
          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}
