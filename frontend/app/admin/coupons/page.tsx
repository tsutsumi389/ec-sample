'use client';

import { FormEvent, useRef, useState } from 'react';
import type { Coupon, CouponDiscountType } from '@/lib/types';
import Badge from '@/components/Badge';
import Price from '@/components/Price';
import ConfirmDialog from '@/components/ConfirmDialog';
import RequiredMark from '@/components/RequiredMark';
import AdminList, {
  AdminListHeader,
  AdminRowActions,
  adminRowClass,
} from '@/components/admin/AdminList';
import AdminModal, { AdminModalActions } from '@/components/admin/AdminModal';
import { adminHintClass, adminInputClass, adminLabelClass } from '@/lib/formStyles';
import { formatDateTime } from '@/lib/formatDate';
import { useAdminResource } from '@/lib/useAdminResource';

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
  // 呼び出し側は編集対象を確定させてからモーダルをマウントするので、初期値は遅延初期化で足りる。
  const [values, setValues] = useState<CouponFormValues>(() =>
    coupon
      ? {
          code: coupon.code,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          min_order_amount: coupon.min_order_amount,
          is_active: coupon.is_active,
          expires_at: toDatetimeLocalValue(coupon.expires_at),
        }
      : emptyForm
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);

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
    <AdminModal
      titleId="coupon-form-title"
      title={coupon ? 'クーポンを編集' : 'クーポンを新規作成'}
      onClose={onClose}
      initialFocus={codeInputRef}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="code" className={adminLabelClass}>
            クーポンコード
            <RequiredMark />
          </label>
          <input
            id="code"
            type="text"
            required
            ref={codeInputRef}
            value={values.code}
            onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toUpperCase() }))}
            className={adminInputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="discount_type" className={adminLabelClass}>
              割引種別
              <RequiredMark />
            </label>
            <select
              id="discount_type"
              required
              value={values.discount_type}
              onChange={(e) =>
                setValues((v) => ({ ...v, discount_type: e.target.value as CouponDiscountType }))
              }
              className={adminInputClass}
            >
              <option value="percent">定率（%）</option>
              <option value="fixed">定額（円）</option>
            </select>
          </div>
          <div>
            <label htmlFor="discount_value" className={adminLabelClass}>
              割引値
              <RequiredMark />
            </label>
            <input
              id="discount_value"
              type="number"
              required
              min={0}
              value={values.discount_value}
              onChange={(e) => setValues((v) => ({ ...v, discount_value: Number(e.target.value) }))}
              className={adminInputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="min_order_amount" className={adminLabelClass}>
            最低注文金額（円）
            <span className={adminHintClass}>（任意、既定0）</span>
          </label>
          <input
            id="min_order_amount"
            type="number"
            min={0}
            value={values.min_order_amount}
            onChange={(e) => setValues((v) => ({ ...v, min_order_amount: Number(e.target.value) }))}
            className={adminInputClass}
          />
        </div>

        <div>
          <label htmlFor="expires_at" className={adminLabelClass}>
            有効期限
            <span className={adminHintClass}>（任意、未設定は無期限）</span>
          </label>
          <input
            id="expires_at"
            type="datetime-local"
            value={values.expires_at}
            onChange={(e) => setValues((v) => ({ ...v, expires_at: e.target.value }))}
            className={adminInputClass}
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

        <AdminModalActions onCancel={onClose} submitting={submitting} />
      </form>
    </AdminModal>
  );
}

export default function AdminCouponsPage() {
  const coupons = useAdminResource<Coupon>({
    path: '/admin/coupons',
    loadError: 'クーポン一覧の取得に失敗しました',
    deleteError: '削除に失敗しました',
  });

  /** datetime-local の文字列を ISO へ直してから保存する（空文字は無期限＝null）。 */
  const handleSubmit = (values: CouponFormValues) =>
    coupons.save({
      code: values.code,
      discount_type: values.discount_type,
      discount_value: values.discount_value,
      min_order_amount: values.min_order_amount,
      is_active: values.is_active,
      expires_at: values.expires_at ? new Date(values.expires_at).toISOString() : null,
    });

  return (
    <div>
      <AdminListHeader title="クーポン管理" onCreate={coupons.openCreate} />

      <AdminList
        loading={coupons.loading}
        error={coupons.error}
        isEmpty={coupons.items.length === 0}
        emptyText="登録されたクーポンがありません。「新規作成」から追加してください。"
        onCreate={coupons.openCreate}
        minWidth={760}
        head={
          <tr>
            <th className="px-4 py-3 whitespace-nowrap">コード</th>
            <th className="px-4 py-3 whitespace-nowrap text-right">割引</th>
            <th className="px-4 py-3 whitespace-nowrap text-right">最低注文金額</th>
            <th className="px-4 py-3 whitespace-nowrap">有効期限</th>
            <th className="px-4 py-3 whitespace-nowrap">状態</th>
            <th className="px-4 py-3" />
          </tr>
        }
      >
        {coupons.items.map((coupon) => (
          <tr key={coupon.id} className={adminRowClass}>
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
              {coupon.expires_at ? formatDateTime(coupon.expires_at) : '無期限'}
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
              <Badge variant={coupon.is_active ? 'brand' : 'neutral'}>
                {coupon.is_active ? '有効' : '無効'}
              </Badge>
            </td>
            <AdminRowActions
              label={coupon.code}
              onEdit={() => coupons.openEdit(coupon)}
              onDelete={() => coupons.requestDelete(coupon)}
              deleting={coupons.deleting && coupons.deleteTarget?.id === coupon.id}
            />
          </tr>
        ))}
      </AdminList>

      {coupons.modalOpen && (
        <CouponFormModal
          coupon={coupons.editing}
          onClose={coupons.closeModal}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={coupons.deleteTarget !== null}
        danger
        busy={coupons.deleting}
        title={`クーポン「${coupons.deleteTarget?.code ?? ''}」を削除しますか？`}
        description="この操作は取り消せません。発行済みのコードは以後使えなくなります。"
        confirmLabel="削除する"
        onConfirm={coupons.confirmDelete}
        onCancel={coupons.cancelDelete}
      />
    </div>
  );
}
