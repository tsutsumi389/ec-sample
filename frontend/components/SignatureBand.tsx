import type { ComponentType } from 'react';
import { CupMotif, KettleMotif, PlantMotif, type MotifProps } from '@/components/BrandMotifs';

/**
 * 棚に並ぶ3点。left は 0% / 42% / 70% の非等間隔。右側に大きく余白を残すことで
 * 和の「間」を作る（等間隔にすると図案が「アイコン3個」に見えて誌面にならない）。
 * キャプションの列も同じ 42 : 28 : 30 の比で切り、線画の真下に見出しが来るようにしている。
 * モバイルは等幅3列（0 / 33.3 / 66.6%）に戻すので、線画側も max-md で同じ位置に寄せる。
 *
 * 高さは3点とも同じ（h-20 md:h-24 lg:h-36）。BrandMotifs の viewBox を 120×120 の
 * 正方形に統一し、墨の接地線を y=108 に揃えたので、同じ数字を渡せば光学サイズも接地も揃う。
 * r2 までは h-36 / h-24 / h-28 と個別に手当てしていたため、ケトルだけが湯呑みの
 * 2.2 倍幅・約3倍面積になり、棚の左半分をケトル1点が占拠していた。
 */
const SHELF: {
  Motif: ComponentType<MotifProps>;
  left: string;
  eyebrow: string;
  copy: string;
}[] = [
  {
    Motif: KettleMotif,
    left: 'left-[0%]',
    eyebrow: 'KETTLE',
    // 390px では 1 列 112px しかない。8 文字（約 106px）を上限にして 1 行に収める
    // （jp-name と併せて、収まらない場合でも語中では折れないようにしている）
    copy: '朝いちばんの湯。',
  },
  {
    Motif: CupMotif,
    left: 'left-[33.333%] md:left-[42%]',
    eyebrow: 'CUP',
    copy: '手になじむ器。',
  },
  {
    Motif: PlantMotif,
    left: 'left-[66.666%] md:left-[70%]',
    eyebrow: 'GREEN',
    copy: '窓辺の小さな緑。',
  },
];

/**
 * 署名帯 ——「日々帖の見開き」の右頁。表紙（HomeBillboard）の直後に必ず置く。
 *
 * 造形の意図:
 * - 左は縦組み（writing-mode: vertical-rl）の標語。`text-orientation: upright` は
 *   付けない。付けると「。」が回転して壊れるため、既定の mixed が正しい縦組み。
 *   縦組みは md 以上限定で、モバイルは横組みに戻す（ブラウザ差と高さの都合）。
 * - 右は「編集の一文（上）」と「1本の水平罫＝棚（下）」の2段。棚の上に線画3点を非等間隔で置く。
 * - **右段の余りは段の「外」（上下）へ逃がす。** r2 では justify-between で本文と棚を
 *   上下端に張り付けていたため、1440px で本文の下に 112px の完全な空白が入り、
 *   右カラムが「文章のブロック」と「線画のブロック」の2つに割れて見えていた。
 *   いまは本文の直下に gap-8（32px）で棚を置き、段全体を justify-center で置く。
 *   段の内側に空洞が無くなり、左の縦組みとの高さ差は上下の余白に均等に散る。
 *   内側の穴は「壊れて」見えるが、外側の余白は「間」に見える。
 *   棚の丈（h-32 / md:h-40 / lg:h-48）は左の縦組みの丈に合わせて調整してある。
 *   **線画の丈は棚の丈とセットで決めること。** 器だけ高くして線画を小さいままにすると、
 *   棚の上に見えない空きが残り、リード文と線画のあいだが開いて右段が2つに割れる
 *   （実測: 旧 lg:h-36 では 1440px でリード文下端→線画上端が 95px。いまは 48px）。
 * - **影を一切持たせない。** 前後が影付きカードだらけなので、この面だけが「止まって」
 *   見えることが狙い。深度は地の色差（bg-sunken）とヘアラインだけで作る。
 */
export default function SignatureBand() {
  return (
    <section className="band-xl border-y border-line bg-sunken">
      {/* items は既定の stretch。左（縦組み）と右（文＋棚）が必ず同じ高さになり、
          棚のキャプション下端が縦組みの下端と揃う。 */}
      <div className="wrap-wide md:grid md:grid-cols-[auto_1fr] md:gap-x-16">
        {/* 左: 縦組みの標語。罫 → 柱 → 標語 の順に置かれていく（.stagger / globals.css §3b）。 */}
        <div className="stagger [--stagger-step:80ms]">
          <div aria-hidden className="h-px w-12 animate-rise bg-line-strong" />
          <p className="mt-4 animate-rise text-eyebrow uppercase font-num text-ink-muted">
            HIBINO — 日々の暮らしの道具店
          </p>
          {/* md 以上で 2 段の縦組みにする。改行位置は <br> で固定し、
              md:whitespace-nowrap で意図しない位置での折り返しを封じている。 */}
          <h2 className="mt-6 animate-rise font-mincho text-display text-ink jp-head md:mt-8 md:h-[19rem] md:whitespace-nowrap md:tracking-[0.08em] md:[writing-mode:vertical-rl] lg:h-[24rem]">
            日々を、
            <br />
            道具から。
          </h2>
        </div>

        {/* 右: 編集の一文 ＋ 棚。本文と棚を1つの流れとして連結し、余りは段の外（上下）へ逃がす。 */}
        <div className="mt-10 flex flex-col justify-center gap-6 md:mt-0 md:gap-8">
          {/* 34rem。32rem では2行目（30文字 ≒ 519px）が 512px の器に 7px 足りず、
              「です。」だけが3行目に落ちて孤立行になっていた（text-wrap:pretty は和文では効かない）。 */}
          <p className="max-w-[34rem] animate-rise text-body-lg text-ink-soft jp-body">
            毎日ふれるものほど、すこし良いものを。
            <br className="hidden md:inline" />
            日々帖は、暮らしの道具をひとつずつ選んでご紹介する小さな冊子です。
          </p>

          <div>
            {/* 棚の器。線画は下端（罫）に接地する。 */}
            <div className="stagger relative h-32 border-b border-line-strong [--stagger-step:90ms] md:h-40 lg:h-48">
              {SHELF.map(({ Motif, left }) => (
                <Motif
                  key={left}
                  aria-hidden
                  // 読み込み時に 0 / 90 / 180ms 遅れて棚に置かれていく（.stagger）
                  // 丈は棚の器（h-32 / md:h-40 / lg:h-48）を埋める寸法にする。r2 の
                  // h-20 / h-24 / h-36 では器の上に 48〜64px の空きが残り、リード文の下端と
                  // 線画のあいだが 1440 で約 95px 開いて、右段が「文章の塊」と「図版の塊」に
                  // 割れて見えていた（左の縦組みの丈に対して緩い）。器いっぱいに置き直し、
                  // リード文との gap も 48px → 32px に詰めて 1 つの流れに戻す。
                  className={`pointer-events-none absolute bottom-0 h-24 select-none text-brand-700 animate-rise md:h-32 lg:h-44 ${left}`}
                />
              ))}
            </div>

            {/* md 以上は棚の3点と同じ 42 : 28 : 30 で列を切り、線画の真下にキャプションを置く。
                390px では中央列が 77px しか無く「手になじ／む器。」と語中で割れるため、
                モバイルだけ等幅3列に戻す（線画側も max-md で 0 / 33.3 / 66.6% に寄せてある）。 */}
            <ul className="mt-5 grid grid-cols-3 gap-x-3 md:grid-cols-[42fr_28fr_30fr] md:gap-x-0">
              {SHELF.map(({ eyebrow, copy }) => (
                <li key={eyebrow} className="min-w-0 md:pr-4">
                  <p className="text-eyebrow uppercase font-num text-ink-muted">{eyebrow}</p>
                  <p className="mt-2 text-caption text-ink-soft jp-name">{copy}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
