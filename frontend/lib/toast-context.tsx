'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import Link from 'next/link';
import { CheckCircleIcon, InfoIcon, AlertCircleIcon, CloseIcon } from '@/components/Icons';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  href: string;
}

export interface ToastOptions {
  type?: ToastType;
  action?: ToastAction;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (message: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/** 同時表示の上限。超えた分は古いものから消す。 */
const MAX_TOASTS = 4;
/** 自動消滅までの時間（ミリ秒）。 */
const AUTO_DISMISS_MS = 4000;
/** 退出トランジションの時間（ミリ秒）。 */
const EXIT_MS = 200;

const TYPE_META: Record<
  ToastType,
  { border: string; icon: (props: { className?: string }) => JSX.Element; iconColor: string }
> = {
  success: { border: 'border-l-brand-600', icon: CheckCircleIcon, iconColor: 'text-brand-600' },
  error: { border: 'border-l-critical-600', icon: AlertCircleIcon, iconColor: 'text-critical-600' },
  info: { border: 'border-l-line-strong', icon: InfoIcon, iconColor: 'text-ink-muted' },
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const meta = TYPE_META[toast.type];
  const Icon = meta.icon;

  // マウント直後に入場アニメーションを開始する。
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // leaving を立てるだけでよい（実体の除去は下の退出用エフェクトが担う）。
  const handleClose = useCallback(() => setLeaving(true), []);

  // 自動消滅タイマー。ホバー中（paused）は動かさない。
  useEffect(() => {
    if (paused || leaving) return;
    const t = window.setTimeout(() => setLeaving(true), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [paused, leaving]);

  // 退出状態になったら、トランジション後に実体を取り除く。
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => onRemove(toast.id), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [leaving, onRemove, toast.id]);

  const shown = visible && !leaving;

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // 出は entrance でゆっくり置かれ、消えは exit で速く引かれる（＝非対称）。
      // reduced-motion では globals.css §5 が transition-duration を 0.01ms に潰す。
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border-l-4 ${meta.border} bg-surface px-4 py-3 shadow-float transition-all ${
        shown
          ? 'translate-y-0 scale-100 opacity-100 duration-base ease-entrance'
          : 'translate-y-2 scale-[0.98] opacity-0 duration-fast ease-exit'
      }`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.iconColor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-body text-ink-soft">{toast.message}</p>
        {toast.action && (
          <Link
            href={toast.action.href}
            onClick={handleClose}
            className="mt-1.5 inline-block text-body font-medium text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 rounded"
          >
            {toast.action.label}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={handleClose}
        aria-label="通知を閉じる"
        className="hit -mr-1 -mt-1 shrink-0 rounded p-1 text-ink-faint hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, opts?: ToastOptions) => {
    const toast: Toast = {
      id: nextId.current++,
      message,
      type: opts?.type ?? 'info',
      action: opts?.action,
    };
    // 上限を超える場合は古いものから捨てる。
    setToasts((prev) => [...prev, toast].slice(-MAX_TOASTS));
  }, []);

  // トーストは1件出入りするたびに provider が再レンダーする。value を固定しないと、
  // その都度 useToast() の消費者（一覧なら WishlistButton 12個）が巻き添えで再描画される。
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:left-auto sm:right-6 sm:w-auto sm:translate-x-0"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
