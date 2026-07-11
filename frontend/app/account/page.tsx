'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Skeleton } from '@/components/Skeleton';
import Breadcrumbs from '@/components/Breadcrumbs';
import { btnPrimary } from '@/lib/buttonStyles';
import { ClipboardListIcon, HeartIcon, PackageIcon, ArrowRightIcon } from '@/components/Icons';

/** 名前の先頭1文字をアバターのイニシャルにする（無ければ「H」）。 */
function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0] : 'H';
}

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
      <div className="max-w-3xl mx-auto px-4 py-8" aria-hidden="true">
        <div className="mt-4 mb-8 flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Breadcrumbs items={[{ label: 'ホーム', href: '/' }, { label: 'アカウント' }]} />

      {/* 歓迎ヘッダ */}
      <div className="mt-4 mb-8 flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-400 text-2xl font-bold text-white"
        >
          {initialOf(user.name)}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{user.name} さん</h1>
          <p className="text-sm text-gray-600 truncate">{user.email}</p>
        </div>
      </div>

      {/* カードメニュー */}
      <div className="grid gap-3 sm:grid-cols-2 mb-10">
        <Link
          href="/orders"
          className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <ClipboardListIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-gray-900">注文履歴</span>
            <span className="block text-xs text-gray-500">これまでのご注文を確認</span>
          </span>
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-brand-500" />
        </Link>

        <Link
          href="/wishlist"
          className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <HeartIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-gray-900">お気に入り</span>
            <span className="block text-xs text-gray-500">保存した道具を見返す</span>
          </span>
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-brand-500" />
        </Link>

        <Link
          href="/account/addresses"
          className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <PackageIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-gray-900">住所帳</span>
            <span className="block text-xs text-gray-500">お届け先を管理</span>
          </span>
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-brand-500" />
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors duration-150 hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
              <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-gray-900">ログアウト</span>
            <span className="block text-xs text-gray-500">またのお越しをお待ちしています</span>
          </span>
        </button>
      </div>

      <h2 className="text-lg font-semibold mb-4">アカウント設定</h2>

      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h3 className="text-base font-semibold mb-4">プロフィール</h3>
        <form onSubmit={handleNameSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              お名前
              <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
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
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            />
            {nameError && (
              <p role="alert" className="text-xs text-red-600 mt-1">
                {nameError}
              </p>
            )}
          </div>
          <button type="submit" disabled={nameSubmitting} className={`${btnPrimary} w-full`}>
            {nameSubmitting ? '保存中...' : '氏名を更新'}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-base font-semibold mb-4">パスワード変更</h3>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label htmlFor="current_password" className="block text-sm font-medium text-gray-700 mb-1">
              現在のパスワード
              <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
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
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            />
          </div>
          <div>
            <label htmlFor="new_password" className="block text-sm font-medium text-gray-700 mb-1">
              新しいパスワード
              <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
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
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            />
            <p className="text-xs text-gray-600 mt-1">6文字以上で入力してください</p>
          </div>
          {passwordError && (
            <p role="alert" className="text-red-600 text-sm">
              {passwordError}
            </p>
          )}
          <button type="submit" disabled={passwordSubmitting} className={`${btnPrimary} w-full`}>
            {passwordSubmitting ? '変更中...' : 'パスワードを変更'}
          </button>
        </form>
      </section>
    </div>
  );
}
