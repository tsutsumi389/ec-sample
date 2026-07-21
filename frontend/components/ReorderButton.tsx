'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { ReorderItem, ReorderResult } from '@/lib/types';
import { useCart } from '@/lib/cart-context';
import { useToast } from '@/lib/toast-context';
import { btnPrimary, btnSecondary } from '@/lib/buttonStyles';
import Spinner from '@/components/Spinner';

interface ReorderButtonProps {
  orderId: number;
  /** primary: 単独設置用の brand 塗り / compact: 一覧カード内用の小さめボーダー */
  variant?: 'primary' | 'compact';
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2';

const primaryClass = `${btnPrimary} inline-flex items-center gap-2 ${focusRing}`;

const compactClass =
  `inline-flex items-center gap-2 rounded-md border border-brand-300 text-brand-700 px-3 py-1.5 text-sm font-medium hover:bg-brand-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;

/** 部分成功時の内訳リスト。 */
function ResultList({ title, items }: { title: string; items: ReorderItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {/* 同じ商品の明細が複数ある注文では product_id が重複しうるので index を添える */}
        {items.map((item, index) => (
          <li key={`${item.product_id}-${index}`} className="text-sm text-gray-700">
            <span className="font-medium">{item.product_name}</span>
            {item.quantity > 0 && <span className="ml-1 text-gray-500">× {item.quantity}</span>}
            {item.reason && <p className="mt-0.5 text-xs text-gray-500">{item.reason}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 再注文の結果ダイアログ。Esc・オーバーレイクリックで閉じ、
 * 開いたら「カートを見る」にフォーカス、Tab は内部で循環（ConfirmDialog と同等）。
 */
function ReorderResultDialog({
  result,
  onViewCart,
  onClose,
}: {
  result: ReorderResult;
  onViewCart: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [entered, setEntered] = useState(false);

  // 呼び出し側からインラインアロー関数が渡るため、effect の再実行を防ぐ目的で ref に退避する。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => setEntered(true));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
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
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 transition-opacity duration-150 ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={(e) => {
        // 注文カードの Link 内に置かれても遷移させない
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm max-h-[80vh] overflow-y-auto bg-white rounded-lg shadow-xl p-6 transition-all duration-150 ease-out ${
          entered ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <h2 id={titleId} className="text-base font-semibold text-gray-900">
          再注文の結果
        </h2>
        <ResultList title="カートに追加した商品" items={result.added} />
        <ResultList title="追加できなかった商品" items={result.skipped} />
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose}>
            閉じる
          </button>
          <button type="button" className={btnPrimary} onClick={onViewCart} autoFocus>
            カートを見る
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 過去の注文と同じ商品をカートに追加する「もう一度買う」ボタン。
 * カートは加算されるため、一部だけ追加できた場合は内訳をダイアログで示す。
 * Link 内（注文カード）に置かれても親への遷移を止める。
 */
export default function ReorderButton({ orderId, variant = 'primary' }: ReorderButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { refresh } = useCart();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ReorderResult | null>(null);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    setPending(true);
    try {
      const res = await api.post<ReorderResult>(`/orders/${orderId}/reorder`);
      await refresh();

      const hasPartial = res.added.some((item) => item.reason !== null);
      if (res.added.length === 0) {
        showToast('カートに追加できる商品がありませんでした', { type: 'error' });
      } else if (res.skipped.length === 0 && !hasPartial) {
        showToast(`${res.added.length}点をカートに追加しました`, {
          type: 'success',
          action: { label: 'カートを見る', href: '/cart' },
        });
      } else {
        setResult(res);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '再注文に失敗しました', { type: 'error' });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={variant === 'compact' ? compactClass : primaryClass}
      >
        {pending && <Spinner />}
        {pending ? '追加中...' : 'もう一度買う'}
      </button>

      {result && (
        <ReorderResultDialog
          result={result}
          onViewCart={() => {
            setResult(null);
            router.push('/cart');
          }}
          onClose={() => setResult(null)}
        />
      )}
    </>
  );
}
