'use client';

import { FormEvent, useRef, useState } from 'react';
import type { Category } from '@/lib/types';
import ConfirmDialog from '@/components/ConfirmDialog';
import RequiredMark from '@/components/RequiredMark';
import AdminList, {
  AdminListHeader,
  AdminRowActions,
  adminRowClass,
} from '@/components/admin/AdminList';
import AdminModal, { AdminModalActions } from '@/components/admin/AdminModal';
import { adminInputClass, adminLabelClass } from '@/lib/formStyles';
import { invalidateCategories } from '@/lib/categories';
import { useAdminResource } from '@/lib/useAdminResource';

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
  // 呼び出し側は編集対象を確定させてからモーダルをマウントするので、初期値は遅延初期化で足りる。
  const [values, setValues] = useState<CategoryFormValues>(() =>
    category ? { name: category.name, slug: category.slug } : emptyForm
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

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
      titleId="category-form-title"
      title={category ? 'カテゴリを編集' : 'カテゴリを新規作成'}
      onClose={onClose}
      initialFocus={nameInputRef}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className={adminLabelClass}>
            カテゴリ名
            <RequiredMark />
          </label>
          <input
            id="name"
            type="text"
            required
            ref={nameInputRef}
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            className={adminInputClass}
          />
        </div>

        <div>
          <label htmlFor="slug" className={adminLabelClass}>
            スラッグ
            <RequiredMark />
          </label>
          <input
            id="slug"
            type="text"
            required
            value={values.slug}
            onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
            className={adminInputClass}
          />
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

export default function AdminCategoriesPage() {
  const categories = useAdminResource<Category>({
    path: '/admin/categories',
    loadError: 'カテゴリ一覧の取得に失敗しました',
    deleteError: '削除に失敗しました',
    // 店頭側（GET /categories）の控えを捨てる。捨てないと、同じセッションで開いた
    // 商品フォームの選択肢に今作ったカテゴリが出ない（消したものが残る）。
    afterWrite: invalidateCategories,
  });

  return (
    <div>
      <AdminListHeader title="カテゴリ管理" onCreate={categories.openCreate} />

      <AdminList
        loading={categories.loading}
        error={categories.error}
        isEmpty={categories.items.length === 0}
        emptyText="登録されたカテゴリがありません。「新規作成」から追加してください。"
        onCreate={categories.openCreate}
        minWidth={480}
        head={
          <tr>
            <th className="px-4 py-3 whitespace-nowrap">カテゴリ名</th>
            <th className="px-4 py-3 whitespace-nowrap">スラッグ</th>
            <th className="px-4 py-3" />
          </tr>
        }
      >
        {categories.items.map((category) => (
          <tr key={category.id} className={adminRowClass}>
            <td className="px-4 py-3 font-medium whitespace-nowrap">{category.name}</td>
            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{category.slug}</td>
            <AdminRowActions
              label={category.name}
              onEdit={() => categories.openEdit(category)}
              onDelete={() => categories.requestDelete(category)}
              deleting={categories.deleting && categories.deleteTarget?.id === category.id}
            />
          </tr>
        ))}
      </AdminList>

      {categories.modalOpen && (
        <CategoryFormModal
          category={categories.editing}
          onClose={categories.closeModal}
          onSubmit={categories.save}
        />
      )}

      <ConfirmDialog
        open={categories.deleteTarget !== null}
        danger
        busy={categories.deleting}
        title={`「${categories.deleteTarget?.name ?? ''}」を削除しますか？`}
        description="このカテゴリに属する商品は残りますが、カテゴリ設定は解除されます。"
        confirmLabel="削除する"
        onConfirm={categories.confirmDelete}
        onCancel={categories.cancelDelete}
      />
    </div>
  );
}
