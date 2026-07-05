'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Coupon, CouponDiscountType } from '@/lib/types';
import ScrollableTable from '@/components/ScrollableTable';
import Spinner from '@/components/Spinner';
import Badge from '@/components/Badge';
import Price from '@/components/Price';
import { PlusIcon } from '@/components/Icons';
import { btnPrimary, btnSecondary } from '@/lib/buttonStyles';

interface CouponFormValues {
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_order_amount: number;
  is_active: boolean;
  expires_at: string; // datetime-local input value、空文字は無期限
}

const emptyForm: CouponFormValues = {
  code: '',
  discount_type: 'percent',
  discount_value: 0,
  min_order_amount: 0,
  is_active: true,
  expires_at: '',
};

// "2026-07-06T12:34:00+00:00" のようなISO文字列を datetime-local 用の "2026-07-06T12:34" に変換
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CouponFormModal({
  coupon,
  onClose,
  onSubmit,
}: {
  coupon: Coupon | null;
  onClose: () => void;
  onSubmit: (values: CouponFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<CouponFormValues>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeInputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (coupon) {
      setValues({
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        min_order_amount: coupon.min_order_amount,
        is_active: coupon.is_active,
        expires_at: toDatetimeLocalValue(coupon.expires_at),
      });
    } else {
      setValues(emptyForm);
    }
  }, [coupon]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coupon-form-title"
      ref={dialogRef}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 id="coupon-form-title" className="text-lg font-bold mb-4">
          {coupon ? 'クーポンを編集' : 'クーポンを新規作成'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
              クーポンコード
              <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
              <span className="sr-only">（必須）</span>
            </label>
            <input
              id="code"
              type="text"
              required
              ref={codeInputRef}
              value={values.code}
              onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toUpperCase() }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="discount_type" className="block text-sm font-medium text-gray-700 mb-2">
                割引種別
                <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
                <span className="sr-only">（必須）</span>
              </label>
              <select
                id="discount_type"
                required
                value={values.discount_type}
                onChange={(e) =>
                  setValues((v) => ({ ...v, discount_type: e.target.value as CouponDiscountType }))
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
              >
                <option value="percent">定率（%）</option>
                <option value="fixed">定額（円）</option>
              </select>
            </div>
            <div>
              <label htmlFor="discount_value" className="block text-sm font-medium text-gray-700 mb-2">
                割引値
                <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
                <span className="sr-only">（必須）</span>
              </label>
              <input
                id="discount_value"
                type="number"
                required
                min={0}
                value={values.discount_value}
                onChange={(e) => setValues((v) => ({ ...v, discount_value: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="min_order_amount" className="block text-sm font-medium text-gray-700 mb-2">
              最低注文金額（円）
              <span className="ml-1 text-xs font-normal text-gray-600">（任意、既定0）</span>
            </label>
            <input
              id="min_order_amount"
              type="number"
              min={0}
              value={values.min_order_amount}
              onChange={(e) => setValues((v) => ({ ...v, min_order_amount: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="expires_at" className="block text-sm font-medium text-gray-700 mb-2">
              有効期限
              <span className="ml-1 text-xs font-normal text-gray-600">（任意、未設定は無期限）</span>
            </label>
            <input
              id="expires_at"
              type="datetime-local"
              value={values.expires_at}
              onChange={(e) => setValues((v) => ({ ...v, expires_at: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is_active"
              type="checkbox"
              checked={values.is_active}
              onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">
              有効にする
            </label>
          </div>

          {error && (
            <p role="alert" className="text-red-600 text-sm">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>
              キャンセル
            </button>
            <button type="submit" disabled={submitting} className={btnPrimary}>
              {submitting ? '保存中...' : '保存する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadCoupons = () => {
    setLoading(true);
    api
      .get<Coupon[]>('/admin/coupons')
      .then(setCoupons)
      .catch(() => setError('クーポン一覧の取得に失敗しました'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  const openCreate = () => {
    setEditingCoupon(null);
    setModalOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setModalOpen(true);
  };

  const handleSubmit = async (values: CouponFormValues) => {
    const payload = {
      code: values.code,
      discount_type: values.discount_type,
      discount_value: values.discount_value,
      min_order_amount: values.min_order_amount,
      is_active: values.is_active,
      expires_at: values.expires_at ? new Date(values.expires_at).toISOString() : null,
    };
    if (editingCoupon) {
      await api.put(`/admin/coupons/${editingCoupon.id}`, payload);
    } else {
      await api.post('/admin/coupons', payload);
    }
    setModalOpen(false);
    loadCoupons();
  };

  const handleDelete = async (coupon: Coupon) => {
    if (!window.confirm(`クーポン「${coupon.code}」を削除しますか？`)) return;
    setError('');
    setDeletingId(coupon.id);
    try {
      await api.delete(`/admin/coupons/${coupon.id}`);
      loadCoupons();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">クーポン管理</h1>
        <button type="button" onClick={openCreate} className={`${btnPrimary} inline-flex items-center gap-2`}>
          <PlusIcon className="w-4 h-4" />
          新規作成
        </button>
      </div>

      {loading && (
        <p className="text-gray-600 flex items-center">
          <Spinner className="mr-2" />
          読み込み中...
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600 mb-4">
          {error}
        </p>
      )}

      {!loading && coupons.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-600 mb-4">登録されたクーポンがありません。「新規作成」から追加してください。</p>
          <button type="button" onClick={openCreate} className={`${btnSecondary} inline-flex items-center gap-2`}>
            <PlusIcon className="w-4 h-4" />
            新規作成
          </button>
        </div>
      )}

      {!loading && coupons.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <ScrollableTable>
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">コード</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">割引</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">最低注文金額</th>
                  <th className="px-4 py-3 whitespace-nowrap">有効期限</th>
                  <th className="px-4 py-3 whitespace-nowrap">状態</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{coupon.code}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {coupon.discount_type === 'percent' ? (
                        `${coupon.discount_value}%`
                      ) : (
                        <Price value={coupon.discount_value} size="sm" />
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <Price value={coupon.min_order_amount} size="sm" />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {coupon.expires_at ? new Date(coupon.expires_at).toLocaleString('ja-JP') : '無期限'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={coupon.is_active ? 'success' : 'neutral'}>
                        {coupon.is_active ? '有効' : '無効'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(coupon)}
                        aria-label={`${coupon.code}を編集`}
                        className="text-brand-600 hover:underline px-2 py-2 -m-2 inline-block"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(coupon)}
                        disabled={deletingId === coupon.id}
                        aria-label={`${coupon.code}を削除`}
                        className="text-red-600 hover:underline px-2 py-2 -m-2 inline-block disabled:opacity-50"
                      >
                        {deletingId === coupon.id ? '削除中...' : '削除'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      )}

      {modalOpen && (
        <CouponFormModal coupon={editingCoupon} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} />
      )}
    </div>
  );
}
