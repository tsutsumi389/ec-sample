/**
 * 読み込み中のリング。
 *
 * 色は currentColor に載せる（呼び出し側が text-* を1つ足すだけで色を変えられ、
 * 深緑の CTA の中でも暗い帯の上でも軌道が地に沈まない）。
 * ⚠ `border-current/25` は使えない。Tailwind 3 の不透明度修飾子は currentColor を
 *   解釈できず、修飾子が黙って捨てられて軌道が不透明になる（実測でCSSに出力されない）。
 *   color-mix を明示すること。
 * prefers-reduced-motion では globals.css §5 の全称ガードで回転が止まり、
 * リングだけが残る（role="status" とラベルは残るので意味は落ちない）。
 *
 * label で名乗り方を変えられる。既定は role="status" +「読み込み中」、文字列を渡せば
 * その文言で名乗る。null は aria-hidden——周囲に別の live 領域があり、二重に読み上げ
 * させたくない場所用（状態通知は1箇所へ寄せるほうが確実に読まれる）。
 */
export default function Spinner({
  className = '',
  label,
}: {
  className?: string;
  label?: string | null;
}) {
  const ring = `inline-block h-4 w-4 animate-spin rounded-full border-2 border-[color-mix(in_srgb,currentColor_25%,transparent)] border-t-current ${className}`;
  if (label === null) return <span aria-hidden="true" className={ring} />;
  return <span role="status" aria-label={label ?? '読み込み中'} className={ring} />;
}
