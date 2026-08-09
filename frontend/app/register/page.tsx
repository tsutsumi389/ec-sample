'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError, EMAIL_ALREADY_REGISTERED_MESSAGE } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { FOCUS_RING, btn } from '@/lib/buttonStyles';
import { safeRedirect, withRedirect } from '@/lib/redirect';
import { UmbrellaMotif } from '@/components/BrandMotifs';
import { inputClass, labelClass } from '@/lib/formStyles';
import AuthPanel, { AuthPanelFallback, PasswordField } from '@/components/auth/AuthPanel';
import RequiredMark from '@/components/RequiredMark';

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  // どこから来たか（例: カートの「はじめての方は会員登録」）。登録後はそこへ戻す。
  const redirectTo = safeRedirect(searchParams.get('redirect'));

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!name.trim()) {
      errors.name = 'お名前を入力してください';
    }
    if (!email.trim()) {
      errors.email = 'メールアドレスを入力してください';
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.email = 'メールアドレスの形式が正しくありません';
    }
    if (!password) {
      errors.password = 'パスワードを入力してください';
    } else if (password.length < 6) {
      errors.password = 'パスワードは6文字以上で入力してください';
    }
    return errors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      // 未ログイン中に端末へ溜めたカートは register（内部で login）が合算し、結果を返す。
      const { merged } = await register(email, password, name);
      showToast('ようこそ、Hibinoへ', { type: 'success' });
      if (merged && merged.skipped.length > 0) {
        showToast(
          `カートの${merged.skipped.length}点は在庫が変わったため引き継げませんでした`,
          { type: 'info' }
        );
      }
      router.push(redirectTo);
    } catch (err) {
      if (err instanceof ApiError && err.message === EMAIL_ALREADY_REGISTERED_MESSAGE) {
        // 重複メール等、フィールドに紐づくAPIエラーは既存のフィールドエラー表示の仕組みに載せる
        setFieldErrors((prev) => ({ ...prev, email: err.message }));
      } else {
        setError(err instanceof ApiError ? err.message : '登録に失敗しました');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPanel
      lead="会員登録で、お気に入りや注文履歴をいつでも。"
      watermark={
        /* 図案は棚（BrandShelf）に無いものを選ぶ。ログイン（灯り）と別の図案にして、
           2画面が同じ扉に見えないようにもする。 */
        <UmbrellaMotif
          className="pointer-events-none select-none absolute -right-14 -top-8 h-44 text-brand-400 opacity-[0.14] lg:-right-16 lg:-top-10 lg:h-56"
          strokeWidth={2}
          aria-hidden
        />
      }
    >
          <p className="text-eyebrow uppercase font-num text-ink-muted">CREATE ACCOUNT</p>
          <h1 className="mt-3 font-mincho text-h1 text-ink jp-head">会員登録</h1>
          <p className="mt-2 text-body text-ink-muted">
            はじめまして。Hibino のアカウントをつくりましょう。
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
            <div>
              <label htmlFor="name" className={labelClass}>
                お名前
                <RequiredMark />
              </label>
              <input
                id="name"
                type="text"
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.name)}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
                className={`${inputClass} ${fieldErrors.name ? 'border-critical-400' : ''}`}
              />
              {fieldErrors.name && (
                <p role="alert" className="mt-1.5 text-caption text-critical-600">
                  {fieldErrors.name}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                メールアドレス
                <RequiredMark />
              </label>
              <input
                id="email"
                type="email"
                autoFocus
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.email)}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
                className={`${inputClass} ${fieldErrors.email ? 'border-critical-400' : ''}`}
              />
              {fieldErrors.email && (
                <p role="alert" className="mt-1.5 text-caption text-critical-600">
                  {fieldErrors.email}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                パスワード
                <RequiredMark />
              </label>
              <PasswordField
                id="password"
                value={password}
                autoComplete="new-password"
                invalid={Boolean(fieldErrors.password)}
                onChange={(value) => {
                  setPassword(value);
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
              />
              <p className="mt-1.5 text-caption text-ink-muted">
                <span className="tnum">6</span>文字以上で入力してください
              </p>
              {fieldErrors.password && (
                <p role="alert" className="mt-1.5 text-caption text-critical-600">
                  {fieldErrors.password}
                </p>
              )}
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
              {submitting ? '登録中...' : '登録する'}
            </button>
          </form>

          <p className="mt-8 border-t border-line pt-6 text-center text-body text-ink-muted">
            すでにアカウントをお持ちの方は{' '}
            <Link
              /* 戻り先はログイン側にも引き継ぐ（登録 ↔ ログインの行き来で落とさない）。 */
              href={withRedirect('/login', redirectTo)}
              className={`rounded font-medium text-brand-700 hover:underline ${FOCUS_RING}`}
            >
              ログイン
            </Link>
          </p>
    </AuthPanel>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPanelFallback />}>
      <RegisterForm />
    </Suspense>
  );
}
