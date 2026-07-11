'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  error: { border: 'border-l-red-500', icon: AlertCircleIcon, iconColor: 'text-red-500' },
  info: { border: 'border-l-gray-400', icon: InfoIcon, iconColor: 'text-gray-500' },
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
      className={`pointer-events-auto flex items-start gap-3 rounded-md border border-gray-200 border-l-4 ${meta.border} bg-white px-4 py-3 shadow-lg transition-all duration-200 ease-out ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.iconColor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-800">{toast.message}</p>
        {toast.action && (
          <Link
            href={toast.action.href}
            onClick={handleClose}
            className="mt-1.5 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded"
          >
            {toast.action.label}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={handleClose}
        aria-label="通知を閉じる"
        className="-mr-1 -mt-1 shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
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

  return (
    <ToastContext.Provider value={{ showToast }}>
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
