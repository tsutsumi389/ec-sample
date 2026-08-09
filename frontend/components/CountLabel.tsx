/**
 * 見出しの右端に置く件数（「全 12 件」）。
 *
 * PageMasthead / SectionHead の `right` スロットに同じ3行が7箇所へ写され、既に割れていた
 * ——`tnum text-num-lg` と `text-num-lg tnum` でクラス順が2通り、ReviewSection は
 * `whitespace-nowrap` を落としていた。数値の号数（版面で唯一読ませる数字）を変えるときに
 * 回る場所を1つにする。
 *
 * 助数詞はサイト全体の規律に従う——数えるものが「品物の個数」なら **点**、
 * それ以外（注文・レビュー・商品の種類数）は **件**（components/StockLabel.tsx の頭注と同じ）。
 */
export default function CountLabel({
  value,
  unit = '件',
  size = 'lg',
}: {
  value: number;
  unit?: '件' | '点';
  /**
   * 'lg' は扉（PageMasthead）の右端＝そのページで唯一読ませる数値。
   * 'md' は節見出し（SectionHead）の右端で、扉の数値より一段下げる。
   */
  size?: 'lg' | 'md';
}) {
  return (
    <p className="whitespace-nowrap text-body text-ink-muted">
      全 <span className={`tnum text-ink ${size === 'lg' ? 'text-num-lg' : ''}`}>{value}</span>{' '}
      {unit}
    </p>
  );
}
