/**
 * 「最近見た商品」の閲覧履歴を localStorage で管理する。
 * SSR（window 不在）や localStorage 例外は握りつぶして安全に動作させる。
 */

const STORAGE_KEY = 'hibino:recently-viewed';
const MAX_ITEMS = 10;

/** 商品IDを履歴の先頭に追加する（重複除去・最大10件）。 */
export function recordRecentlyViewed(productId: number): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(productId)) return;
  try {
    const current = getRecentlyViewedIds();
    const next = [productId, ...current.filter((id) => id !== productId)].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存不可（プライベートモード等）は無視する
  }
}

/** 新しい順の商品ID配列を返す。取得不可・不正データ時は空配列。 */
export function getRecentlyViewedIds(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
  } catch {
    return [];
  }
}
