/**
 * 読み込み中のプレースホルダ表示。
 * 共通の Skeleton ブロックと、ProductCard の構造に合わせたカード・グリッドを提供する。
 */

import { recommendGrid } from '@/lib/gridStyles';

/**
 * スケルトンの明滅。
 *
 * サイトの反復モーションはこの1本（tailwind.config.ts の `breathe` = 1.6s / ease-standard）
 * だけに閉じる。Tailwind 既定の `animate-pulse`（2s / cubic-bezier(.4,0,.6,1)）は
 * この体系の duration・easing のどちらにも属さないので使わない。
 * ⚠ Tailwind の animate-* は animation ショートハンドを書くので、
 *   `animate-breathe [animation-duration:…]` では後勝ちで巻き戻される。値を変えるときは
 *   tailwind.config.ts の animation.breathe を直すこと。
 * ⚠ 同じ明滅を使う場所（components/CategoryTiles.tsx / components/HomeSections.tsx の
 *   BillboardSkeleton）も必ずこのトークンを使う。
 */
const PULSE = 'animate-breathe motion-reduce:animate-none';

/** 汎用スケルトンブロック。className で形・サイズを調整する。 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={`rounded-md bg-sunken ${PULSE} ${className ?? ''}`} />;
}

/**
 * ProductCard と同じ骨格のカードスケルトン。
 *
 * 実カード（ProductCard.tsx の本文ブロック）と**行の構成と高さを1対1で合わせる**こと。
 *   図版 aspect-[4/3] → p-4 → 商品名欄1行（text-h3 = 18px × 1.55 = 27.9px）
 *   → mt-1.5 → 価格行（27.9px）→ p-4
 * 高さの根拠を lh / em で書いているのは、text-h3 のトークン（tailwind.config.ts）が
 * 変わっても追従させるため。
 *
 * ⚠ 縦位置の規律は実カードに合わせる（ProductCard.tsx の本文ブロックのコメントを参照）:
 *   ・本文は **名前=上端 / 価格=下端**（justify-between）
 *   ・名前欄の丈は **その幅で商品名が実際に何行になるか**（390=2行 / md 以上=1行）。
 *     実カードの h3 は予約高を持たない自然高なので、これで /products の
 *     カード高は 390 / 768 / 1024 / 1280 / 1440 の全幅で Δ=0.0px に一致する。
 *   縦位置の規律（上端・下端の固定）を外すと、読み込み完了の瞬間に
 *   価格が 1行ぶん（約28px）跳ねる。
 */
export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-surface shadow-paper">
      <div className={`aspect-[4/3] bg-sunken ${PULSE}`} />
      <div className="flex flex-1 flex-col justify-between p-4">
        {/* 商品名欄。字は1行だが、器の丈は「その幅で商品名が実際に何行になるか」に合わせる。
            390px は2列＝カード内寸 187px で商品名がほぼ必ず2行になり、md（768px / 3列＝
            230px）から1行に収まる（実測）。 */}
        <div className="h-[2lh] text-h3 md:h-[1lh]">
          <div className="flex h-[1lh] items-center">
            <Skeleton className="h-[0.7em] w-11/12" />
          </div>
        </div>
        {/* 価格行 */}
        <div className="mt-1.5 flex h-[1lh] items-center text-h3">
          <Skeleton className="h-[0.75em] w-2/5" />
        </div>
      </div>
    </div>
  );
}

/**
 * ProductCardSkeleton を並べた商品グリッドのスケルトン。
 * 列数と余白は置き換わる実グリッドと必ず一致させる（ずれると読み込み後に段差が出る）ため、
 * 既定と違う組み方をする画面は className でグリッド定義を渡すこと。
 */
export function ProductGridSkeleton({
  count = 8,
  className = recommendGrid,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`grid items-stretch ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
