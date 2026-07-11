'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { btnPrimary, btnSecondary } from '@/lib/buttonStyles';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const dangerConfirmClass =
  'bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * 確認ダイアログ。Esc・オーバーレイクリックで onCancel、開いたら確認ボタンにフォーカス、
 * Tab は内部で循環（簡易フォーカストラップ）。danger 時は確認ボタンを赤系にする。
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'キャンセル',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();
  // 出現時の scale+opacity トランジション用
  const [entered, setEntered] = useState(false);

  // onCancel は呼び出し側でインラインアロー関数が渡されるため参照が毎レンダー変わる。
  // effect の再実行（＝フォーカス奪取）を防ぐため ref に退避し、依存配列から外す。
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  // 開く直前のフォーカス要素（トリガー）を保持し、閉じたら戻す。
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }

    // 開く直前のフォーカス要素を保存しておく
    triggerRef.current = document.activeElement as HTMLElement | null;

    // 開いた瞬間（false→true 遷移時）だけ確認ボタンへフォーカス
    confirmButtonRef.current?.focus();
    // 次フレームでトランジション開始
    const raf = requestAnimationFrame(() => setEntered(true));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelRef.current();
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
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown);
      // 閉じたら元のトリガー要素へフォーカスを戻す
      triggerRef.current?.focus();
      triggerRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 transition-opacity duration-150 ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm bg-white rounded-lg shadow-xl p-6 transition-all duration-150 ease-out ${
          entered ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <h2 id={titleId} className="text-base font-semibold text-gray-900">
          {title}
        </h2>
        {description && (
          <p id={descId} className="mt-2 text-sm text-gray-600">
            {description}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={danger ? dangerConfirmClass : btnPrimary}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
