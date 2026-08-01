'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError, EMAIL_ALREADY_REGISTERED_MESSAGE } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { btn } from '@/lib/buttonStyles';
import { safeRedirect, withRedirect } from '@/lib/redirect';
import { KettleMotif, CupMotif, PlantMotif, UmbrellaMotif } from '@/components/BrandMotifs';
import { inputClass, labelClass } from '@/lib/formStyles';

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ブランド面。デスクトップは左カラム、モバイルはフォーム上の横帯として出す。
 * どちらの判型でも深緑（bg-invert）＋線画が出るようにして、片側だけ世界観が消えるのを防ぐ。
 *
 * 3点の高さは同じ（h-12）。BrandMotifs の viewBox を 120×120 の正方形・接地線 y=108 に
 * 統一したので、同じ数字を渡せば光学サイズも接地も揃う。個別に h-14 / h-10 / h-12 と
 * 手当てしていた頃は、同じ3点セットがページごとに別の大小関係になっていた
 * （署名帯・フッター・ログイン・カテゴリ札で4通り）。棚の造形は1つに閉じる。
 */
function BrandShelf({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-end gap-6 text-brand-300 ${className}`} aria-hidden="true">
      <KettleMotif className="pointer-events-none select-none h-12 opacity-80" />
      <CupMotif className="pointer-events-none select-none h-12 opacity-80" />
      <PlantMotif className="pointer-events-none select-none h-12 opacity-80" />
    </div>
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
        className={`${inputClass} pr-11 ${invalid ? 'border-critical-400' : ''}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'パスワードを隠す' : 'パスワードを表示'}
        aria-pressed={visible}
        /* w-11 = 44px。pr-3 だけだと当たり判定が 32px しかなく、
           アイコンの光学位置（右から 22px）は w-11 + 中央寄せでも変わらない。 */
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-ink-faint transition-colors duration-fast hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
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
      const merged = await register(email, password, name);
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
    /* 版面幅は他ページと同じ3系統に戻す（旧 max-w-5xl は第4の幅だった）。 */
    <div className="wrap band-lg">
      <div className="grid overflow-hidden rounded-2xl bg-surface shadow-float md:grid-cols-12">
        {/* モバイル用のブランド横帯（md 未満）。デスクトップだけ世界観が出る状態を避ける。 */}
        <div className="on-dark bg-invert px-6 py-8 md:hidden">
          <p className="text-eyebrow uppercase font-num text-on-dark-muted">
            HIBINO — 日々の暮らしの道具店
          </p>
          <p className="mt-3 font-mincho text-h3 text-on-dark jp-head jp-name">日々に寄り添う道具を。</p>
          <BrandShelf className="mt-5 border-t border-brand-400/30 pt-4" />
        </div>

        {/* 左: ブランド面（デスクトップ。5:7 の非対称）
            768px ではカラムが狭くなるので、見出しの丈と余白を1段落として縦の膨らみを抑える。 */}
        <div className="on-dark relative hidden flex-col justify-between overflow-hidden bg-invert p-8 md:col-span-5 md:flex lg:p-10">
          <p className="relative text-eyebrow uppercase font-num text-on-dark-muted">
            HIBINO — 日々の暮らしの道具店
          </p>
          <div className="relative py-8 lg:py-10">
            {/* 背面の透かし。ログインと同じ理由でパネル下端には置かない
                （下端の棚＝罫＋3点の線画と交差して、線がもつれた1つの塊に見える）。
                本文ブロックに紐づけ、右へ裁ち落とす。 */}
            {/* 図案は棚（BrandShelf）に無いものを選ぶ。同じケトルを透かしと棚の両方に置くと、
                同じ図柄が2つの縮尺で1つのパネルに並び、装飾ではなく描画の重複に見える。
                ログイン（灯り）と別の図案にして、2画面が同じ扉に見えないようにもする。 */}
            <UmbrellaMotif
              className="pointer-events-none select-none absolute -right-14 -top-8 h-44 text-brand-400 opacity-[0.14] lg:-right-16 lg:-top-10 lg:h-56"
              strokeWidth={2}
              aria-hidden
            />
            {/* 5列カラムの実幅（1440px で約373px）に収まる字数で改行位置を固定する。
                明朝を大きくするのは、1行11文字が確実に収まる xl 以上だけにする。 */}
            <p className="relative font-mincho text-h3 text-on-dark jp-head jp-name xl:text-h2">
              日々に寄り添う道具を、
              <br />
              あなたのもとへ。
            </p>
            <p className="relative mt-4 text-body text-on-dark-muted jp-body">
              会員登録で、お気に入りや注文履歴をいつでも。
            </p>
          </div>
          <BrandShelf className="relative border-t border-brand-400/30 pt-6" />
        </div>

        {/* 右: フォーム */}
        <div className="p-8 sm:p-10 md:col-span-7">
          <p className="text-eyebrow uppercase font-num text-ink-muted">CREATE ACCOUNT</p>
          <h1 className="mt-3 font-mincho text-h1 text-ink jp-head">会員登録</h1>
          <p className="mt-2 text-body text-ink-muted">
            はじめまして。Hibino のアカウントをつくりましょう。
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
            <div>
              <label htmlFor="name" className={labelClass}>
                お名前
                <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
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
                <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
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
                <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
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
              className="rounded font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              ログイン
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="wrap band-lg text-body text-ink-muted">
          <div className="mx-auto max-w-sm">読み込み中...</div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
