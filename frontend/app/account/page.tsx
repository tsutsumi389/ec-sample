'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Skeleton } from '@/components/Skeleton';
import PageMasthead from '@/components/PageMasthead';
import SectionHead from '@/components/SectionHead';
import { btn } from '@/lib/buttonStyles';
import { ClipboardListIcon, HeartIcon, PackageIcon, ArrowRightIcon } from '@/components/Icons';

/** 名前の先頭1文字をアバターのイニシャルにする（無ければ「H」）。 */
function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0] : 'H';
}

/** 入力欄・ラベルの共通クラス（ログイン／会員登録と同一の造形に揃える）。 */
const inputClass =
  'h-11 w-full rounded-md border border-line-input bg-surface px-3.5 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:border-brand-600';
const labelClass = 'mb-1.5 block text-caption font-medium text-ink-soft';

/** アカウント内の導線カード（注文履歴・お気に入り・住所帳・ログアウト）の共通クラス。 */
const menuCardClass =
  'group flex h-full items-center gap-3 rounded-xl bg-surface p-4 text-left shadow-paper transition-[background-color,box-shadow] duration-base ease-standard hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600';

const breadcrumbs = [{ label: 'ホーム', href: '/' }, { label: 'アカウント' }];

export default function AccountPage() {
  const { user, loading: authLoading, logout, updateUser } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [nameSubmitting, setNameSubmitting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/account');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) {
      setName(user.name);
    }
  }, [user]);

  const handleNameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setNameError('');
    if (!name.trim()) {
      setNameError('お名前を入力してください');
      return;
    }
    setNameSubmitting(true);
    try {
      const updated = await api.put<User>('/auth/me', { name: name.trim() });
      setName(updated.name);
      updateUser({ name: updated.name });
      showToast('お名前を更新しました', { type: 'success' });
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : '更新に失敗しました');
      showToast(err instanceof ApiError ? err.message : '更新に失敗しました', { type: 'error' });
    } finally {
      setNameSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (!currentPassword) {
      setPasswordError('現在のパスワードを入力してください');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('新しいパスワードは6文字以上で入力してください');
      return;
    }
    setPasswordSubmitting(true);
    try {
      await api.put('/auth/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      showToast('パスワードを変更しました', { type: 'success' });
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : '変更に失敗しました');
      showToast(err instanceof ApiError ? err.message : '変更に失敗しました', { type: 'error' });
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    showToast('ログアウトしました', { type: 'info' });
    router.push('/');
  };

  if (authLoading || !user) {
    return (
      <>
        <PageMasthead
          eyebrow="ACCOUNT"
          title="アカウント"
          width="default"
          motif="plant"
          breadcrumbs={breadcrumbs}
        />
        <div className="wrap band-lg" aria-hidden="true">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* 扉。全ページ共通の PageMasthead に寄せる（幅は本文と同じ wrap ＝ width="default"）。 */}
      <PageMasthead
        eyebrow="ACCOUNT"
        title={`${user.name} さん`}
        subtitle={user.email}
        width="default"
        motif="plant"
        breadcrumbs={breadcrumbs}
        right={
          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-700 font-mincho text-h2 font-bold text-on-dark"
          >
            {initialOf(user.name)}
          </span>
        }
      />

      <div className="wrap band-lg">
        {/* カードメニュー */}
        <div className="mb-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/orders" className={`${menuCardClass} hover:bg-brand-50`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <ClipboardListIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink jp-name">注文履歴</span>
              <span className="block text-caption text-ink-muted jp-name">これまでのご注文を確認</span>
            </span>
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-line-strong transition-colors group-hover:text-brand-600" />
          </Link>

          <Link href="/wishlist" className={`${menuCardClass} hover:bg-brand-50`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <HeartIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink jp-name">お気に入り</span>
              <span className="block text-caption text-ink-muted jp-name">保存した道具を見返す</span>
            </span>
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-line-strong transition-colors group-hover:text-brand-600" />
          </Link>

          <Link href="/account/addresses" className={`${menuCardClass} hover:bg-brand-50`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <PackageIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink jp-name">住所帳</span>
              <span className="block text-caption text-ink-muted jp-name">お届け先を管理</span>
            </span>
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-line-strong transition-colors group-hover:text-brand-600" />
          </Link>

          <button type="button" onClick={handleLogout} className={`${menuCardClass} hover:bg-sunken`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
                <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink jp-name">ログアウト</span>
              <span className="block text-caption text-ink-muted jp-name">またお待ちしています</span>
            </span>
          </button>
        </div>

        <SectionHead title="アカウント設定" eyebrow="SETTINGS" className="mb-6" />

        {/* 版面が広い画面では設定カードを2段組にして、入力欄が1行1000px超に伸びるのを防ぐ */}
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <section className="rounded-xl bg-surface p-6 shadow-paper">
            <h3 className="mb-4 font-mincho text-h3 text-ink">プロフィール</h3>
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className={labelClass}>
                  メールアドレス
                </label>
                <input
                  id="email"
                  type="email"
                  value={user.email}
                  disabled
                  className={`${inputClass} bg-sunken text-ink-muted`}
                />
              </div>
              <div>
                <label htmlFor="name" className={labelClass}>
                  お名前
                  <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
                  <span className="sr-only">（必須）</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                  className={`${inputClass} ${nameError ? 'border-critical-400' : ''}`}
                />
                {nameError && (
                  <p role="alert" className="mt-1.5 text-caption text-critical-600">
                    {nameError}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={nameSubmitting}
                className={`${btn('primary', 'lg')} w-full`}
              >
                {nameSubmitting ? '保存中...' : '氏名を更新'}
              </button>
            </form>
          </section>

          <section className="rounded-xl bg-surface p-6 shadow-paper">
            <h3 className="mb-4 font-mincho text-h3 text-ink">パスワード変更</h3>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="current_password" className={labelClass}>
                  現在のパスワード
                  <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
                  <span className="sr-only">（必須）</span>
                </label>
                <input
                  id="current_password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="new_password" className={labelClass}>
                  新しいパスワード
                  <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
                  <span className="sr-only">（必須）</span>
                </label>
                <input
                  id="new_password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  className={inputClass}
                />
                <p className="mt-1.5 text-caption text-ink-muted">
                  <span className="tnum">6</span>文字以上で入力してください
                </p>
              </div>
              {passwordError && (
                <p role="alert" className="text-body text-critical-600">
                  {passwordError}
                </p>
              )}
              <button
                type="submit"
                disabled={passwordSubmitting}
                className={`${btn('primary', 'lg')} w-full`}
              >
                {passwordSubmitting ? '変更中...' : 'パスワードを変更'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
