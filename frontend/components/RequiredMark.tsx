/**
 * 必須項目の印。
 *
 * 「アスタリスク（視覚）＋ sr-only の『（必須）』（読み上げ）」の2行1組が、8ファイル
 * 24箇所に写されていた。しかも色が既に割れていて、店頭側は `text-critical-600`、
 * 管理側は体系外の `text-red-600` になっていた。ここで1つに寄せる。
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
