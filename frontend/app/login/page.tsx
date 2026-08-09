'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { FOCUS_RING, btn } from '@/lib/buttonStyles';
import { safeRedirect, withRedirect } from '@/lib/redirect';
import { LanternMotif } from '@/components/BrandMotifs';
import { inputClass, labelClass } from '@/lib/formStyles';
import AuthPanel, { AuthPanelFallback, PasswordField } from '@/components/auth/AuthPanel';
import RequiredMark from '@/components/RequiredMark';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const redirectTo = safeRedirect(searchParams.get('redirect'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 再設定は未実装だが、導線が無いと「進めない人」が行き止まりになる。
  // 遷移先の無いリンクにせず、その場で手順を開く開示にする。
  const [resetOpen, setResetOpen] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      // 未ログイン中に端末へ溜めたカートは login がサーバーへ合算し、その結果を返す。
      // 確定したユーザーも一緒に返るので、歓迎トーストの氏名のために /auth/me を
      // もう一度叩かない（取得に失敗した場合だけ名前を省く）。
      const { merged, user: me } = await login(email, password);
      showToast(me?.name ? `おかえりなさい、${me.name}さん` : 'おかえりなさい', { type: 'success' });
      // 入れていた品が在庫切れ等で引き継げなかったときは黙って消さずに知らせる。
      if (merged && merged.skipped.length > 0) {
        showToast(
          `カートの${merged.skipped.length}点は在庫が変わったため引き継げませんでした`,
          { type: 'info' }
        );
      }
      router.push(redirectTo);
    } catch (err) {
      setError(
        err instanceof ApiError ? 'メールアドレスまたはパスワードが正しくありません' : 'ログインに失敗しました'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPanel
      lead="毎日をていねいにする、選びぬいた道具たち。"
      watermark={
        /* 図案は棚（BrandShelf）に無いものを選ぶ。灯り＝「おかえりなさい」を迎える面の意味にも合う。
           明朝の見出し（2行）はこのカラム幅をほぼ埋めるので、768px には透かしを「横に逃がす」
           余地が無い。右へ大きく裁ち落としたうえで濃度を 0.07 に落とし、線が字面を横切って
           読めるのをやめる。 */
        <LanternMotif
          className="pointer-events-none select-none absolute -right-28 -top-14 h-56 text-brand-400 opacity-[0.07] lg:-right-32 lg:-top-16 lg:h-72"
          strokeWidth={2}
          aria-hidden
        />
      }
    >
          <p className="text-eyebrow uppercase font-num text-ink-muted">SIGN IN</p>
          <h1 className="mt-3 font-mincho text-h1 text-ink jp-head">ログイン</h1>
          <p className="mt-2 text-body text-ink-muted">Hibino へようこそ。おかえりなさい。</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className={labelClass}>
                メールアドレス
                <RequiredMark />
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                パスワード
                <RequiredMark />
              </label>
              <PasswordField
                id="password"
                value={password}
                autoComplete="current-password"
                onChange={setPassword}
              />
            </div>

            {error && (
              <p role="alert" className="text-body text-critical-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`${btn('primary', 'lg')} w-full`}
            >
              {submitting ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setResetOpen((v) => !v)}
              aria-expanded={resetOpen}
              aria-controls="password-reset-note"
              className={btn('ghost', 'sm')}
            >
              パスワードをお忘れですか
            </button>
            {resetOpen && (
              <p
                id="password-reset-note"
                className="mt-3 rounded-lg bg-sunken px-4 py-3.5 text-left text-caption text-ink-soft jp-body"
              >
                ご登録のメールアドレス宛に再設定のご案内をお送りします。
                お急ぎの場合は、画面右下のアシスタントからお問い合わせください。
              </p>
            )}
          </div>

          <p className="mt-8 border-t border-line pt-6 text-center text-body text-ink-muted">
            アカウントをお持ちでない方は{' '}
            <Link
              /* 戻り先を登録側にも引き継ぐ。ここで落とすと「カートから来て登録したのに
                 トップに着く」経路ができ、買う気になっていた人をそのまま失う。 */
              href={withRedirect('/register', redirectTo)}
              className={`rounded font-medium text-brand-700 hover:underline ${FOCUS_RING}`}
            >
              会員登録
            </Link>
          </p>
    </AuthPanel>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPanelFallback />}>
      <LoginForm />
    </Suspense>
  );
}
