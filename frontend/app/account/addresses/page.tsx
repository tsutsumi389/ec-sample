'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Address } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import Badge from '@/components/Badge';
import PageMasthead from '@/components/PageMasthead';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import AddressForm, { AddressFormValues } from '@/components/AddressForm';
import SectionHead from '@/components/SectionHead';
import { ArrowLeftIcon } from '@/components/Icons';
import { btn } from '@/lib/buttonStyles';

/** 住所カード型のスケルトン。 */
function AddressCardSkeleton() {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-paper">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-2 h-4 w-24" />
      <Skeleton className="mt-1.5 h-4 w-48" />
      <Skeleton className="mt-1.5 h-4 w-28" />
    </div>
  );
}

/** 削除確認用に住所を1行の要約にまとめる。 */
function summarize(address: Address): string {
  return `${address.recipient_name} 様 / 〒${address.postal_code} ${address.prefecture}${address.city}${address.address_line}`;
}

export default function AddressesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/account/addresses');
    }
  }, [authLoading, user, router]);

  // silent=true のときは一覧を表示したまま裏で取り直す（全画面スピナーを出さない）。
  const loadAddresses = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.get<Address[]>('/addresses');
      setAddresses(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '住所帳の取得に失敗しました');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void loadAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const openCreate = () => {
    setEditingAddress(null);
    setFormOpen(true);
  };

  const openEdit = (address: Address) => {
    setEditingAddress(address);
    setFormOpen(true);
  };

  const handleSubmit = async (values: AddressFormValues) => {
    // 失敗時は例外を AddressForm 側に伝播させ、フォーム内にエラー表示させる。
    if (editingAddress) {
      await api.put(`/addresses/${editingAddress.id}`, values);
    } else {
      await api.post('/addresses', values);
    }
    const wasEditing = Boolean(editingAddress);
    setFormOpen(false);
    setEditingAddress(null);
    showToast(wasEditing ? '住所を更新しました' : '住所を追加しました', { type: 'success' });
    await loadAddresses({ silent: true });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setError('');
    setDeleting(true);
    try {
      await api.delete(`/addresses/${deleteTarget.id}`);
      // 部分更新: 削除した住所をローカル state から取り除く。
      setAddresses((current) => current.filter((a) => a.id !== deleteTarget.id));
      showToast('住所を削除しました', { type: 'info' });
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '削除に失敗しました');
      showToast(e instanceof ApiError ? e.message : '削除に失敗しました', { type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (address: Address) => {
    if (address.is_default) return;
    setError('');
    setSettingDefaultId(address.id);
    try {
      await api.put(`/addresses/${address.id}`, { is_default: true });
      // 部分更新: 対象を既定に、他を非既定に切り替える。
      setAddresses((current) =>
        current.map((a) => ({ ...a, is_default: a.id === address.id }))
      );
      showToast(`「${address.recipient_name} 様」を既定のお届け先にしました`, { type: 'success' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '既定の設定に失敗しました');
      showToast(e instanceof ApiError ? e.message : '既定の設定に失敗しました', { type: 'error' });
    } finally {
      setSettingDefaultId(null);
    }
  };

  const guarding = authLoading || !user;

  return (
    <>
      {/* 扉。全ページ共通の PageMasthead に寄せる（幅は本文と同じ wrap ＝ width="default"）。 */}
      <PageMasthead
        eyebrow="ADDRESSES"
        title="住所帳"
        width="default"
        motif="plant"
        breadcrumbs={[
          { label: 'ホーム', href: '/' },
          { label: 'アカウント', href: '/account' },
          { label: '住所帳' },
        ]}
        /* 0件のときは空状態が同じボタンを出すので、扉には出さない（同一CTAの二重掲出を避ける）。 */
        right={
          !formOpen && !guarding && !loading && addresses.length > 0 ? (
            <button type="button" onClick={openCreate} className={btn('primary', 'md')}>
              新しい住所を追加
            </button>
          ) : undefined
        }
      />

      <div className="wrap band-lg">
        {error && (
          <p role="alert" className="mb-4 text-body text-critical-600">
            {error}
          </p>
        )}

        {formOpen && (
          <div className="mb-8">
            <SectionHead title={editingAddress ? '住所を編集' : '住所を追加'} eyebrow="EDIT" className="mb-4" />
            <AddressForm
              initialValues={editingAddress}
              onSubmit={handleSubmit}
              onCancel={() => {
                setFormOpen(false);
                setEditingAddress(null);
              }}
            />
          </div>
        )}

        {(guarding || loading) && (
          <div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
            <AddressCardSkeleton />
            <AddressCardSkeleton />
          </div>
        )}

        {!guarding && !loading && addresses.length === 0 && !formOpen && (
          <EmptyState
            title="最初の住所を追加しましょう"
            description="お届け先を登録しておくと、お会計がぐっとスムーズになります。"
            action={
              <button type="button" onClick={openCreate} className={btn('primary', 'md')}>
                新しい住所を追加
              </button>
            }
          />
        )}

        {!guarding && !loading && addresses.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {addresses.map((address) => (
              <div key={address.id} className="rounded-xl bg-surface p-5 shadow-paper">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-body font-medium text-ink">{address.recipient_name} 様</p>
                      {address.is_default && <Badge variant="brand">既定</Badge>}
                    </div>
                    <p className="text-body tnum text-ink-muted">〒{address.postal_code}</p>
                    <p className="text-body text-ink-muted">
                      {address.prefecture}
                      {address.city}
                      {address.address_line}
                    </p>
                    <p className="text-body tnum text-ink-muted">TEL: {address.phone}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!address.is_default && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(address)}
                        disabled={settingDefaultId === address.id}
                        className={btn('ghost', 'sm')}
                      >
                        {settingDefaultId === address.id ? '設定中...' : '既定にする'}
                      </button>
                    )}
                    <button type="button" onClick={() => openEdit(address)} className={btn('ghost', 'sm')}>
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(address)}
                      className={`${btn('ghost', 'sm')} text-critical-700 hover:bg-critical-50`}
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 rounded text-body text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            アカウントに戻る
          </Link>
        </div>

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="この住所を削除しますか？"
          description={deleteTarget ? summarize(deleteTarget) : undefined}
          confirmLabel="削除する"
          danger
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        />
      </div>
    </>
  );
}
