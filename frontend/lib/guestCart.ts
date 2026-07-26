/**
 * ゲスト（未ログイン）のカートを localStorage で管理する。
 *
 * 「欲しい」と思った瞬間にログインを挟むと、その意思はほぼ失われる。そこで未ログインでも
 * カートに入れられるようにし、ログイン・会員登録の直後に POST /cart/merge でサーバーの
 * カートへ合算する（lib/auth-context.tsx）。
 *
 * ここが持つのは商品IDと数量だけ。価格・購入可否・在庫の判断はサーバー（POST /cart/preview）
 * に任せる。effective_price の計算をクライアントに写すと、必ずどちらかが古くなるため。
 * 数量の上限だけは、押した瞬間の手応えを返すために画面が持っている在庫数で丸める
 * （最終的な丸めはサーバーの解決結果で上書きされる）。
 *
 * SSR（window 不在）や localStorage 例外は握りつぶす。保存できない端末ではカートが
 * 空のまま見えるだけで、ログイン後の通常のカートは従来どおり動く。
 */

const STORAGE_KEY = 'hibino:guest-cart';

/** 明細数の上限。バックエンドの GuestCartIn.items（max_length=50）と揃える。 */
const MAX_LINES = 50;

/** カートの内容が変わったことを画面へ知らせるイベント名（同じタブ内で使う）。 */
export const GUEST_CART_CHANGE_EVENT = 'hibino:guest-cart-change';

export interface GuestCartLine {
  product_id: number;
  quantity: number;
}

function isValidLine(value: unknown): value is GuestCartLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Partial<GuestCartLine>;
  return (
    typeof line.product_id === 'number' &&
    Number.isFinite(line.product_id) &&
    line.product_id > 0 &&
    typeof line.quantity === 'number' &&
    Number.isInteger(line.quantity) &&
    line.quantity > 0
  );
}

/** 保存されている明細を返す。取得不可・不正データ時は空配列。 */
export function readGuestCart(): GuestCartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidLine).slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

/** 明細をまるごと差し替える。空になった場合はキーごと消す。 */
function writeGuestCart(lines: GuestCartLine[]): void {
  if (typeof window === 'undefined') return;
  try {
    const next = lines.filter(isValidLine).slice(0, MAX_LINES);
    if (next.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // 保存不可（プライベートモード等）は無視する。
  }
  // ヘッダーのカート数など、同じタブ内の購読者へ知らせる。localStorage の storage
  // イベントは他タブにしか飛ばないため、自前のイベントが必要。
  try {
    window.dispatchEvent(new Event(GUEST_CART_CHANGE_EVENT));
  } catch {
    // イベントを飛ばせない環境でも保存自体は済んでいる。
  }
}

/** カート内の数量合計（ヘッダーのバッジ用）。 */
export function guestCartCount(): number {
  return readGuestCart().reduce((sum, line) => sum + line.quantity, 0);
}

export interface GuestCartAddResult {
  /** 追加後のその商品の数量。 */
  quantity: number;
  /** 実際に増えた数。0 なら在庫上限（または明細数の上限）に達していて増やせなかった。 */
  added: number;
}

/**
 * 商品を追加する。すでに入っている場合は数量を足す。
 *
 * @param stock 画面が把握している在庫数。これを超えないように丸める。
 */
export function addToGuestCart(
  productId: number,
  quantity: number,
  stock: number
): GuestCartAddResult {
  if (!Number.isFinite(productId) || productId <= 0) return { quantity: 0, added: 0 };
  const lines = readGuestCart();
  const existing = lines.find((line) => line.product_id === productId);
  const current = existing?.quantity ?? 0;
  const limit = Math.max(0, Math.floor(stock));
  const next = Math.min(current + Math.max(1, Math.floor(quantity)), limit);
  if (next <= current) return { quantity: current, added: 0 };

  if (existing) {
    // 明細の並びは「入れた順」を保つ（カート画面の行順が押すたびに入れ替わらないように）。
    writeGuestCart(
      lines.map((line) => (line.product_id === productId ? { ...line, quantity: next } : line))
    );
  } else {
    if (lines.length >= MAX_LINES) return { quantity: current, added: 0 };
    writeGuestCart([...lines, { product_id: productId, quantity: next }]);
  }
  return { quantity: next, added: next - current };
}

/** 数量を指定の値に置き換える（1 未満は削除と同じ扱い）。 */
export function setGuestCartQuantity(productId: number, quantity: number): void {
  if (quantity < 1) {
    removeFromGuestCart(productId);
    return;
  }
  const lines = readGuestCart();
  if (!lines.some((line) => line.product_id === productId)) return;
  writeGuestCart(
    lines.map((line) =>
      line.product_id === productId ? { ...line, quantity: Math.floor(quantity) } : line
    )
  );
}

/** 明細を 1 つ取り除く。 */
export function removeFromGuestCart(productId: number): void {
  const lines = readGuestCart();
  const next = lines.filter((line) => line.product_id !== productId);
  if (next.length === lines.length) return;
  writeGuestCart(next);
}

/**
 * サーバーが解決した結果で控えを整える（取り扱いが終わった商品を落とし、在庫で丸めた
 * 数量に合わせる）。ゲストのカートは端末に残り続けるため、次に開いたときに実態と
 * 合っている必要がある。
 */
export function reconcileGuestCart(lines: GuestCartLine[]): void {
  const current = readGuestCart();
  const next = lines.filter(isValidLine);
  const unchanged =
    current.length === next.length &&
    current.every(
      (line, index) =>
        line.product_id === next[index].product_id && line.quantity === next[index].quantity
    );
  // 変わっていないなら書かない（書くたびに変更イベントが飛び、再取得が連鎖する）。
  if (unchanged) return;
  writeGuestCart(next);
}

/** 控えを空にする（ログイン後のマージが済んだとき）。 */
export function clearGuestCart(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 消せなくても、マージ済みのカートはサーバー側が持っている。
  }
  try {
    window.dispatchEvent(new Event(GUEST_CART_CHANGE_EVENT));
  } catch {
    // 同上。
  }
}

/** 同じタブ内のカート変更を購読する。返り値を呼ぶと解除する。 */
export function subscribeGuestCart(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(GUEST_CART_CHANGE_EVENT, listener);
  // 別タブでの変更も反映する（storage イベントは他タブからのみ飛ぶ）。
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(GUEST_CART_CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
