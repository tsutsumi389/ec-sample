import type { ReactNode } from 'react';
import ScrollableTable from '@/components/ScrollableTable';
import Spinner from '@/components/Spinner';
import { PlusIcon } from '@/components/Icons';
import { btnPrimary, btnSecondary } from '@/lib/buttonStyles';

/**
 * 管理画面の一覧ページの器。
 *
 * 商品・カテゴリ・クーポン・注文・利用者の5枚が「見出し行 → 読み込み中 → エラー →
 * 空状態の箱 → 白カード＋表」を一字一句同じ文字列で写していた。空状態の言い回しや
 * 表の罫を直すのに5箇所を回ることになり、実際に片側だけ進んでいる差分があった。
 *
 * ⚠ 店頭側の EmptyState / ErrorNotice はここでは使わない。管理画面は gray-* / text-sm の
 *   別系統で組まれており（意図的）、混ぜると1画面の中で2つの体系が並ぶ。
 */

/** 一覧の見出し行。右端に「新規作成」を置く（読み取り専用の一覧では onCreate を省く）。 */
export function AdminListHeader({
  title,
  onCreate,
}: {
  title: string;
  onCreate?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
      <h1 className="text-2xl font-bold">{title}</h1>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className={`${btnPrimary} inline-flex items-center gap-2`}
        >
          <PlusIcon className="w-4 h-4" />
          新規作成
        </button>
      )}
    </div>
  );
}

/** 一覧の取得・更新に失敗したときの一行。role="alert" を落とさないための器。 */
export function AdminError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-red-600 mb-4">
      {message}
    </p>
  );
}

interface AdminListProps {
  loading: boolean;
  error: string;
  /** 表の中身が0件か。読み込み中は評価しない。 */
  isEmpty: boolean;
  /** 空のときの説明文。 */
  emptyText: string;
  /** 空状態の箱に置く「新規作成」。読み取り専用の一覧では省く。 */
  onCreate?: () => void;
  /** 表が潰れない最小幅（px）。これを下回ると ScrollableTable が横スクロールに逃がす。 */
  minWidth: number;
  /** `<tr>` を1本。列ごとの寄せは呼び出し側が持つ。 */
  head: ReactNode;
  /** `<tr>` の並び。 */
  children: ReactNode;
}

export default function AdminList({
  loading,
  error,
  isEmpty,
  emptyText,
  onCreate,
  minWidth,
  head,
  children,
}: AdminListProps) {
  return (
    <>
      {loading && (
        <p className="text-gray-600 flex items-center">
          <Spinner className="mr-2" />
          読み込み中...
        </p>
      )}
      <AdminError message={error} />

      {!loading && isEmpty && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-600 mb-4">{emptyText}</p>
          {onCreate && (
            <button
              type="button"
              onClick={onCreate}
              className={`${btnSecondary} inline-flex items-center gap-2`}
            >
              <PlusIcon className="w-4 h-4" />
              新規作成
            </button>
          )}
        </div>
      )}

      {!loading && !isEmpty && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <ScrollableTable>
            <table className="w-full text-sm" style={{ minWidth: `${minWidth}px` }}>
              <thead className="bg-gray-50 text-left text-gray-600">{head}</thead>
              <tbody className="divide-y divide-gray-200">{children}</tbody>
            </table>
          </ScrollableTable>
        </div>
      )}
    </>
  );
}

/** 一覧の行。hover の当たりを1箇所に閉じる。 */
export const adminRowClass = 'hover:bg-gray-50 transition-colors';

/**
 * 行末の「編集 / 削除」。押下領域（px-2 py-2 -m-2）と無効時の濃度を揃える。
 * 削除は確認ダイアログを開くだけで、実行はしない（呼び出し側が ConfirmDialog を持つ）。
 */
export function AdminRowActions({
  label,
  onEdit,
  onDelete,
  deleting = false,
}: {
  /** 「◯◯を編集」の読み上げに使う、その行を指す名前。 */
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  return (
    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${label}を編集`}
        className="text-brand-600 hover:underline px-2 py-2 -m-2 inline-block"
      >
        編集
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label={`${label}を削除`}
        className="text-red-600 hover:underline px-2 py-2 -m-2 inline-block disabled:opacity-50"
      >
        {deleting ? '削除中...' : '削除'}
      </button>
    </td>
  );
}
