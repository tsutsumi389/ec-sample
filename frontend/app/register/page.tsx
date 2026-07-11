'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError, EMAIL_ALREADY_REGISTERED_MESSAGE } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { btnPrimary } from '@/lib/buttonStyles';

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 左カラムのブランド面に置く道具モチーフの簡素なイラスト（急須・器・木さじ）。 */
function ToolsIllustration() {
  return (
    <svg
      viewBox="0 0 220 160"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="w-56 max-w-full text-white/80"
    >
      {/* 急須 */}
      <path d="M44 96a30 30 0 0 0 60 0v-2H44v2Z" />
      <path d="M104 100c14 0 18-10 18-18" />
      <path d="M44 96c-9 0-14-5-14-12s5-9 12-9" />
      <path d="M64 82v-6a10 10 0 0 1 20 0v6" />
      <path d="M74 66V58" />
      {/* 器 */}
      <path d="M126 116h56l-6 18a10 10 0 0 1-9 6h-26a10 10 0 0 1-9-6l-6-18Z" />
      <path d="M138 116c0-8 8-12 16-12s16 4 16 12" />
      {/* 木さじ */}
      <path d="M150 40c-10 4-14 16-9 24 4 6 12 7 17 3l19 30" />
      <ellipse cx="150" cy="46" rx="12" ry="8" transform="rotate(-32 150 46)" />
    </svg>
  );
}

interface PasswordFieldProps {
  id: string;
  value: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}

/** 表示/非表示トグル付きのパスワード入力。 */
function PasswordField({ id, value, invalid, onChange }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        aria-required="true"
        aria-invalid={invalid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-md px-3 py-2.5 pr-11 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'パスワードを隠す' : 'パスワードを表示'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded-r-md"
      >
        {visible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
            <path d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
            <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

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
      await register(email, password, name);
      showToast('ようこそ、Hibinoへ', { type: 'success' });
      router.push('/');
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
    <div className="max-w-5xl mx-auto px-4 py-10 sm:py-16">
      <div className="grid md:grid-cols-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* 左: ブランド面 */}
        <div className="relative hidden md:flex flex-col justify-between bg-gradient-to-br from-brand-700 to-brand-500 p-10 text-white">
          <p className="text-sm font-medium tracking-wide text-white/80">Hibino — 日々の暮らしの道具店</p>
          <div className="py-8">
            <ToolsIllustration />
          </div>
          <div>
            <p className="text-2xl font-bold leading-relaxed">
              暮らしに寄り添う道具を、
              <br />
              あなたのもとへ。
            </p>
            <p className="mt-3 text-sm text-white/80">
              会員登録で、お気に入りや注文履歴をいつでも。
            </p>
          </div>
        </div>

        {/* 右: フォームカード */}
        <div className="p-8 sm:p-10">
          <h1 className="text-2xl font-bold mb-1">会員登録</h1>
          <p className="text-sm text-gray-600 mb-6">はじめまして。Hibino のアカウントをつくりましょう。</p>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                お名前
                <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
                <span className="sr-only">（必須）</span>
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
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              />
              {fieldErrors.name && (
                <p role="alert" className="text-xs text-red-600 mt-1">
                  {fieldErrors.name}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス
                <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
                <span className="sr-only">（必須）</span>
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
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              />
              {fieldErrors.email && (
                <p role="alert" className="text-xs text-red-600 mt-1">
                  {fieldErrors.email}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                パスワード
                <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
                <span className="sr-only">（必須）</span>
              </label>
              <PasswordField
                id="password"
                value={password}
                invalid={Boolean(fieldErrors.password)}
                onChange={(value) => {
                  setPassword(value);
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
              />
              <p className="text-xs text-gray-600 mt-1">6文字以上で入力してください</p>
              {fieldErrors.password && (
                <p role="alert" className="text-xs text-red-600 mt-1">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="text-red-600 text-sm">
                {error}
              </p>
            )}

            <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
              {submitting ? '登録中...' : '登録する'}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-600">
            すでにアカウントをお持ちの方は{' '}
            <Link href="/login" className="text-brand-600 font-medium hover:underline">
              ログイン
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
