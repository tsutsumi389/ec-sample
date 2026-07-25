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
export default function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="読み込み中"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-[color-mix(in_srgb,currentColor_25%,transparent)] border-t-current ${className}`}
    />
  );
}
