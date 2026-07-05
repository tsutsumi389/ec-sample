'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import Spinner from '@/components/Spinner';
import { btnPrimary } from '@/lib/buttonStyles';

export default function AccountPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [nameMessage, setNameMessage] = useState('');
  const [nameSubmitting, setNameSubmitting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
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
    setNameMessage('');
    setNameError('');
    if (!name.trim()) {
      setNameError('お名前を入力してください');
      return;
    }
    setNameSubmitting(true);
    try {
      const updated = await api.put<User>('/auth/me', { name: name.trim() });
      setName(updated.name);
      setNameMessage('氏名を更新しました。');
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : '更新に失敗しました');
    } finally {
      setNameSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordMessage('');
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
      setPasswordMessage('パスワードを変更しました。');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : '変更に失敗しました');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-gray-600 flex items-center">
        <Spinner className="mr-2" />
        読み込み中...
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-6 text-center">アカウント設定</h1>

      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">プロフィール</h2>
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
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
            {nameError && (
              <p role="alert" className="text-xs text-red-600 mt-1">
                {nameError}
              </p>
            )}
          </div>
          {nameMessage && (
            <p role="status" className="text-green-700 text-sm">
              {nameMessage}
            </p>
          )}
          <button type="submit" disabled={nameSubmitting} className={`${btnPrimary} w-full`}>
            {nameSubmitting ? '保存中...' : '氏名を更新'}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">パスワード変更</h2>
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
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
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
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
            <p className="text-xs text-gray-600 mt-1">6文字以上で入力してください</p>
          </div>
          {passwordError && (
            <p role="alert" className="text-red-600 text-sm">
              {passwordError}
            </p>
          )}
          {passwordMessage && (
            <p role="status" className="text-green-700 text-sm">
              {passwordMessage}
            </p>
          )}
          <button type="submit" disabled={passwordSubmitting} className={`${btnPrimary} w-full`}>
            {passwordSubmitting ? '変更中...' : 'パスワードを変更'}
          </button>
        </form>
      </section>

      <p className="text-center text-sm">
        <Link href="/account/addresses" className="text-brand-600 hover:underline">
          住所帳を管理する →
        </Link>
      </p>
    </div>
  );
}
