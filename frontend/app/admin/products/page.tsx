'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Product } from '@/lib/types';
import ProductFormModal, { ProductFormValues } from '@/components/ProductFormModal';
import ScrollableTable from '@/components/ScrollableTable';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadProducts = () => {
    setLoading(true);
    api
      .get<Product[]>('/admin/products')
      .then(setProducts)
      .catch(() => setError('商品一覧の取得に失敗しました'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const openCreate = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setModalOpen(true);
  };

  const handleSubmit = async (values: ProductFormValues) => {
    if (editingProduct) {
      await api.put(`/admin/products/${editingProduct.id}`, values);
    } else {
      await api.post('/admin/products', values);
    }
    setModalOpen(false);
    loadProducts();
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`「${product.name}」を削除しますか？`)) return;
    setError('');
    setDeletingId(product.id);
    try {
      await api.delete(`/admin/products/${product.id}`);
      loadProducts();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">商品管理</h1>
        <button
          type="button"
          onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700"
        >
          新規作成
        </button>
      </div>

      {loading && <p className="text-gray-600 flex items-center"><Spinner className="mr-2" />読み込み中...</p>}
      {error && (
        <p role="alert" className="text-red-600 mb-4">
          {error}
        </p>
      )}

      {!loading && products.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-600 mb-4">登録された商品がありません。「新規作成」から商品を追加してください。</p>
          <button
            type="button"
            onClick={openCreate}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700"
          >
            新規作成
          </button>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <ScrollableTable>
            <table className="min-w-[640px] w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">商品名</th>
                  <th className="px-4 py-3 whitespace-nowrap">価格</th>
                  <th className="px-4 py-3 whitespace-nowrap">在庫</th>
                  <th className="px-4 py-3 whitespace-nowrap">状態</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{product.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Price value={product.price} size="sm" />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{product.stock}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          product.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {product.is_active ? '公開中' : '非公開'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(product)}
                        aria-label={`${product.name}を編集`}
                        className="text-indigo-600 hover:underline px-2 py-2 -m-2 inline-block"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product)}
                        disabled={deletingId === product.id}
                        aria-label={`${product.name}を削除`}
                        className="text-red-600 hover:underline px-2 py-2 -m-2 inline-block disabled:opacity-50"
                      >
                        {deletingId === product.id ? '削除中...' : '削除'}
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
        <ProductFormModal product={editingProduct} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} />
      )}
    </div>
  );
}
