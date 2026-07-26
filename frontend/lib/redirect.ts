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
