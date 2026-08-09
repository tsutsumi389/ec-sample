/**
 * ログイン・会員登録のあとに戻る先（?redirect=）の扱い。
 *
 * 「カートに入れた → ログインを求められた → 登録した → トップページに着いた」という経路は、
 * 買う気になっていた人をそのまま失う。戻り先はログイン・登録の両方で引き継ぐ必要があり、
 * その受け渡しをここに集約する。
 */

/**
 * 戻り先を安全に解く。受け取るのは自サイト内の絶対パスだけ。
 *
 * 先頭が `/` でない値（`https://example.com`）と、プロトコル相対の `//example.com` は
 * 外部サイトへの誘導になるため捨てる（オープンリダイレクト対策）。
 */
export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/** 戻り先を引き継いだリンク先を作る。トップへ戻るだけなら余計なクエリを付けない。 */
export function withRedirect(path: string, redirectTo: string): string {
  const safe = safeRedirect(redirectTo);
  if (safe === '/') return path;
  return `${path}?redirect=${encodeURIComponent(safe)}`;
}

/**
 * その現在地を戻り先にしてよいか判定して整える。
 *
 * /login・/register 自身に居るときは付けない——自分自身へ戻すループになり、かつ
 * ログイン画面から会員登録へ渡り歩くたびにクエリが自分のパスで上書きされて、
 * 本来の戻り先（カート等）を失う。この判定を呼び出し側ごとに書かないための1本。
 */
export function backTarget(path: string | null | undefined): string {
  if (!path) return '/';
  if (path.startsWith('/login') || path.startsWith('/register')) return '/';
  return path;
}

/**
 * いま見ている画面のパス（クエリ込み）。
 *
 * ⚠ 描画中に呼ばないこと。サーバー側では window が無く、クライアントとの食い違いで
 *   hydration が壊れる。**イベントハンドラの中だけ**で使う。描画時に戻り先つきの
 *   href を組みたいときは usePathname() を `backTarget()` に通すこと
 *   （そちらはクエリを持たない——Header のコメント参照）。
 */
export function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

/** クリック時に現在地（クエリ込み）を引き継いでログインへ送る URL。 */
export function loginHref(): string {
  return withRedirect('/login', backTarget(currentPath()));
}
