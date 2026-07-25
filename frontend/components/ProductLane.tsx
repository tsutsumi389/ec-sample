'use client';

import { useEffect, useRef, useState } from 'react';
import type { RecommendationItem } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import SectionHead from '@/components/SectionHead';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/Icons';
import { iconBtn } from '@/lib/buttonStyles';
import { truncateAtSentence } from '@/lib/wordBreak';

/**
 * レーンの描画バリエーション。同じ造形を続けて並べないための「面」の切り替え。
 * - lane   … 生成りの地（bg-page）。カード幅は狭く、1画面に約5枚。
 * - ranked … 深緑のフルブリード帯。順位番号を大きく併記する（社会的証明の可視化）。
 * - quiet  … 沈んだ地（bg-sunken）＋上下ヘアライン。カードを一回り大きく、約4枚。
 */
export type ProductLaneVariant = 'lane' | 'ranked' | 'quiet';

interface ProductLaneProps {
  title: string;
  subtitle?: string | null;
  /** 欧文の柱。ホームでは「No.02 — FOR YOU」のように号数付きで渡す。 */
  eyebrow?: string;
  items: RecommendationItem[];
  variant?: ProductLaneVariant;
}

/** 1ステップのスクロール量（可視幅に対する割合）。端の見切れカードを次の先頭に送る。 */
const SCROLL_RATIO = 0.85;

/**
 * 推薦理由（reason）を丸める文字数。**行数ではなく文字数で持つ理由**:
 * 同じ文字列が幅の違う器に流れる（カードの実寸は 390px で 216px / 1440px で 264px）。
 * いちばん狭い 216px・text-caption(13px + 0.02em) で 1行 約16文字なので、
 * 2行に必ず収まる上限として 30 文字を取る。丸めは lib/wordBreak.ts の
 * truncateAtSentence()（「。」→ 収まらなければ読点、の順）。
 */
const REASON_BUDGET = 30;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Netflix 型の横スクロールレーン。
 *
 * 実装方針:
 * - カルーセルライブラリは使わず、素の CSS scroll snap（snap-x snap-mandatory + snap-start）で実現する。
 * - 端の検知は ScrollableTable と同じ scrollLeft / clientWidth / scrollWidth の比較で行い、
 *   スクロールできない方向の矢印とフェードを消す。
 * - キーボード: スクロールコンテナ自体を tabIndex={0} にして矢印キーでスクロールできるようにしつつ、
 *   矢印ボタンも通常のボタンとして残す（aria-hidden にしない）。
 * - ProductCard は stretched-link（after:absolute inset-0）でカード全面がリンクになるため、
 *   カードの上に要素を重ねない構造にしている（ranked の順位番号もカードの外に置く）。
 *
 * 造形方針:
 * - 面を3種類（lane / ranked / quiet）持ち、呼び出し側が交互に切り替える。同じ地・同じカード幅の
 *   レーンが3本以上続くとスクロールのリズムが完全に止まるため、造形の交替はレーンの必須要件。
 * - 版面は wrap-wide 固定。ホームの他セクション（表紙・署名帯・カテゴリ・新着）と同じ 1320px に
 *   揃えないと、スクロール中に紙の左端が 84px 動く。
 */
export default function ProductLane({
  title,
  subtitle,
  eyebrow,
  items,
  variant = 'lane',
}: ProductLaneProps) {
  const scrollRef = useRef<HTMLUListElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const overflow = el.scrollWidth > el.clientWidth + 1;
      setCanScrollLeft(overflow && el.scrollLeft > 1);
      setCanScrollRight(overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // カード画像の読み込みやフォント適用で幅が変わる場合にも追随する
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [items.length]);

  const scrollBy = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * SCROLL_RATIO,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  if (items.length === 0) return null;

  const ranked = variant === 'ranked';
  const quiet = variant === 'quiet';

  // 帯の地。ranked は深緑フルブリード、quiet は沈んだ地＋上下ヘアライン、既定は生成りのまま。
  const bandClass = ranked
    ? 'on-dark band-lg bg-invert text-on-dark'
    : quiet
      ? 'band-lg border-y border-line bg-sunken'
      : 'band';

  // 端の処理は「地の色のグラデーションをカードの上に重ねる」のをやめ、
  // スクロール領域そのものを mask で抜く。
  //   旧: bg-gradient-to-l from-invert（深緑）を生成りのカードの上に敷いていたため、
  //       ranked 帯ではカード面に暗い膜が掛かり、紙が濁って見えていた（A2 の指摘）。
  //   新: カード側を透明に落として帯の地色が透ける＝「帯の地でカードを裁ち落とす」。
  //       重ねる面が無いので、どの帯の地色でも濁りが出ない。
  //
  // 幅は CSS 変数 --lane-fade でビューポート別に持つ（inline style ではメディアクエリが書けない）。
  //   ・明るい帯（lane / quiet）は **広げる**。抜いた先の地色（page / sunken）がカードの
  //     surface と近いため、旧 2rem では減衰が読めず「画面端で生に切れている」ようにしか
  //     見えなかった（実測: 右端 60px の減衰が RGB 4 段階しかなかった）。
  //     r3 で surface:page を 1.09 → 1.21 に開いたのと合わせて 4rem まで広げる。
  //   ・ranked（深緑帯）は逆に **768px で狭める**。カード幅が 36% しかない帯で 4rem 取ると
  //     3枚目の商品名・価格がマスクの途中で飲まれていた。lg でだけ 5rem に開き、
  //     順位番号の柱（lg:w-16）が「字の破片」として残らないようにする。
  const laneFade = ranked
    ? '[--lane-fade:3rem] lg:[--lane-fade:5rem]'
    : '[--lane-fade:2.5rem] md:[--lane-fade:3.5rem] lg:[--lane-fade:4rem]';
  const maskStops = [
    canScrollLeft ? 'transparent 0, #000 var(--lane-fade)' : '#000 0',
    canScrollRight ? '#000 calc(100% - var(--lane-fade)), transparent 100%' : '#000 100%',
  ].join(', ');
  const edgeMask =
    canScrollLeft || canScrollRight
      ? {
          maskImage: `linear-gradient(to right, ${maskStops})`,
          WebkitMaskImage: `linear-gradient(to right, ${maskStops})`,
        }
      : undefined;

  // カード幅: モバイルで約1.6枚、デスクトップで 4〜5枚が見える。
  // 「次がある」ことが常に見えるよう、割り切れない幅をあえて選んでいる。
  // lg の下限は「12文字の商品名（マイクロファイバータオル等）が text-h3 で1行に入る
  // 内寸 218px」から逆算している。これより詰めると全カードで語中改行が出る。
  // quiet は一回り大きくして、直前のレーンと判型が変わったことを分かるようにする。
  const itemWidth = ranked
    ? 'w-[72%] sm:w-[48%] md:w-[36%] lg:w-[27%]'
    : quiet
      ? 'w-[74%] sm:w-[46%] md:w-[34%] lg:w-[23%]'
      : 'w-[60%] sm:w-[38%] md:w-[30%] lg:w-[21%]';

  // 深緑帯の上でも同じ造形の生成りの丸ボタンを使う。操作系は面が変わっても不変にする。
  // hover 背景は iconBtn 側の hover:bg-sunken をそのまま活かす（上書きすると衝突する）。
  const arrowButton = `${iconBtn('md')} border-0 bg-surface shadow-paper`;

  const arrows = (
    /* 矢印は端で消す。モバイルは指スクロールが自然なので md 以上でのみ表示する。 */
    <div className="hidden shrink-0 items-center gap-2 md:flex">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label={`${title}を前へスクロール`}
          className={arrowButton}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label={`${title}を次へスクロール`}
          className={arrowButton}
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );

  return (
    <div className={bandClass}>
      <section
        role="region"
        aria-roledescription="carousel"
        aria-label={title}
        className="wrap-wide"
      >
        <SectionHead
          title={title}
          subtitle={subtitle}
          eyebrow={eyebrow}
          tone={ranked ? 'onDark' : 'default'}
          right={arrows}
        />

        <div className="relative mt-6">
          <ul
            ref={scrollRef}
            tabIndex={0}
            aria-label={`${title}の商品一覧（横にスクロールできます）`}
            // 右端に余白を足し、最後のカードも先頭まで送れるようにする（FAB との被りも避ける）。
            // .stagger（globals.css §3b）で直下の子の animation-delay を 45ms ずつ増やす。
            // 遅れは 8 枚で頭打ちになるので、右端のカードがいつまでも出ない状態にはならない。
            // ⚠ 子は `animate-rise` を素で書くこと。`motion-safe:animate-rise` は
            //   生成 CSS の中で .stagger より後ろに出力され、animation ショートハンドが
            //   animation-delay を 0s に戻してしまう（実測。段差がまったく付かなくなる）。
            //   prefers-reduced-motion は globals.css §5 の一括ガードが !important で潰すので、
            //   motion-safe を書かなくてもモーション設定は尊重される。
            className={`stagger flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto pb-2 [--stagger-step:45ms] [scrollbar-width:thin] md:pr-16 md:[scroll-padding-right:4rem] ${laneFade}`}
            // 端のフェードは mask。スクロールしても mask はこの箱の border-box に固定されるので、
            // 「版面の端でカードが裁ち落とされる」見え方が保たれる。
            style={edgeMask}
          >
            {items.map((item, index) => (
              // relative は必須。中の sr-only（position:absolute）の包含ブロックを li に閉じ込める。
              // これが無いと包含ブロックがスクローラの外（下の div.relative）になり、
              // 静的位置（レーン右端の遥か先）に置かれてページ全体に横スクロールが発生する。
              <li
                key={item.product.id}
                className={`relative snap-start flex-none animate-rise ${itemWidth}`}
              >
                {ranked ? (
                  <div className="flex h-full items-stretch gap-2">
                    {/* 順位はカードの外（兄弟）に置く。カード上に重ねると stretched-link を塞ぐため。
                        明朝の大きな数字を薄く敷き、誌面のノンブルのように見せる。 */}
                    {/* 番号の柱は細くする。lg:w-20（80px）はカードの文字領域を 140px 台まで削り、
                        商品名がカタカナ語の途中で折れる主因になっていた。 */}
                    <div className="flex w-10 shrink-0 items-start justify-center pt-1 sm:w-12 lg:w-16">
                      <span className="sr-only">{index + 1}位</span>
                      {/* 桁揃えは tabular-nums で取る。.tnum は font-num（Inter）を強制するため
                          ここでは使わない（順位数字は明朝で組む、が型の規律）。
                          色: brand-400/45 は深緑地で 2.2:1 しか出ず「順位が読めないランキング」
                          になっていた。brand-300/70（約 4.6:1）まで上げ、主題として読ませる。 */}
                      <span
                        aria-hidden="true"
                        className="font-mincho text-[clamp(2.75rem,4.5vw,4rem)] font-bold leading-none tabular-nums text-brand-300/70"
                      >
                        {index + 1}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <ProductCard product={item.product} tone="onDark" />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col">
                    <ProductCard product={item.product} />
                    {item.reason && (
                      // 丸めは文字数ではなく「文」で行う（truncateAtSentence）。
                      // line-clamp-2 のままだと「食卓の必…」「ミルで挽…」と文節の途中で切れ、
                      // 約物・改行位置まで面倒を見る組版の中でここだけ無配慮になっていた。
                      //
                      // 箱の丈は 2 行ぶん（text-caption の line-height 1.7 × 2 = 3.4em）で固定する。
                      // 丸めた結果は 1〜2 行と可変なので、予約しないと同じ行のカード下端が揃わない。
                      // line-clamp-2 は最後の砦（想定外に長い reason が来ても器を壊さない）として残す。
                      <p className="mt-2 line-clamp-2 min-h-[3.4em] text-caption text-ink-muted jp-body">
                        {truncateAtSentence(item.reason, REASON_BUDGET)}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

        </div>
      </section>
    </div>
  );
}
