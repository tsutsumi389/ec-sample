/**
 * 商品グリッドの列組み。
 *
 * スケルトンと実グリッドで必ず同じ定義を使う（列数や余白がずれると、
 * 読み込み完了の瞬間にカードの位置が跳ねる）。行間は列間より広く取り、
 * 誌面の行送りを作るのが本デザインの規律。
 *
 * 列数は 390 / 768 / 1024 / 1280 の4段で分ける。768 を 390 と同じ2列にすると
 * カード内寸が 330px 前後まで太り、図版だけが大きい間延びした版面になる。
 */

/** 商品一覧・カテゴリ一覧（1画面に多く並べる。md で3列、lg で3列、xl で4列） */
export const listingGrid = 'grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-3 xl:grid-cols-4';

/** トップの新着グリッド（先頭セルを 2×2 に拡張するため lg で4列固定） */
export const newArrivalsGrid = 'grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-3 lg:grid-cols-4';

/** 関連商品・レコメンド・お気に入りなど、本文に添える小さめのグリッド */
export const recommendGrid = 'grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4';
