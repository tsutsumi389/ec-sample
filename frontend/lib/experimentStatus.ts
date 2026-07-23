import type { BadgeVariant } from '@/components/Badge';
import type { ExperimentStatus } from '@/lib/types';

interface StatusMeta {
  label: string;
  variant: BadgeVariant;
  /** 管理画面でこの状態から進める操作（ボタンのラベルと遷移先）。 */
  actions: { label: string; next: ExperimentStatus }[];
}

/**
 * status を単一の源として、実験の表示ラベル・色・可能な操作をここに集約する。
 * 遷移の可否はバックエンド（admin_experiments.ALLOWED_TRANSITIONS）と一致させること。
 * completed から戻せないのは、中断期間を挟むと外部要因の異なるデータが混ざって
 * 結果を解釈できなくなるため。
 */
export const EXPERIMENT_STATUS_META: Record<ExperimentStatus, StatusMeta> = {
  draft: {
    label: '下書き',
    variant: 'neutral',
    actions: [{ label: '開始する', next: 'running' }],
  },
  running: {
    label: '実施中',
    variant: 'success',
    actions: [
      { label: '一時停止', next: 'paused' },
      { label: '終了する', next: 'completed' },
    ],
  },
  paused: {
    label: '一時停止',
    variant: 'warning',
    actions: [
      { label: '再開する', next: 'running' },
      { label: '終了する', next: 'completed' },
    ],
  },
  completed: { label: '終了', variant: 'info', actions: [] },
};

/** 0.0123 → "1.23%" のように、率を読みやすい百分率にする。 */
export function formatPercent(ratio: number, digits = 2): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** リフトなど、既に百分率の値を符号付きで表示する。 */
export function formatSignedPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

/** p 値の表示。極端に小さい値は指数表記を避けて "< 0.001" にする。 */
export function formatPValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value < 0.001) return '< 0.001';
  return value.toFixed(3);
}
