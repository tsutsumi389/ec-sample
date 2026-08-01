'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Category, Product, ProductSpec, ProductStatus } from '@/lib/types';
import { btnPrimary, btnSecondary } from '@/lib/buttonStyles';
import { useFocusTrap } from '@/lib/focusTrap';
import { ADMIN_SELECTABLE_STATUSES, PRODUCT_STATUS_META } from '@/lib/productStatus';
import { fetchCategories } from '@/lib/categories';

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
  /** 仕様（サイズ・素材など）。表示順は配列順。空行はサーバー側でも捨てられる。 */
  specs: ProductSpec[];
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
  specs: [],
  category_id: null,
};

/** 編集対象をフォームの初期値へ。新規（null）のときは空フォーム。 */
function toFormValues(product: Product | null): ProductFormValues {
  if (!product) return emptyForm;
  return {
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
    specs: product.specs.map((s) => ({ label: s.label, value: s.value })),
    category_id: product.category_id,
  };
}

export default function ProductFormModal({ product, onClose, onSubmit }: ProductFormModalProps) {
  // 呼び出し側は編集対象を確定させてからモーダルをマウントするので、初期値は遅延初期化で足りる。
  // （空フォームを入れてから effect で埋め直すと、初回レンダーが必ず空になる2段構えになる。）
  const [values, setValues] = useState<ProductFormValues>(() => toFormValues(product));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((e) => {
        if (!(e instanceof ApiError)) throw e;
      });
  }, []);

  useFocusTrap(dialogRef, { onEscape: onClose, initialFocus: nameInputRef });

  /** 仕様の1行を書き換える。行の追加・削除は下の2つのハンドラが受け持つ。 */
  const updateSpec = (index: number, patch: Partial<ProductSpec>) =>
    setValues((v) => ({
      ...v,
      specs: v.specs.map((spec, i) => (i === index ? { ...spec, ...patch } : spec)),
    }));

  const addSpec = () =>
    setValues((v) => ({ ...v, specs: [...v.specs, { label: '', value: '' }] }));

  const removeSpec = (index: number) =>
    setValues((v) => ({ ...v, specs: v.specs.filter((_, i) => i !== index) }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      // 追加画像は空行を除いて送る（メイン画像とは別のギャラリー用）。
      // 仕様も同様に、項目名か値が空の行は送らない（サーバー側でも同じ判定をしている）。
      const cleaned: ProductFormValues = {
        ...values,
        image_urls: values.image_urls.map((u) => u.trim()).filter(Boolean),
        specs: values.specs
          .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
          .filter((s) => s.label && s.value),
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
      className="fixed inset-0 bg-invert/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-title"
      ref={dialogRef}
    >
      <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-float max-h-[90vh] overflow-y-auto">
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

          {/* 仕様（product_specs）。商品ページの「仕様」欄がこの行をそのまま出し、
              検索の埋め込み原文にも入る。在庫・価格はここに書かないこと（状態であって
              仕様ではなく、商品ページで在庫の数字が二度出る）。 */}
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">
              仕様
              <span className="ml-1 text-xs font-normal text-gray-600">
                （任意・サイズや素材など。在庫や価格は入れない）
              </span>
            </span>
            {values.specs.length > 0 && (
              <ul className="space-y-2">
                {values.specs.map((spec, index) => (
                  <li key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={spec.label}
                      onChange={(e) => updateSpec(index, { label: e.target.value })}
                      aria-label={`仕様${index + 1}の項目名`}
                      placeholder="項目名（例: 重量）"
                      className="w-1/3 border border-gray-300 rounded-md px-3 py-2.5 text-sm"
                    />
                    <input
                      type="text"
                      value={spec.value}
                      onChange={(e) => updateSpec(index, { value: e.target.value })}
                      aria-label={`仕様${index + 1}の値`}
                      placeholder="値（例: 約350g）"
                      className="flex-1 min-w-0 border border-gray-300 rounded-md px-3 py-2.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeSpec(index)}
                      aria-label={`仕様${index + 1}を削除`}
                      className="shrink-0 rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={addSpec}
              className="mt-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              仕様を追加
            </button>
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
