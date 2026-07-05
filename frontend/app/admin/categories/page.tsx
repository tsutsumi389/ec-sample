'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Category } from '@/lib/types';
import ScrollableTable from '@/components/ScrollableTable';
import Spinner from '@/components/Spinner';
import { PlusIcon } from '@/components/Icons';
import { btnPrimary, btnSecondary } from '@/lib/buttonStyles';

interface CategoryFormValues {
  name: string;
  slug: string;
}

const emptyForm: CategoryFormValues = { name: '', slug: '' };

function CategoryFormModal({
  category,
  onClose,
  onSubmit,
}: {
  category: Category | null;
  onClose: () => void;
  onSubmit: (values: CategoryFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<CategoryFormValues>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

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
    if (category) {
      setValues({ name: category.name, slug: category.slug });
    } else {
      setValues(emptyForm);
    }
  }, [category]);

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
      aria-labelledby="category-form-title"
      ref={dialogRef}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 id="category-form-title" className="text-lg font-bold mb-4">
          {category ? 'カテゴリを編集' : 'カテゴリを新規作成'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              カテゴリ名
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
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-2">
              スラッグ
              <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
              <span className="sr-only">（必須）</span>
            </label>
            <input
              id="slug"
              type="text"
              required
              value={values.slug}
              onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
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

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadCategories = () => {
    setLoading(true);
    api
      .get<Category[]>('/admin/categories')
      .then(setCategories)
      .catch(() => setError('カテゴリ一覧の取得に失敗しました'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const openCreate = () => {
    setEditingCategory(null);
    setModalOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditingCategory(category);
    setModalOpen(true);
  };

  const handleSubmit = async (values: CategoryFormValues) => {
    if (editingCategory) {
      await api.put(`/admin/categories/${editingCategory.id}`, values);
    } else {
      await api.post('/admin/categories', values);
    }
    setModalOpen(false);
    loadCategories();
  };

  const handleDelete = async (category: Category) => {
    if (!window.confirm(`「${category.name}」を削除しますか？（該当商品のカテゴリ設定は解除されます）`)) return;
    setError('');
    setDeletingId(category.id);
    try {
      await api.delete(`/admin/categories/${category.id}`);
      loadCategories();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">カテゴリ管理</h1>
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

      {!loading && categories.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-600 mb-4">登録されたカテゴリがありません。「新規作成」から追加してください。</p>
          <button type="button" onClick={openCreate} className={`${btnSecondary} inline-flex items-center gap-2`}>
            <PlusIcon className="w-4 h-4" />
            新規作成
          </button>
        </div>
      )}

      {!loading && categories.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <ScrollableTable>
            <table className="min-w-[480px] w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">カテゴリ名</th>
                  <th className="px-4 py-3 whitespace-nowrap">スラッグ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {categories.map((category) => (
                  <tr key={category.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{category.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{category.slug}</td>
                    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(category)}
                        aria-label={`${category.name}を編集`}
                        className="text-brand-600 hover:underline px-2 py-2 -m-2 inline-block"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(category)}
                        disabled={deletingId === category.id}
                        aria-label={`${category.name}を削除`}
                        className="text-red-600 hover:underline px-2 py-2 -m-2 inline-block disabled:opacity-50"
                      >
                        {deletingId === category.id ? '削除中...' : '削除'}
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
        <CategoryFormModal category={editingCategory} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} />
      )}
    </div>
  );
}
