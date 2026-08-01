import { api } from './api';
import type { Category } from './types';

/**
 * 公開カテゴリ一覧（GET /categories）の取得を1本にまとめる。
 *
 * なぜ要るか: 同じ一覧を独立に引く場所が6つあり、うち2〜3つは**同じ画面の同じコミットで
 * 同時に飛ぶ**。/products では ProductListing（チップのラベル用）と、その子の
 * ProductFilters（チップのボタン列用）が別々に投げて2本、/categories/[id] では
 * ページ自身の見出し解決が加わって3本になる。中身は完全に同一。
 *
 * 進行中の Promise を共有するので、同時に呼ばれても往復は1回で済む。
 * 解決後もその Promise を保持して以降は即座に返す（カテゴリはほぼ不変のため）。
 * 失敗したら控えを捨て、次の呼び出しでもう一度取りに行けるようにする。
 */
let cached: Promise<Category[]> | null = null;

export function fetchCategories(): Promise<Category[]> {
  if (!cached) {
    cached = api.get<Category[]>('/categories').catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

/**
 * 控えを捨てる。**管理画面でカテゴリを作成・更新・削除したら必ず呼ぶこと。**
 * 呼ばないと、同じセッションで開いた商品フォームの選択肢に新しいカテゴリが出ない。
 */
export function invalidateCategories(): void {
  cached = null;
}
