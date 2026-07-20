/**
 * 「最近の検索」キーワード履歴を localStorage で管理する。
 * recentlyViewed.ts と同じ流儀で、SSR（window 不在）や localStorage 例外は
 * すべて握りつぶし、履歴が使えなくても検索本体は壊れないようにする。
 */

const STORAGE_KEY = 'hibino:search-history';
const MAX_ITEMS = 5;

/** 履歴として妥当なキーワードか（空文字・空白のみは弾く）。 */
function normalize(term: string): string {
  return term.trim();
}

/** 新しい順のキーワード配列を返す。取得不可・不正データ時は空配列。 */
export function getSearchHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 文字列以外や空文字は捨てる。重複はここでは残さない（保存時に排除済みだが念のため）。
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * 検索キーワードを履歴の先頭へ追加する。
 * 重複（大文字小文字は区別しない）は先頭に繰り上げ、最大 5 件で打ち切る。
 * 変更後の配列を返すので、呼び出し側は state 反映に使える。
 */
export function addSearchHistory(term: string): string[] {
  const value = normalize(term);
  if (typeof window === 'undefined' || !value) return getSearchHistory();
  try {
    const current = getSearchHistory();
    const lower = value.toLowerCase();
    const deduped = current.filter((t) => t.toLowerCase() !== lower);
    const next = [value, ...deduped].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    // 保存不可（プライベートモード等）は無視し、現状の履歴を返す
    return getSearchHistory();
  }
}

/** 指定キーワードを履歴から削除し、変更後の配列を返す。 */
export function removeSearchHistory(term: string): string[] {
  const value = normalize(term);
  if (typeof window === 'undefined') return getSearchHistory();
  try {
    const lower = value.toLowerCase();
    const next = getSearchHistory().filter((t) => t.toLowerCase() !== lower);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return getSearchHistory();
  }
}

/** 履歴をすべて消去する。 */
export function clearSearchHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 消去不可は無視
  }
  return [];
}
