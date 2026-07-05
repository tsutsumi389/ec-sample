'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Address } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import Spinner from '@/components/Spinner';
import Badge from '@/components/Badge';
import AddressForm, { AddressFormValues } from '@/components/AddressForm';
import { btnPrimary, btnGhost } from '@/lib/buttonStyles';

export default function AddressesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/account/addresses');
    }
  }, [authLoading, user, router]);

  const loadAddresses = () => {
    setLoading(true);
    api
      .get<Address[]>('/addresses')
      .then(setAddresses)
      .catch((e) => setError(e instanceof ApiError ? e.message : '住所帳の取得に失敗しました'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user) return;
    loadAddresses();
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
    if (editingAddress) {
      await api.put(`/addresses/${editingAddress.id}`, values);
    } else {
      await api.post('/addresses', values);
    }
    setFormOpen(false);
    setEditingAddress(null);
    loadAddresses();
  };

  const handleDelete = async (address: Address) => {
    if (!window.confirm(`「${address.recipient_name}」宛の住所を削除しますか？`)) return;
    setError('');
    setDeletingId(address.id);
    try {
      await api.delete(`/addresses/${address.id}`);
      loadAddresses();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (address: Address) => {
    if (address.is_default) return;
    setError('');
    setSettingDefaultId(address.id);
    try {
      await api.put(`/addresses/${address.id}`, { is_default: true });
      loadAddresses();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '既定の設定に失敗しました');
    } finally {
      setSettingDefaultId(null);
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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">住所帳</h1>
        {!formOpen && (
          <button type="button" onClick={openCreate} className={btnPrimary}>
            新しい住所を追加
          </button>
        )}
      </div>
      <p className="text-sm mb-6">
        <Link href="/account" className="text-brand-600 hover:underline">
          ← アカウント設定に戻る
        </Link>
      </p>

      {error && (
        <p role="alert" className="text-red-600 text-sm mb-4">
          {error}
        </p>
      )}

      {formOpen && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">{editingAddress ? '住所を編集' : '住所を追加'}</h2>
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

      {loading && (
        <p className="text-gray-600 flex items-center">
          <Spinner className="mr-2" />
          読み込み中...
        </p>
      )}

      {!loading && addresses.length === 0 && (
        <p className="text-gray-600">登録された住所がありません。</p>
      )}

      <div className="space-y-3">
        {addresses.map((address) => (
          <div key={address.id} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium">{address.recipient_name} 様</p>
                  {address.is_default && <Badge variant="info">既定</Badge>}
                </div>
                <p className="text-sm text-gray-600">〒{address.postal_code}</p>
                <p className="text-sm text-gray-600">
                  {address.prefecture}
                  {address.city}
                  {address.address_line}
                </p>
                <p className="text-sm text-gray-600">TEL: {address.phone}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!address.is_default && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(address)}
                    disabled={settingDefaultId === address.id}
                    className={`${btnGhost} text-sm`}
                  >
                    {settingDefaultId === address.id ? '設定中...' : '既定にする'}
                  </button>
                )}
                <button type="button" onClick={() => openEdit(address)} className={`${btnGhost} text-sm`}>
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(address)}
                  disabled={deletingId === address.id}
                  className={`${btnGhost} text-sm text-red-600 hover:bg-red-50`}
                >
                  {deletingId === address.id ? '削除中...' : '削除'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
