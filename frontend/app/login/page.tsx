'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';
import { useToast } from '@/lib/toast-context';
import { btn } from '@/lib/buttonStyles';
import { KettleMotif, CupMotif, PlantMotif, LanternMotif } from '@/components/BrandMotifs';

/** 入力欄の共通クラス（罫は line-input、高さ 44px）。 */
const inputClass =
  'h-11 w-full rounded-md border border-line-input bg-surface px-3.5 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:border-brand-600';

/** 入力ラベルの共通クラス。 */
const labelClass = 'mb-1.5 block text-caption font-medium text-ink-soft';

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
  onChange: (value: string) => void;
}

/** 表示/非表示トグル付きのパスワード入力。 */
function PasswordField({ id, value, onChange }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete="current-password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} pr-11`}
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

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const redirectTo = searchParams.get('redirect') || '/';

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
      await login(email, password);
      // login は内部で認証情報を更新するが name を返さないため、歓迎トースト用に取得する。
      let name = '';
      try {
        const me = await api.get<User>('/auth/me');
        name = me.name;
      } catch {
        // 取得に失敗しても歓迎トースト自体は出す（名前は省く）。
      }
      showToast(name ? `おかえりなさい、${name}さん` : 'おかえりなさい', { type: 'success' });
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
            {/* 背面の透かし。⚠ パネルの下端（-bottom-*）に置かないこと。
                下端には「棚」（1px の罫＋3点の線画）があり、768px ではカラム実幅が
                約 293px しかないため h-64 の透かしが棚まで届き、大きい鉢の縁が
                小さい鉢の胴を真横に貫通して描画バグに見える（実測: 透かし y468-724 と
                棚の線画 y596-652 が完全に重なっていた）。
                本文ブロックに紐づけて置けば、棚とは構造的に交差しない。
                右へ大きく裁ち落として「続きが想像される」断片にする。
                （後続の <p> は relative。絶対配置のこの透かしより後に描画され、文字が上に乗る） */}
            {/* 図案は棚（BrandShelf）に無いものを選ぶ。同じ植物を透かしと棚の両方に置くと、
                同じ図柄が2つの縮尺で1つのパネルに並び、装飾ではなく描画の重複に見える。
                灯り＝「おかえりなさい」を迎える面の意味にも合う。 */}
            {/* 明朝の見出し（2行）はこのカラム幅をほぼ埋めるので、透かしを
                「横に逃がす」余地が 768px には無い。右へさらに裁ち落としたうえで
                濃度を 0.14 → 0.07 に落とし、線が字面を横切って読めるのをやめる。
                見出し・リード文は relative（この絶対配置より後）で必ず上に乗る。 */}
            <LanternMotif
              className="pointer-events-none select-none absolute -right-28 -top-14 h-56 text-brand-400 opacity-[0.07] lg:-right-32 lg:-top-16 lg:h-72"
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
              毎日をていねいにする、選びぬいた道具たち。
            </p>
          </div>
          <BrandShelf className="relative border-t border-brand-400/30 pt-6" />
        </div>

        {/* 右: フォーム */}
        <div className="p-8 sm:p-10 md:col-span-7">
          <p className="text-eyebrow uppercase font-num text-ink-muted">SIGN IN</p>
          <h1 className="mt-3 font-mincho text-h1 text-ink jp-head">ログイン</h1>
          <p className="mt-2 text-body text-ink-muted">Hibino へようこそ。おかえりなさい。</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className={labelClass}>
                メールアドレス
                <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
                <span className="sr-only">（必須）</span>
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
                <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
                <span className="sr-only">（必須）</span>
              </label>
              <PasswordField id="password" value={password} onChange={setPassword} />
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
              href="/register"
              className="rounded font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              会員登録
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="wrap band-lg text-body text-ink-muted">
          <div className="mx-auto max-w-sm">読み込み中...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
