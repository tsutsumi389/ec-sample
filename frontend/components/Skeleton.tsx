import { recommendGrid } from '@/lib/gridStyles';

/**
 * スケルトンの明滅。
 *
 * サイトの反復モーションはこの1本（tailwind.config.ts の `breathe` = 1.6s / ease-standard）
 * だけに閉じる。Tailwind 既定の `animate-pulse` は体系の duration・easing のどちらにも
 * 属さないので使わない。
 * ⚠ Tailwind の animate-* は animation ショートハンドを書くので、
 *   `animate-breathe [animation-duration:…]` では後勝ちで巻き戻される。値を変えるときは
 *   tailwind.config.ts の animation.breathe を直すこと。
 * ⚠ 同じ明滅を使う場所（components/CategoryTiles.tsx / components/HomeSections.tsx の
 *   BillboardSkeleton / components/Header.tsx）も必ずこのトークンを import すること。
 *   地色や角丸が Skeleton と違うだけの箇所は、コンポーネントではなくこのトークンだけを共有する。
 */
export const PULSE = 'animate-breathe motion-reduce:animate-none';

export function Skeleton({ className }: { className?: string }) {
  return <div className={`rounded-md bg-sunken ${PULSE} ${className ?? ''}`} />;
}

/**
 * ProductCard と同じ骨格のカードスケルトン。
 *
 * 実カード（ProductCard.tsx の本文ブロック）と**行の構成と高さを1対1で合わせる**こと。
 * 高さの根拠を lh / em で書いているのは、text-h3 のトークン（tailwind.config.ts）が
 * 変わっても追従させるため。
 *
 * ⚠ 縦位置の規律（本文は名前=上端 / 価格=下端、名前欄の丈はその幅で商品名が実際に
 *   何行になるか）は実カードに合わせる。外すと読み込み完了の瞬間に価格が1行ぶん
 *   （約28px）跳ねる。いまは /products のカード高が 390〜1440 の全幅で Δ=0.0px。
 */
export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-surface shadow-paper">
      <div className={`aspect-[4/3] bg-sunken ${PULSE}`} />
      <div className="flex flex-1 flex-col justify-between p-4">
        {/* 器の丈は「その幅で商品名が実際に何行になるか」。390px は2列＝カード内寸 187px で
            ほぼ必ず2行、md（768px / 3列＝230px）から1行に収まる（実測）。 */}
        <div className="h-[2lh] text-h3 md:h-[1lh]">
          <div className="flex h-[1lh] items-center">
            <Skeleton className="h-[0.7em] w-11/12" />
          </div>
        </div>
        <div className="mt-1.5 flex h-[1lh] items-center text-h3">
          <Skeleton className="h-[0.75em] w-2/5" />
        </div>
      </div>
    </div>
  );
}

/**
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
