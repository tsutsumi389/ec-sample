'use client';

import type { Product } from '@/lib/types';
import ProductFormModal, { ProductFormValues } from '@/components/ProductFormModal';
import ProductPrice from '@/components/ProductPrice';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import AdminList, {
  AdminListHeader,
  AdminRowActions,
  adminRowClass,
} from '@/components/admin/AdminList';
import { PRODUCT_STATUS_META } from '@/lib/productStatus';
import { useAdminResource } from '@/lib/useAdminResource';

export default function AdminProductsPage() {
  const products = useAdminResource<Product>({
    path: '/admin/products',
    loadError: '商品一覧の取得に失敗しました',
    deleteError: '削除に失敗しました',
    // 商品は論理削除（status="archived"）。一覧は archived も返すので、行は消さず差し替える。
    deleteEffect: 'replace',
  });

  const handleSubmit = (values: ProductFormValues) => products.save(values);

  return (
    <div>
      <AdminListHeader title="商品管理" onCreate={products.openCreate} />

      <AdminList
        loading={products.loading}
        error={products.error}
        isEmpty={products.items.length === 0}
        emptyText="登録された商品がありません。「新規作成」から商品を追加してください。"
        onCreate={products.openCreate}
        minWidth={640}
        head={
          <tr>
            <th className="px-4 py-3 whitespace-nowrap">商品名</th>
            <th className="px-4 py-3 whitespace-nowrap text-right">価格</th>
            <th className="px-4 py-3 whitespace-nowrap text-right">在庫</th>
            <th className="px-4 py-3 whitespace-nowrap">状態</th>
            <th className="px-4 py-3" />
          </tr>
        }
      >
        {products.items.map((product) => (
          <tr key={product.id} className={adminRowClass}>
            <td className="px-4 py-3 font-medium whitespace-nowrap">{product.name}</td>
            <td className="px-4 py-3 whitespace-nowrap text-right">
              {/* 実売価格は effective_price（sale_price があればそれ）。
                  price を直に出すと、セール中の商品だけ管理画面と店頭で違う額が並ぶ。 */}
              <ProductPrice product={product} size="sm" className="justify-end" />
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-right">{product.stock}</td>
            <td className="px-4 py-3 whitespace-nowrap">
              <Badge variant={PRODUCT_STATUS_META[product.status].variant}>
                {PRODUCT_STATUS_META[product.status].adminLabel}
              </Badge>
            </td>
            <AdminRowActions
              label={product.name}
              onEdit={() => products.openEdit(product)}
              onDelete={() => products.requestDelete(product)}
              deleting={products.deleting && products.deleteTarget?.id === product.id}
            />
          </tr>
        ))}
      </AdminList>

      {products.modalOpen && (
        <ProductFormModal
          product={products.editing}
          onClose={products.closeModal}
          onSubmit={handleSubmit}
        />
      )}

      {/* 店頭側と同じ確認の作法（フォーカストラップ・busy 中の二重確定防止）。
          window.confirm はメインスレッドを止め、削除中の状態も説明文も持てない。 */}
      <ConfirmDialog
        open={products.deleteTarget !== null}
        danger
        busy={products.deleting}
        title={`「${products.deleteTarget?.name ?? ''}」を削除しますか？`}
        description="一覧・商品ページから外れます（アーカイブとしてデータは残り、過去の注文明細も変わりません）。"
        confirmLabel="削除する"
        onConfirm={products.confirmDelete}
        onCancel={products.cancelDelete}
      />
    </div>
  );
}
