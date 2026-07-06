'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Category, Product, ProductStatus } from '@/lib/types';
import { btnPrimary, btnSecondary } from '@/lib/buttonStyles';
import { ADMIN_SELECTABLE_STATUSES, PRODUCT_STATUS_META } from '@/lib/productStatus';

export interface ProductFormValues {
  name: string;
  sku: string | null;
  description: string;
  price: number;
  sale_price: number | null;
  stock: number;
  status: ProductStatus;
  image_url: string;
  image_urls: string[];
  category_id: number | null;
}

interface ProductFormModalProps {
  product: Product | null;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
}

const emptyForm: ProductFormValues = {
  name: '',
  sku: null,
  description: '',
  price: 0,
  sale_price: null,
  stock: 0,
  status: 'draft',
  image_url: '',
  image_urls: [],
  category_id: null,
};

export default function ProductFormModal({ product, onClose, onSubmit }: ProductFormModalProps) {
  const [values, setValues] = useState<ProductFormValues>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<Category[]>('/categories')
      .then(setCategories)
      .catch((e) => {
        if (!(e instanceof ApiError)) throw e;
      });
  }, []);

  useEffect(() => {
    nameInputRef.current?.focus();

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
    if (product) {
      setValues({
        name: product.name,
        sku: product.sku,
        description: product.description,
        price: product.price,
        sale_price: product.sale_price,
        stock: product.stock,
        // archived な商品を編集する場合も、選択肢に無い値で壊れないよう draft に寄せる。
        status: ADMIN_SELECTABLE_STATUSES.includes(product.status) ? product.status : 'draft',
        image_url: product.image_url,
        image_urls: product.images.map((i) => i.image_url),
        category_id: product.category_id,
      });
    } else {
      setValues(emptyForm);
    }
  }, [product]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      // 追加画像は空行を除いて送る（メイン画像とは別のギャラリー用）。
      const cleaned: ProductFormValues = {
        ...values,
        image_urls: values.image_urls.map((u) => u.trim()).filter(Boolean),
      };
      await onSubmit(cleaned);
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
      aria-labelledby="product-form-title"
      ref={dialogRef}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 id="product-form-title" className="text-lg font-bold mb-4">{product ? '商品を編集' : '商品を新規作成'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              商品名
              <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
              <span className="sr-only">（必須）</span>
            </label>
            <input
              id="name"
              type="text"
              required
              ref={nameInputRef}
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-2">
              商品コード（SKU）
              <span className="ml-1 text-xs font-normal text-gray-600">（任意）</span>
            </label>
            <input
              id="sku"
              type="text"
              value={values.sku ?? ''}
              onChange={(e) =>
                setValues((v) => ({ ...v, sku: e.target.value ? e.target.value : null }))
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              説明
              <span className="ml-1 text-xs font-normal text-gray-600">（任意）</span>
            </label>
            <textarea
              id="description"
              rows={3}
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="category_id" className="block text-sm font-medium text-gray-700 mb-2">
              カテゴリ
              <span className="ml-1 text-xs font-normal text-gray-600">（任意）</span>
            </label>
            <select
              id="category_id"
              value={values.category_id ?? ''}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  category_id: e.target.value ? Number(e.target.value) : null,
                }))
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            >
              <option value="">未分類</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-2">
                価格（円）
                <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
                <span className="sr-only">（必須）</span>
              </label>
              <input
                id="price"
                type="number"
                required
                min={0}
                value={values.price}
                onChange={(e) => setValues((v) => ({ ...v, price: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="stock" className="block text-sm font-medium text-gray-700 mb-2">
                在庫数
                <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
                <span className="sr-only">（必須）</span>
              </label>
              <input
                id="stock"
                type="number"
                required
                min={0}
                value={values.stock}
                onChange={(e) => setValues((v) => ({ ...v, stock: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sale_price" className="block text-sm font-medium text-gray-700 mb-2">
              セール価格（円）
              <span className="ml-1 text-xs font-normal text-gray-600">（任意・定価より安い額）</span>
            </label>
            <input
              id="sale_price"
              type="number"
              min={0}
              value={values.sale_price ?? ''}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  sale_price: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
              販売状態
              <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
              <span className="sr-only">（必須）</span>
            </label>
            <select
              id="status"
              value={values.status}
              onChange={(e) =>
                setValues((v) => ({ ...v, status: e.target.value as ProductStatus }))
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            >
              {ADMIN_SELECTABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PRODUCT_STATUS_META[s].adminLabel}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="image_url" className="block text-sm font-medium text-gray-700 mb-2">
              メイン画像URL
              <span className="ml-1 text-xs font-normal text-gray-600">（任意）</span>
            </label>
            <input
              id="image_url"
              type="text"
              value={values.image_url}
              onChange={(e) => setValues((v) => ({ ...v, image_url: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="image_urls" className="block text-sm font-medium text-gray-700 mb-2">
              追加画像URL（ギャラリー）
              <span className="ml-1 text-xs font-normal text-gray-600">（任意・1行に1URL）</span>
            </label>
            <textarea
              id="image_urls"
              rows={3}
              value={values.image_urls.join('\n')}
              onChange={(e) =>
                setValues((v) => ({ ...v, image_urls: e.target.value.split('\n') }))
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
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
