/**
 * 読み込み中のリング。
 *
 * 色は currentColor に載せる。以前は border-gray-300（＝washi-400 のエイリアス）を
 * 直書きしていたため、深緑の CTA の中や暗い帯の上に置くと軌道が地に沈んでいた。
 * currentColor なら btn('primary') の中では白、本文中では ink と、置いた文脈の
 * 文字色にそのまま従う（呼び出し側は text-* を1つ足すだけで色を変えられる）。
 *
 * 軌道（残り3/4）は currentColor の 25%、先頭の 1/4 だけ不透明にして回転方向を読ませる。
 * ⚠ `border-current/25` は使えない。Tailwind 3 の不透明度修飾子は currentColor を
 *   解釈できず、修飾子が黙って捨てられて軌道が不透明になる（実測でCSSに出力されない）。
 *   color-mix を明示すること。
 * prefers-reduced-motion では globals.css §5 の全称ガードで回転が止まり、
 * リングだけが残る（role="status" とラベルは残るので意味は落ちない）。
 */
/**
 * label で名乗り方を変えられる。
 * ・既定（省略）… role="status" + 「読み込み中」。単独で置くリング。
 * ・文字列 … その文言で名乗る（「追加中」など、待っている中身が言える場所）。
 * ・null … aria-hidden。周囲に別の live 領域があり、二重に読み上げさせたくない場所
 *   （中身が空のまま新規挿入される live 領域は読まれない実装が多く、状態通知は
 *   1箇所へ寄せるほうが確実）。
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
