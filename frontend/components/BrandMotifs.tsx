import type { SVGProps } from 'react';

/**
 * ブランドの線画モチーフ。BrandHero の装飾イラストを線画だけに切り出し、
 * 全画面で反復させる「判型記号」にしたもの。
 *
 * ── 共通グリッド（崩さないこと）──────────────────────────────────────
 * **すべてのモチーフは viewBox="0 0 120 120" の正方形**で描く。字面枠は内側 96×96
 * （x/y ともに 12〜108）で、その中に線を収める。
 *
 * なぜ正方形に揃えるのか（r2 の実測）:
 *   旧版は viewBox が 160×120 / 88×100 / 82×114 とばらばらだったため、
 *   呼び出し側が `h-*` で高さを揃えると **ケトルだけが湯呑みの 2.2 倍幅・約 3 倍面積**
 *   になっていた。署名帯・フッター・ログイン・カテゴリ札の4箇所がそれぞれ別の高さで
 *   手当てしていた結果、同じ3点セットの大小関係がページごとに4通りに割れていた。
 *   viewBox が正方形なら `h-16` は必ず 64×64 の枠になり、光学サイズは呼び出し側の
 *   1つの数字だけで決まる。個別の高さテーブル（旧 CategoryTiles の MOTIF_HEIGHT /
 *   MOTIF_SCALE）はもう要らない。
 *
 * 規律:
 * - fill:none / stroke:currentColor が既定。色は置く面に応じて `text-*` で継承させる。
 * - 面（塗り）は持たせない。純粋な線画にする。
 * - 装飾用途では呼び出し側で必ず `pointer-events-none select-none` を付けること。
 * - 図案を足すときも 120×120 / 内側 96×96 / stroke-width 3 を守る。
 * - **接地線は y=108 に統一する。** 署名帯・カテゴリ札・ブランドヒーローはどれも
 *   「1本の水平罫（棚）の上に線画を置く」造形なので、図案ごとに墨の下端が違うと
 *   同じ棚の上で浮くものと接地するものが混ざる。器の底・鉢の底・台座の底は必ず 108。
 */
export type MotifProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 120 120',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

/**
 * ケトル。胴 → 蓋 → つまみ → 注ぎ口の順に描く。
 * 注ぎ口は胴の輪郭上から出て、口を1本の線で閉じる（宙に浮いた鉤形にしない）。
 */
export function KettleMotif({ className = 'h-16', ...rest }: MotifProps) {
  return (
    <svg {...base} className={className} {...rest}>
      {/* 胴。底は平ら、肩でわずかに絞る */}
      <path d="M30 108 V84 Q30 70 48 70 H72 Q90 70 90 84 V108 Z" />
      {/* 蓋（胴のシルエットの内側に収める） */}
      <path d="M44 70 q15 -9 28 0" />
      {/* つまみ */}
      <circle cx="58" cy="60" r="4" />
      {/* 注ぎ口。胴の輪郭上から出て、先端の口を1本の線で閉じる */}
      <path d="M30 82 Q16 75 12 64 L19 57 Q27 66 40 71" />
      {/* 取っ手 */}
      <path d="M90 78 q16 2 16 12 q0 10 -16 12" />
    </svg>
  );
}

/** 湯呑み + 取っ手 + 湯気2本。 */
export function CupMotif({ className = 'h-16', ...rest }: MotifProps) {
  return (
    <svg {...base} className={className} {...rest}>
      {/* 器 */}
      <path d="M26 76 h54 q-6 32 -27 32 q-21 0 -27 -32 Z" />
      {/* 取っ手 */}
      <path d="M80 80 q17 3 13 17 q-4 9 -15 7" />
      {/* 湯気 */}
      <path d="M43 68 q-7 -9 0 -18 q7 -9 0 -18" />
      <path d="M61 68 q-7 -9 0 -18 q7 -9 0 -18" />
    </svg>
  );
}

/** 鉢 + 葉3枚。 */
export function PlantMotif({ className = 'h-16', ...rest }: MotifProps) {
  return (
    <svg {...base} className={className} {...rest}>
      {/* 鉢 */}
      <path d="M38 78 h44 l-7 30 h-30 Z" />
      {/* 茎 */}
      <path d="M60 78 q-3 -25 -19 -34" />
      <path d="M60 78 q3 -22 17 -30" />
      {/* 葉 */}
      <path d="M41 44 q-13 3 -13 15 q15 2 18 -10 Z" />
      <path d="M77 48 q13 3 13 15 q-15 2 -18 -10 Z" />
      <path d="M60 43 q-8 -12 0 -25 q8 13 0 25 Z" />
    </svg>
  );
}

/** ランタン（アウトドア）。吊り手 + 笠 + 火屋 + 台座 + 炎。 */
export function LanternMotif({ className = 'h-16', ...rest }: MotifProps) {
  return (
    <svg {...base} className={className} {...rest}>
      {/* 吊り手 → 笠 → 火屋 → 台座 → 炎 */}
      <path d="M40 46 q20 -21 40 0" />
      <path d="M32 56 l8 -10 h40 l8 10 Z" />
      <path d="M38 56 h44 v42 h-44 Z" />
      <path d="M30 108 l8 -10 h44 l8 10 Z" />
      <path d="M60 70 q-9 10 0 20 q9 -10 0 -20 Z" />
    </svg>
  );
}

/** 傘（ファッション小物）。露先の波形で「布」を表す。 */
export function UmbrellaMotif({ className = 'h-16', ...rest }: MotifProps) {
  return (
    <svg {...base} className={className} {...rest}>
      {/* 石突き */}
      <path d="M60 31 v-8" />
      {/* 天（弧） */}
      <path d="M20 67 Q26 33 60 31 Q94 33 100 67" />
      {/* 露先（3つの波） */}
      <path d="M20 67 q10 -11 20 0 q10 -11 20 0 q10 -11 20 0" />
      {/* 中棒 + 手元 */}
      <path d="M60 31 V97 q0 11 -12 11 q-8 0 -10 -7" />
    </svg>
  );
}

/** 箒（日用品）。柄 + 穂 + 結び。 */
export function BroomMotif({ className = 'h-16', ...rest }: MotifProps) {
  return (
    <svg {...base} className={className} {...rest}>
      {/* 柄 → 穂 → 結び → 穂先 */}
      <path d="M60 22 v44" />
      <path d="M43 66 h34 l11 42 h-56 Z" />
      <path d="M39 86 h42" />
      <path d="M52 86 v22" />
      <path d="M60 86 v22" />
      <path d="M68 86 v22" />
    </svg>
  );
}

/** 扇風機（生活家電）。羽根は 120° 回転の複製で必ず等分になる。 */
export function FanMotif({ className = 'h-16', ...rest }: MotifProps) {
  const blade = 'M60 50 Q72 38 60 26 Q50 38 60 50 Z';
  return (
    <svg {...base} className={className} {...rest}>
      <circle cx="60" cy="50" r="30" />
      <path d={blade} />
      <path d={blade} transform="rotate(120 60 50)" />
      <path d={blade} transform="rotate(240 60 50)" />
      <circle cx="60" cy="50" r="4" />
      <path d="M60 80 v14" />
      <path d="M42 108 l5 -12 h26 l5 12 Z" />
    </svg>
  );
}

/**
 * 図案の語彙。カテゴリ名 → モチーフの対応は呼び出し側（CategoryTiles）が持つ。
 * ここは「この誌面が持っている線画の全部」を1箇所に集める役だけ。
 */
export const MOTIFS = {
  kettle: KettleMotif,
  cup: CupMotif,
  plant: PlantMotif,
  lantern: LanternMotif,
  umbrella: UmbrellaMotif,
  broom: BroomMotif,
  fan: FanMotif,
} as const;

export type MotifName = keyof typeof MOTIFS;
