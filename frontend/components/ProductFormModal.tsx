'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Product } from '@/lib/types';

export interface ProductFormValues {
  name: string;
  description: string;
  price: number;
  stock: number;
  image_url: string;
  is_active: boolean;
}

interface ProductFormModalProps {
  product: Product | null;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
}

const emptyForm: ProductFormValues = {
  name: '',
  description: '',
  price: 0,
  stock: 0,
  image_url: '',
  is_active: true,
};

export default function ProductFormModal({ product, onClose, onSubmit }: ProductFormModalProps) {
  const [values, setValues] = useState<ProductFormValues>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (product) {
      setValues({
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
        image_url: product.image_url,
        is_active: product.is_active,
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
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">{product ? '商品を編集' : '商品を新規作成'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">商品名</label>
            <input
              type="text"
              required
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
            <textarea
              rows={3}
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">価格（円）</label>
              <input
                type="number"
                required
                min={0}
                value={values.price}
                onChange={(e) => setValues((v) => ({ ...v, price: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">在庫数</label>
              <input
                type="number"
                required
                min={0}
                value={values.stock}
                onChange={(e) => setValues((v) => ({ ...v, stock: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">画像URL</label>
            <input
              type="text"
              value={values.image_url}
              onChange={(e) => setValues((v) => ({ ...v, image_url: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
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
              公開する
            </label>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? '保存中...' : '保存する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
