/**
 * 必須項目の印。アスタリスク（視覚）と sr-only の「（必須）」（読み上げ）で1組——
 * 片方だけを置くと、視覚か読み上げのどちらかで必須が伝わらない。
 *
 * 使い方: `<label htmlFor="city">市区町村<RequiredMark /></label>`
 */
export default function RequiredMark() {
  return (
    <>
      <span className="ml-0.5 text-critical-600" aria-hidden="true">
        *
      </span>
      <span className="sr-only">（必須）</span>
    </>
  );
}
