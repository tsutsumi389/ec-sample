'use client';

import { FormEvent, useState } from 'react';
import type { Address } from '@/lib/types';
import { btn } from '@/lib/buttonStyles';
import { SELECT_CHEVRON } from '@/lib/selectChevron';

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

/** 47都道府県（北から南の順）。 */
const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

/** テキスト入力の共通クラス（focus リングと accent 色を統一）。 */
const inputClass = (hasError?: boolean) =>
  `h-11 w-full rounded-md border bg-surface px-3 text-body accent-brand-600 transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:border-brand-600 ${
    hasError ? 'border-critical-400' : 'border-line-input'
  }`;

interface ZipCloudResult {
  address1?: string;
  address2?: string;
  address3?: string;
}

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

  // 郵便番号から住所を自動補完する（失敗時は静かに無視）。
  const lookupPostal = async (zip: string) => {
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`);
      if (!res.ok) return;
      const data = await res.json();
      const result: ZipCloudResult | undefined = data?.results?.[0];
      if (!result) return;
      const city = `${result.address2 ?? ''}${result.address3 ?? ''}`;
      setValues((prev) => ({
        ...prev,
        prefecture: result.address1 || prev.prefecture,
        city: city || prev.city,
      }));
      setFieldErrors((prev) => ({ ...prev, prefecture: undefined, city: undefined }));
    } catch {
      // 補完に失敗しても手入力できるため無視する
    }
  };

  const handlePostalChange = (value: string) => {
    setField('postal_code', value);
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length === 7) {
      void lookupPostal(digits);
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
    <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-xl bg-surface p-6 shadow-paper">
      <div>
        <label htmlFor="recipient_name" className="mb-1 block text-caption font-medium text-ink-soft">
          お届け先氏名
          <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
          <span className="sr-only">（必須）</span>
        </label>
        <input
          id="recipient_name"
          type="text"
          aria-invalid={Boolean(fieldErrors.recipient_name)}
          value={values.recipient_name}
          onChange={(e) => setField('recipient_name', e.target.value)}
          className={inputClass(Boolean(fieldErrors.recipient_name))}
        />
        {fieldErrors.recipient_name && (
          <p role="alert" className="mt-1 text-caption text-critical-700">
            {fieldErrors.recipient_name}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="postal_code" className="mb-1 block text-caption font-medium text-ink-soft">
          郵便番号
          <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
          <span className="sr-only">（必須）</span>
        </label>
        <input
          id="postal_code"
          type="text"
          inputMode="numeric"
          placeholder="123-4567"
          aria-invalid={Boolean(fieldErrors.postal_code)}
          aria-describedby="postal_code-hint"
          value={values.postal_code}
          onChange={(e) => handlePostalChange(e.target.value)}
          className={inputClass(Boolean(fieldErrors.postal_code))}
        />
        <p id="postal_code-hint" className="mt-1 text-caption text-ink-muted">
          7桁を入力すると住所を自動で補完します。
        </p>
        {fieldErrors.postal_code && (
          <p role="alert" className="mt-1 text-caption text-critical-700">
            {fieldErrors.postal_code}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="prefecture" className="mb-1 block text-caption font-medium text-ink-soft">
            都道府県
            <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
            <span className="sr-only">（必須）</span>
          </label>
          <select
            id="prefecture"
            aria-invalid={Boolean(fieldErrors.prefecture)}
            value={values.prefecture}
            onChange={(e) => setField('prefecture', e.target.value)}
            style={{ backgroundImage: `url("${SELECT_CHEVRON}")` }}
            className={`appearance-none bg-surface bg-[length:1rem_1rem] bg-[right_0.625rem_center] bg-no-repeat pr-9 ${inputClass(
              Boolean(fieldErrors.prefecture)
            )}`}
          >
            <option value="">選択してください</option>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {fieldErrors.prefecture && (
            <p role="alert" className="mt-1 text-caption text-critical-700">
              {fieldErrors.prefecture}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="city" className="mb-1 block text-caption font-medium text-ink-soft">
            市区町村
            <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
            <span className="sr-only">（必須）</span>
          </label>
          <input
            id="city"
            type="text"
            aria-invalid={Boolean(fieldErrors.city)}
            value={values.city}
            onChange={(e) => setField('city', e.target.value)}
            className={inputClass(Boolean(fieldErrors.city))}
          />
          {fieldErrors.city && (
            <p role="alert" className="mt-1 text-caption text-critical-700">
              {fieldErrors.city}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="address_line" className="mb-1 block text-caption font-medium text-ink-soft">
          番地・建物名
          <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
          <span className="sr-only">（必須）</span>
        </label>
        <input
          id="address_line"
          type="text"
          aria-invalid={Boolean(fieldErrors.address_line)}
          value={values.address_line}
          onChange={(e) => setField('address_line', e.target.value)}
          className={inputClass(Boolean(fieldErrors.address_line))}
        />
        {fieldErrors.address_line && (
          <p role="alert" className="mt-1 text-caption text-critical-700">
            {fieldErrors.address_line}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="phone" className="mb-1 block text-caption font-medium text-ink-soft">
          電話番号
          <span className="ml-0.5 text-critical-600" aria-hidden="true">*</span>
          <span className="sr-only">（必須）</span>
        </label>
        <input
          id="phone"
          type="tel"
          placeholder="090-1234-5678"
          aria-invalid={Boolean(fieldErrors.phone)}
          value={values.phone}
          onChange={(e) => setField('phone', e.target.value)}
          className={inputClass(Boolean(fieldErrors.phone))}
        />
        {fieldErrors.phone && (
          <p role="alert" className="mt-1 text-caption text-critical-700">
            {fieldErrors.phone}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-body text-ink-soft">
        <input
          type="checkbox"
          checked={values.is_default}
          onChange={(e) => setField('is_default', e.target.checked)}
          className="rounded border-line-input accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        />
        既定のお届け先にする
      </label>

      {error && (
        <p role="alert" className="text-body text-critical-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={submitting} className={btn('primary', 'md')}>
          {submitting ? '保存中...' : submitLabel || '保存する'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} className={btn('secondary', 'md')}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
