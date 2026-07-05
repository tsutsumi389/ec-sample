'use client';

import { FormEvent, useState } from 'react';
import type { Address } from '@/lib/types';
import { btnPrimary, btnSecondary } from '@/lib/buttonStyles';

export interface AddressFormValues {
  recipient_name: string;
  postal_code: string;
  prefecture: string;
  city: string;
  address_line: string;
  phone: string;
  is_default: boolean;
}

type FieldErrors = Partial<Record<keyof AddressFormValues, string>>;

interface AddressFormProps {
  initialValues?: Address | null;
  onSubmit: (values: AddressFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const EMPTY_VALUES: AddressFormValues = {
  recipient_name: '',
  postal_code: '',
  prefecture: '',
  city: '',
  address_line: '',
  phone: '',
  is_default: false,
};

export default function AddressForm({ initialValues, onSubmit, onCancel, submitLabel }: AddressFormProps) {
  const [values, setValues] = useState<AddressFormValues>(
    initialValues
      ? {
          recipient_name: initialValues.recipient_name,
          postal_code: initialValues.postal_code,
          prefecture: initialValues.prefecture,
          city: initialValues.city,
          address_line: initialValues.address_line,
          phone: initialValues.phone,
          is_default: initialValues.is_default,
        }
      : EMPTY_VALUES
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setField = <K extends keyof AddressFormValues>(key: K, value: AddressFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!values.recipient_name.trim()) errors.recipient_name = 'お届け先氏名を入力してください';
    if (!values.postal_code.trim()) {
      errors.postal_code = '郵便番号を入力してください';
    } else if (!/^\d{3}-?\d{4}$/.test(values.postal_code.trim())) {
      errors.postal_code = '郵便番号の形式が正しくありません（例: 123-4567）';
    }
    if (!values.prefecture.trim()) errors.prefecture = '都道府県を入力してください';
    if (!values.city.trim()) errors.city = '市区町村を入力してください';
    if (!values.address_line.trim()) errors.address_line = '番地・建物名を入力してください';
    if (!values.phone.trim()) {
      errors.phone = '電話番号を入力してください';
    } else if (!/^[\d-]{10,15}$/.test(values.phone.trim())) {
      errors.phone = '電話番号の形式が正しくありません';
    }
    return errors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div>
        <label htmlFor="recipient_name" className="block text-sm font-medium text-gray-700 mb-1">
          お届け先氏名
          <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
          <span className="sr-only">（必須）</span>
        </label>
        <input
          id="recipient_name"
          type="text"
          aria-invalid={Boolean(fieldErrors.recipient_name)}
          value={values.recipient_name}
          onChange={(e) => setField('recipient_name', e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
        />
        {fieldErrors.recipient_name && (
          <p role="alert" className="text-xs text-red-600 mt-1">
            {fieldErrors.recipient_name}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="postal_code" className="block text-sm font-medium text-gray-700 mb-1">
          郵便番号
          <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
          <span className="sr-only">（必須）</span>
        </label>
        <input
          id="postal_code"
          type="text"
          placeholder="123-4567"
          aria-invalid={Boolean(fieldErrors.postal_code)}
          value={values.postal_code}
          onChange={(e) => setField('postal_code', e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
        />
        {fieldErrors.postal_code && (
          <p role="alert" className="text-xs text-red-600 mt-1">
            {fieldErrors.postal_code}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="prefecture" className="block text-sm font-medium text-gray-700 mb-1">
            都道府県
            <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
            <span className="sr-only">（必須）</span>
          </label>
          <input
            id="prefecture"
            type="text"
            aria-invalid={Boolean(fieldErrors.prefecture)}
            value={values.prefecture}
            onChange={(e) => setField('prefecture', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
          />
          {fieldErrors.prefecture && (
            <p role="alert" className="text-xs text-red-600 mt-1">
              {fieldErrors.prefecture}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
            市区町村
            <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
            <span className="sr-only">（必須）</span>
          </label>
          <input
            id="city"
            type="text"
            aria-invalid={Boolean(fieldErrors.city)}
            value={values.city}
            onChange={(e) => setField('city', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
          />
          {fieldErrors.city && (
            <p role="alert" className="text-xs text-red-600 mt-1">
              {fieldErrors.city}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="address_line" className="block text-sm font-medium text-gray-700 mb-1">
          番地・建物名
          <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
          <span className="sr-only">（必須）</span>
        </label>
        <input
          id="address_line"
          type="text"
          aria-invalid={Boolean(fieldErrors.address_line)}
          value={values.address_line}
          onChange={(e) => setField('address_line', e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
        />
        {fieldErrors.address_line && (
          <p role="alert" className="text-xs text-red-600 mt-1">
            {fieldErrors.address_line}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
          電話番号
          <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
          <span className="sr-only">（必須）</span>
        </label>
        <input
          id="phone"
          type="tel"
          placeholder="090-1234-5678"
          aria-invalid={Boolean(fieldErrors.phone)}
          value={values.phone}
          onChange={(e) => setField('phone', e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
        />
        {fieldErrors.phone && (
          <p role="alert" className="text-xs text-red-600 mt-1">
            {fieldErrors.phone}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={values.is_default}
          onChange={(e) => setField('is_default', e.target.checked)}
          className="rounded border-gray-300"
        />
        既定のお届け先にする
      </label>

      {error && (
        <p role="alert" className="text-red-600 text-sm">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting} className={btnPrimary}>
          {submitting ? '保存中...' : submitLabel || '保存する'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} className={btnSecondary}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
