/**
 * 生成待ちのタイピングインジケータ（3点の点滅）。
 *
 * 点滅は体系の keyframe（bump）を使う。**Tailwind 既定の animate-bounce は使わない**
 * （跳ね方が体系の他の動きと揃わない）。reduced-motion では点滅を止める。
 *
 * 外側の器（角丸・余白・添え文）は呼び出し側が持つ。アシスタントのパネルは rounded-2xl、
 * 商品ページの Q&A は rounded-lg + 説明文と、器は別物でよい。揃えるべきは点の造形と周期だけ。
 */
export default function TypingDots() {
  return (
    <>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-line-strong motion-safe:animate-[bump_1.1s_ease-in-out_infinite] motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </>
  );
}
