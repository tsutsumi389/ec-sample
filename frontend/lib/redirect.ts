/**
 * ログイン・会員登録のあとに戻る先（?redirect=）の扱い。
 * 「カートに入れた → ログインを求められた → 登録した → トップページに着いた」という経路は、
 * 買う気になっていた人をそのまま失う。戻り先はログイン・登録の両方で引き継ぐ必要があり、
 * その受け渡しをここに集約する。
 */

/** 判定用のダミーオリジン。`.invalid` は RFC 2606 で予約されており実在しない。 */
const INTERNAL_BASE = 'https://redirect.invalid';

/**
 * 戻り先を安全に解く。受け取るのは自サイト内の絶対パスだけ。
 *
 * 先頭が `/` でない値（`https://example.com`）は外部サイトへの誘導になるため捨て、そのうえで
 * **遷移側と同じ URL パーサに通して**オリジンが変わらないことを確かめる（オープンリダイレクト
 * 対策）。文字列の前方一致で `//example.com` だけを弾くのでは足りない——URL パーサは special
 * scheme のオーソリティ位置でバックスラッシュをスラッシュと同じに扱い、かつ解析前にタブ・CR・
 * LF を取り除くので、`/\example.com` や `/%09/example.com` が同じ外部オリジンに化ける。
 * `router.push()` は `new URL(href, location.href)` の結果が別オリジンなら `location.assign()`
 * でそのまま外へ飛ばすため、ここが唯一の関所になる。
 *
 * 戻り値はパーサが正規化した後のパス（`/a/../b` は `/b` になる）。呼び出し側が渡した文字列が
 * そのまま返ることを期待しないこと。
 */
export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  let url: URL;
  try {
    url = new URL(raw, INTERNAL_BASE);
  } catch {
    return '/';
  }
  if (url.origin !== INTERNAL_BASE) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}

/** 戻り先を引き継いだリンク先を作る。トップへ戻るだけなら余計なクエリを付けない。 */
export function withRedirect(path: string, redirectTo: string): string {
  const safe = safeRedirect(redirectTo);
  if (safe === '/') return path;
  return `${path}?redirect=${encodeURIComponent(safe)}`;
}

/**
 * その現在地を戻り先にしてよいか判定して整える。/login・/register 自身に居るときは付けない
 * ——自分自身へ戻すループになり、かつログイン画面から会員登録へ渡り歩くたびにクエリが自分の
 * パスで上書きされて、本来の戻り先（カート等）を失う。この判定を呼び出し側ごとに書かない1本。
 */
export function backTarget(path: string | null | undefined): string {
  if (!path) return '/';
  if (path.startsWith('/login') || path.startsWith('/register')) return '/';
  return path;
}

/**
 * いま見ている画面のパス（クエリ込み）。
 *
 * ⚠ 描画中に呼ばないこと。サーバー側では window が無く、クライアントとの食い違いで hydration
 *   が壊れる。**イベントハンドラの中だけ**で使う。描画時に戻り先つきの href を組みたいときは
 *   usePathname() を `backTarget()` に通すこと（そちらはクエリを持たない）。
 */
export function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

/** クリック時に現在地（クエリ込み）を引き継いでログインへ送る URL。 */
export function loginHref(): string {
  return withRedirect('/login', backTarget(currentPath()));
}
