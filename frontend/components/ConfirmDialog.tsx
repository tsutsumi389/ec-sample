'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { btn, btnPrimary, btnSecondary } from '@/lib/buttonStyles';
import { useFocusTrap } from '@/lib/focusTrap';

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

/** 破壊的操作の確定ボタン。キャンセルボタン（btnSecondary）と高さを揃えるため btn() から作る。 */
const dangerConfirmClass = btn('danger', 'md');

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

  // Escape・Tab の循環・トリガーへのフォーカス復帰は共有フックが持つ。
  // 開いた瞬間（false→true 遷移時）だけ確認ボタンへフォーカスするのも initialFocus に委ねる。
  useFocusTrap(dialogRef, {
    active: open,
    onEscape: onCancel,
    initialFocus: confirmButtonRef,
    restoreFocus: true,
  });

  // 出現時のトランジション。次フレームで entered を立てる。
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-invert/50 transition-opacity duration-base ease-standard ${
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
        className={`w-full max-w-sm rounded-2xl bg-surface p-6 shadow-float transition-all duration-base ease-standard ${
          entered ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <h2 id={titleId} className="font-mincho text-h3 text-ink jp-head">
          {title}
        </h2>
        {description && (
          <p id={descId} className="mt-2 text-body text-ink-muted">
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
