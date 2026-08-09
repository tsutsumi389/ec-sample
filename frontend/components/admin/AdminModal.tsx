'use client';

import { useRef, type ReactNode, type RefObject } from 'react';
import { useFocusTrap } from '@/lib/focusTrap';
import { btnPrimary, btnSecondary } from '@/lib/buttonStyles';

/** 器の最大幅。フォームの列数で選ぶ（1列 = lg、2列 = 2xl）。 */
const WIDTHS = {
  lg: 'max-w-lg',
  '2xl': 'max-w-2xl',
} as const;

/**
 * 管理画面のフォームモーダルの器。
 *
 * オーバーレイ（`fixed inset-0 bg-invert/50 …`）と `role="dialog"` / `aria-modal` /
 * `aria-labelledby` の組み合わせが4箇所に一字一句写されており、**実験の作成フォームだけ
 * `useFocusTrap` を取り落としていた**（Tab が背後の一覧へ抜け、Esc で閉じない）。
 * 器を1つにすれば、次にモーダルを足す人がフォーカストラップを思い出す必要がなくなる。
 *
 * ⚠ 破壊的操作の確認には使わない。それは components/ConfirmDialog.tsx の担当。
 */
export default function AdminModal({
  titleId,
  title,
  width = 'lg',
  onClose,
  initialFocus,
  panelClassName = 'bg-white rounded-lg shadow-xl',
  children,
}: {
  titleId: string;
  title: string;
  width?: keyof typeof WIDTHS;
  onClose: () => void;
  /** 開いた瞬間にフォーカスを置く要素（通常は先頭の入力欄）。 */
  initialFocus?: RefObject<HTMLElement>;
  /**
   * 面の造形。管理画面は gray 系（既定）、商品フォームだけが店頭と同じ
   * brand トークン（`bg-surface` / `shadow-float`）で組まれている。
   * 2系統あること自体はこの器の判断ではないので、呼び出し側から受ける。
   */
  panelClassName?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, { onEscape: onClose, initialFocus });

  return (
    <div
      className="fixed inset-0 bg-invert/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={dialogRef}
    >
      <div className={`w-full ${WIDTHS[width]} p-6 max-h-[90vh] overflow-y-auto ${panelClassName}`}>
        <h2 id={titleId} className="text-lg font-bold mb-4">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/**
 * フォームの footer（キャンセル / 保存）。文言と「保存中...」の出し方を1箇所に閉じる。
 * 4つのフォームが同じ2行を写しており、片方だけ文言が変わる余地が残っていた。
 */
export function AdminModalActions({
  onCancel,
  submitting,
  submitLabel = '保存する',
  submittingLabel = '保存中...',
}: {
  onCancel: () => void;
  submitting: boolean;
  submitLabel?: string;
  submittingLabel?: string;
}) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className={btnSecondary}>
        キャンセル
      </button>
      <button type="submit" disabled={submitting} className={btnPrimary}>
        {submitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}
