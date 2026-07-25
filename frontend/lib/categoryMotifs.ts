import type { MotifName } from '@/components/BrandMotifs';

/**
 * カテゴリ名 → 線画の対応表。**誌面の線画に意味を持たせる唯一の源**。
 *
 * r2 までは `MOTIFS[i % 3]` の index 循環だったため、5件のカテゴリでは
 * 01 と 04 が同じケトル、02 と 05 が同じ湯呑みになり、「同じ判子を2回押した並び」
 * に見えていた。目次の札は誌面の中で唯一「意味を持つべき装飾」なので、
 * 割り当ては **カテゴリ名から決める**。
 *
 * キーは backend/app/seed.py のシードカテゴリ名。部分一致で引くので
 * 「キッチン家電」「キッチン用品」のどちらも同じ図案に落ちる。
 * 該当が無いカテゴリは 'none'（図版なし・通し番号と罫だけの札）にする。
 * 無関係な図案を当てるくらいなら、持たせないほうが目次として正しい。
 *
 * この表はカテゴリ札（CategoryTiles）と扉の線画（PageMasthead）の両方が使う。
 * 同じカテゴリはホームの札でもカテゴリページの扉でも同じ図案になる＝線画が目次として働く。
 * シードのカテゴリ名を変えるときはこの表も更新すること。
 */
const MOTIF_BY_KEYWORD: [pattern: RegExp, motif: MotifName][] = [
  [/アウトドア|キャンプ|旅/, 'lantern'],
  [/キッチン|調理|台所/, 'kettle'],
  [/ファッション|小物|アクセサリ|雨/, 'umbrella'],
  [/日用品|掃除|収納/, 'broom'],
  [/生活家電|家電|季節/, 'fan'],
  [/食器|器|飲/, 'cup'],
  [/園芸|グリーン|植物|インテリア/, 'plant'],
];

/** カテゴリ名から線画を引く。該当が無ければ 'none'（図版なし）。 */
export function motifForCategory(name: string | null | undefined): MotifName | 'none' {
  if (!name) return 'none';
  for (const [pattern, motif] of MOTIF_BY_KEYWORD) {
    if (pattern.test(name)) return motif;
  }
  return 'none';
}
