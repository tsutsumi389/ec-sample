'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';

/**
 * 削除がその行に及ぼす結果。管理画面の一覧は「削除」の意味がリソースごとに違う。カテゴリ・
 * クーポンは物理削除なので行が消えるが、**商品は論理削除**（`status="archived"`）で、一覧
 * （`GET /admin/products`）は archived も返し続ける——行を消すと取り直した瞬間に戻ってくる。
 * どちらかを呼び出し側が選べるようにして、リソースごとの分岐をこのフックの外に出さない。
 */
export type DeleteEffect =
  /** 物理削除。行を一覧から取り除く。 */
  | 'remove'
  /** 論理削除。API が返した更新後の行で差し替える。 */
  | 'replace';

interface AdminResourceOptions {
  /** `/admin/products` のようなコレクションのパス（末尾のスラッシュは付けない）。 */
  path: string;
  loadError: string;
  deleteError: string;
  /** 既定は物理削除。商品のような論理削除は 'replace' を渡す。 */
  deleteEffect?: DeleteEffect;
  /** 作成・更新・削除のあとに走らせたい副作用（カテゴリの控え破棄など）。 */
  afterWrite?: () => void;
}

/**
 * 管理画面の一覧ページが共通して持つ状態遷移
 * （読み込み・エラー・フォームの開閉・保存・削除確認）。
 *
 * 商品・カテゴリ・クーポンの3画面が同一の state とハンドラを写しており、削除中の文言や確認の
 * 作法を直すのに3箇所を回る必要があった（実際に「カテゴリだけ `invalidateCategories()` が
 * 足されている」形で片側だけ進んでいた）。
 *
 * 書き込み後に一覧を全件取り直さないのは、`/admin/*` の更新系がいずれも**更新後のエンティティ
 * を返す**ため（`response_model=ProductOut` 等）。並び順はサーバーが `id` 昇順で返すので、
 * 新規作成を末尾に足せば取り直した結果と一致する。
 */
export function useAdminResource<T extends { id: number }>({
  path,
  loadError,
  deleteError,
  deleteEffect = 'remove',
  afterWrite,
}: AdminResourceOptions) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 呼び出し側がインラインの関数を渡しても load を作り直さないよう ref で持つ。
  const afterWriteRef = useRef(afterWrite);
  afterWriteRef.current = afterWrite;

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<T[]>(path)
      .then(setItems)
      .catch(() => setError(loadError))
      .finally(() => setLoading(false));
  }, [path, loadError]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((item: T) => {
    setEditing(item);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

  /**
   * 作成（editing が null）または更新。フォーム側の送信ハンドラがそのまま await する。
   * 例外はフォームのモーダルが受けてエラー表示に載せるので、ここでは握り潰さない。
   */
  const save = useCallback(
    async (payload: unknown) => {
      const target = editing;
      const saved = target
        ? await api.put<T>(`${path}/${target.id}`, payload)
        : await api.post<T>(path, payload);
      setItems((prev) =>
        target ? prev.map((item) => (item.id === saved.id ? saved : item)) : [...prev, saved]
      );
      setModalOpen(false);
      afterWriteRef.current?.();
    },
    [editing, path]
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setError('');
    setDeleting(true);
    try {
      const result = await api.delete<T>(`${path}/${deleteTarget.id}`);
      setItems((prev) =>
        deleteEffect === 'remove'
          ? prev.filter((item) => item.id !== deleteTarget.id)
          : prev.map((item) => (item.id === deleteTarget.id ? result : item))
      );
      setDeleteTarget(null);
      afterWriteRef.current?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : deleteError);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, path, deleteEffect, deleteError]);

  return {
    items,
    loading,
    error,
    modalOpen,
    editing,
    deleteTarget,
    deleting,
    load,
    openCreate,
    openEdit,
    closeModal,
    save,
    requestDelete: setDeleteTarget,
    cancelDelete: useCallback(() => setDeleteTarget(null), []),
    confirmDelete,
  };
}
