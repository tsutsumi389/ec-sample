'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
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
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="max-w-sm mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">ログイン</h1>
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス
              <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
              <span className="sr-only">（必須）</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              パスワード
              <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
              <span className="sr-only">（必須）</span>
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>

          {error && (
            <p role="alert" className="text-red-600 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-600 text-white py-2.5 rounded-md font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          アカウントをお持ちでない方は{' '}
          <Link href="/register" className="text-brand-600 hover:underline">
            会員登録
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto px-4 py-16 text-gray-600">
          <div className="max-w-sm mx-auto">読み込み中...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
