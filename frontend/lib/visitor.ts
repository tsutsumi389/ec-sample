/**
 * 端末ごとの匿名識別子（visitor_id）と、訪問単位のセッション識別子。
 *
 * A/Bテストの割り当て単位であり、行動ログの主キーでもある。ログイン前後で同じ体験を
 * 見せ続ける必要があるため、user_id ではなくこちらを軸にする（ECではカート投入までの
 * 大半が未ログインで、user_id を単位にするとその区間の効果が測れなくなる）。
 *
 * SSR（window 不在）や localStorage 例外は握りつぶし、識別できない場合は null を返す。
 * null のときサーバー側は計測も割り当ても行わず、既定のUIが出るだけで機能は壊れない。
 */

const VISITOR_KEY = 'hibino:visitor-id';
const SESSION_KEY = 'hibino:session-id';

function createId(): string {
  // localhost / https では randomUUID が使える。使えない環境向けに簡易生成へ落とす。
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 端末の匿名ID。未発行なら発行して localStorage に保存する（クッキーは使わない）。 */
export function getVisitorId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = createId();
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    // プライベートモード等で保存できない場合は識別を諦める（計測されないだけ）。
    return null;
  }
}

/**
 * 訪問（タブを開いてから閉じるまで）の識別子。回遊やファネルの分析に使う。
 * sessionStorage に置くのでタブを閉じると自然に切れる。
 */
export function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = createId();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return null;
  }
}
