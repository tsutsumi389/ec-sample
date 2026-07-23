'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ExperimentResult } from '@/lib/types';
import {
  EXPERIMENT_STATUS_META,
  formatPValue,
  formatPercent,
  formatSignedPercent,
} from '@/lib/experimentStatus';
import ScrollableTable from '@/components/ScrollableTable';
import Spinner from '@/components/Spinner';
import Badge from '@/components/Badge';
import { ArrowLeftIcon } from '@/components/Icons';

/** ファネル各段の日本語ラベル。未知のイベント名はそのまま出す。 */
const FUNNEL_LABELS: Record<string, string> = {
  page_view: 'ページ閲覧',
  impression: 'セクション表示',
  click: 'クリック',
  add_to_cart: 'カート投入',
  begin_checkout: '注文手続き開始',
  purchase: '購入',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ja-JP');
}

export default function AdminExperimentResultPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [metric, setMetric] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    (targetMetric: string) => {
      if (!id) return;
      setLoading(true);
      const query = targetMetric ? `?metric=${encodeURIComponent(targetMetric)}` : '';
      api
        .get<ExperimentResult>(`/admin/experiments/${id}/results${query}`)
        .then((data) => {
          setResult(data);
          setMetric(data.metric);
        })
        .catch(() => setError('結果の取得に失敗しました'))
        .finally(() => setLoading(false));
    },
    [id]
  );

  useEffect(() => {
    load('');
  }, [load]);

  useEffect(() => {
    api
      .get<string[]>('/admin/experiments/event-names')
      .then(setEventNames)
      .catch(() => setEventNames([]));
  }, []);

  if (loading && !result) {
    return (
      <p className="text-gray-600 flex items-center">
        <Spinner className="mr-2" />
        読み込み中...
      </p>
    );
  }

  if (error || !result) {
    return (
      <div>
        <p role="alert" className="text-red-600">
          {error || '実験が見つかりませんでした。'}
        </p>
        <Link href="/admin/experiments" className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline">
          <ArrowLeftIcon className="w-4 h-4" />
          実験一覧に戻る
        </Link>
      </div>
    );
  }

  const { experiment, srm } = result;
  const statusMeta = EXPERIMENT_STATUS_META[experiment.status];
  // 指標の候補。記録済みのイベント名に、この実験の主要指標を必ず含める。
  const metricOptions = Array.from(new Set([experiment.primary_metric, ...eventNames]));

  return (
    <div>
      <Link
        href="/admin/experiments"
        className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        実験一覧に戻る
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{experiment.name}</h1>
          <p className="mt-1 text-xs font-mono text-gray-500">{experiment.key}</p>
        </div>
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      </div>

      {experiment.description && (
        <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{experiment.description}</p>
      )}

      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <dt className="text-gray-600">開始</dt>
          <dd className="mt-0.5 text-gray-900">{formatDate(experiment.started_at)}</dd>
        </div>
        <div>
          <dt className="text-gray-600">終了</dt>
          <dd className="mt-0.5 text-gray-900">{formatDate(experiment.ended_at)}</dd>
        </div>
        <div>
          <dt className="text-gray-600">対象</dt>
          <dd className="mt-0.5 text-gray-900 tabular-nums">{experiment.traffic_allocation}%</dd>
        </div>
        <div>
          <dt className="text-gray-600">総曝露数</dt>
          <dd className="mt-0.5 text-gray-900 tabular-nums">
            {result.total_exposures.toLocaleString()}
          </dd>
        </div>
      </dl>

      {/* SRM 警告。CVR の差を読む前に必ず確認させたいので結果表より上に置く。 */}
      {srm.is_mismatch && (
        <div role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">
            サンプル比率が設計と一致していません（p = {formatPValue(srm.p_value)}）
          </p>
          <p className="mt-1 text-sm text-red-700">
            割り当てか計測に不具合がある可能性が高い状態です。この結果は信用せず、原因を
            特定してから実験をやり直してください。
          </p>
          <p className="mt-2 text-xs text-red-700 tabular-nums">
            実測:{' '}
            {Object.entries(srm.observed)
              .map(([key, count]) => `${key} ${count}`)
              .join(' / ')}
            {' ｜ 設計比: '}
            {Object.entries(srm.expected)
              .map(([key, ratio]) => `${key} ${formatPercent(ratio, 0)}`)
              .join(' / ')}
          </p>
        </div>
      )}

      <div className="mt-6 flex items-end gap-3 flex-wrap">
        <div>
          <label htmlFor="metric" className="block text-sm font-medium text-gray-700 mb-2">
            集計する指標
          </label>
          <select
            id="metric"
            value={metric}
            onChange={(e) => load(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2.5 text-sm bg-white"
          >
            {metricOptions.map((name) => (
              <option key={name} value={name}>
                {FUNNEL_LABELS[name] ? `${FUNNEL_LABELS[name]}（${name}）` : name}
              </option>
            ))}
          </select>
        </div>
        {loading && (
          <p className="text-sm text-gray-600 flex items-center pb-2">
            <Spinner className="mr-2" />
            集計中...
          </p>
        )}
      </div>

      <h2 className="mt-6 mb-3 text-lg font-bold">枝ごとの成果</h2>
      <ScrollableTable>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">枝</th>
              <th className="px-4 py-3 font-medium text-right">曝露</th>
              <th className="px-4 py-3 font-medium text-right">成果</th>
              <th className="px-4 py-3 font-medium text-right">達成率</th>
              <th className="px-4 py-3 font-medium text-right">リフト（95%信頼区間）</th>
              <th className="px-4 py-3 font-medium text-right">p値</th>
              <th className="px-4 py-3 font-medium text-right">指標値の合計</th>
              <th className="px-4 py-3 font-medium text-right">1人あたり</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {result.variants.map((variant) => (
              <tr key={variant.variant_key}>
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900">{variant.name}</span>
                  {variant.is_control && (
                    <Badge variant="neutral" className="ml-2">
                      対照群
                    </Badge>
                  )}
                  <p className="text-xs text-gray-500 font-mono">{variant.variant_key}</p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {variant.exposures.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {variant.conversions.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatPercent(variant.conversion_rate)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {variant.is_control ? (
                    <span className="text-gray-500">基準</span>
                  ) : (
                    <>
                      <span
                        className={
                          variant.is_significant
                            ? (variant.lift ?? 0) > 0
                              ? 'font-semibold text-green-700'
                              : 'font-semibold text-red-700'
                            : 'text-gray-900'
                        }
                      >
                        {formatSignedPercent(variant.lift)}
                      </span>
                      {variant.lift_ci_low !== null && variant.lift_ci_high !== null && (
                        <span className="block text-xs text-gray-500">
                          {formatSignedPercent(variant.lift_ci_low)} 〜{' '}
                          {formatSignedPercent(variant.lift_ci_high)}
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {variant.is_control ? '—' : formatPValue(variant.p_value)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {Math.round(variant.value_sum).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {variant.value_per_user.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollableTable>

      <p className="mt-3 text-xs text-gray-600 leading-relaxed">
        p値が 0.05 を下回っても、それは「偶然ではなさそう」を意味するだけで、採用の可否を
        決めるものではありません。とくに毎日結果を覗いて「有意になった時点で止める」と、
        本当は差が無い変更でも高い確率で有意に見えてしまいます。開始前に必要な曝露数と
        期間を決め、そこまで回してから読んでください。
      </p>

      <h2 className="mt-8 mb-3 text-lg font-bold">ファネル</h2>
      <ScrollableTable>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">段階</th>
              {result.variants.map((variant) => (
                <th key={variant.variant_key} className="px-4 py-3 font-medium text-right">
                  {variant.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {result.funnel.map((step) => (
              <tr key={step.name}>
                <td className="px-4 py-3">
                  <span className="text-gray-900">{FUNNEL_LABELS[step.name] ?? step.name}</span>
                  <p className="text-xs text-gray-500 font-mono">{step.name}</p>
                </td>
                {result.variants.map((variant) => {
                  const count = step.counts[variant.variant_key] ?? 0;
                  const rate = variant.exposures > 0 ? count / variant.exposures : 0;
                  return (
                    <td key={variant.variant_key} className="px-4 py-3 text-right tabular-nums">
                      {count.toLocaleString()}
                      <span className="block text-xs text-gray-500">{formatPercent(rate, 1)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollableTable>
      <p className="mt-3 text-xs text-gray-600">
        各段は曝露した訪問者のうち、その行動を 1 回以上とった人数です（曝露より後に起きた
        イベントだけを数えています）。
      </p>
    </div>
  );
}
