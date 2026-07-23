'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Experiment, ExperimentStatus, ExperimentVariantInput } from '@/lib/types';
import { EXPERIMENT_STATUS_META } from '@/lib/experimentStatus';
import ScrollableTable from '@/components/ScrollableTable';
import Spinner from '@/components/Spinner';
import Badge from '@/components/Badge';
import { PlusIcon, TrashIcon } from '@/components/Icons';
import { btnPrimary, btnSecondary } from '@/lib/buttonStyles';

/** 新規作成時の初期値。対照群を必ず 1 つ含んだ 2 枝から始める。 */
const emptyVariants: ExperimentVariantInput[] = [
  { key: 'control', name: '現行', weight: 50, is_control: true, config: null },
  { key: 'treatment', name: '変更案', weight: 50, is_control: false, config: null },
];

/** 指標の候補。ここに無いイベント名も入力できる（自由記述のため）。 */
const METRIC_SUGGESTIONS = ['purchase', 'add_to_cart', 'begin_checkout', 'click', 'impression'];

interface FormValues {
  key: string;
  name: string;
  description: string;
  traffic_allocation: number;
  primary_metric: string;
  variants: ExperimentVariantInput[];
  /** 枝ごとの config を JSON 文字列で編集する（保存時にパースする）。 */
  configTexts: string[];
}

const emptyForm: FormValues = {
  key: '',
  name: '',
  description: '',
  traffic_allocation: 100,
  primary_metric: 'purchase',
  variants: emptyVariants,
  configTexts: ['', ''],
};

function ExperimentFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateVariant = (index: number, partial: Partial<ExperimentVariantInput>) => {
    setValues((prev) => ({
      ...prev,
      variants: prev.variants.map((variant, i) =>
        i === index ? { ...variant, ...partial } : variant
      ),
    }));
  };

  const setControl = (index: number) => {
    setValues((prev) => ({
      ...prev,
      // 対照群は実験内でちょうど 1 つ。選び直したら他は外す。
      variants: prev.variants.map((variant, i) => ({ ...variant, is_control: i === index })),
    }));
  };

  const addVariant = () => {
    setValues((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        {
          key: `variant_${prev.variants.length}`,
          name: `変更案${prev.variants.length}`,
          weight: 50,
          is_control: false,
          config: null,
        },
      ],
      configTexts: [...prev.configTexts, ''],
    }));
  };

  const removeVariant = (index: number) => {
    setValues((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
      configTexts: prev.configTexts.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    // config は自由記述の JSON。保存前にここで検証し、壊れた設定を配信させない。
    const parsedConfigs: (Record<string, unknown> | null)[] = [];
    for (let i = 0; i < values.variants.length; i += 1) {
      const text = values.configTexts[i]?.trim() ?? '';
      if (!text) {
        parsedConfigs.push(null);
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('object required');
        }
        parsedConfigs.push(parsed as Record<string, unknown>);
      } catch {
        setError(`${values.variants[i].key} の設定値が JSON として解釈できません`);
        return;
      }
    }

    if (values.variants.filter((v) => v.is_control).length !== 1) {
      setError('対照群をちょうど1つ選んでください');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/admin/experiments', {
        key: values.key.trim(),
        name: values.name.trim(),
        description: values.description.trim() || null,
        traffic_allocation: values.traffic_allocation,
        primary_metric: values.primary_metric.trim(),
        variants: values.variants.map((variant, i) => ({
          ...variant,
          config: parsedConfigs[i],
        })),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '実験の作成に失敗しました');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="experiment-form-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 id="experiment-form-title" className="text-lg font-bold mb-4">
          実験の新規作成
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="key" className="block text-sm font-medium text-gray-700 mb-2">
                実験キー
                <span className="ml-1 text-xs font-normal text-gray-600">
                  （コードから参照。後から変更しない）
                </span>
              </label>
              <input
                id="key"
                type="text"
                required
                value={values.key}
                onChange={(e) => setValues({ ...values, key: e.target.value })}
                placeholder="pdp_section_order"
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                実験名
              </label>
              <input
                id="name"
                type="text"
                required
                value={values.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              仮説
              <span className="ml-1 text-xs font-normal text-gray-600">
                （何がどうなると考えたか。結果を読むときの前提になる）
              </span>
            </label>
            <textarea
              id="description"
              rows={2}
              value={values.description}
              onChange={(e) => setValues({ ...values, description: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="traffic_allocation"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                対象にする訪問者の割合（%）
              </label>
              <input
                id="traffic_allocation"
                type="number"
                min={1}
                max={100}
                required
                value={values.traffic_allocation}
                onChange={(e) =>
                  setValues({ ...values, traffic_allocation: Number(e.target.value) })
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="primary_metric"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                主要指標（イベント名）
              </label>
              <input
                id="primary_metric"
                type="text"
                required
                list="metric-suggestions"
                value={values.primary_metric}
                onChange={(e) => setValues({ ...values, primary_metric: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm"
              />
              <datalist id="metric-suggestions">
                {METRIC_SUGGESTIONS.map((metric) => (
                  <option key={metric} value={metric} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-gray-700">枝（variant）</span>
              <button type="button" onClick={addVariant} className="text-sm text-brand-600 hover:underline">
                枝を追加
              </button>
            </div>
            <div className="space-y-3">
              {values.variants.map((variant, index) => (
                <div key={index} className="border border-gray-200 rounded-md p-3 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      required
                      aria-label={`枝${index + 1}のキー`}
                      value={variant.key}
                      onChange={(e) => updateVariant(index, { key: e.target.value })}
                      placeholder="キー"
                      className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                    />
                    <input
                      type="text"
                      required
                      aria-label={`枝${index + 1}の表示名`}
                      value={variant.name}
                      onChange={(e) => updateVariant(index, { name: e.target.value })}
                      placeholder="表示名"
                      className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      required
                      aria-label={`枝${index + 1}の配分`}
                      value={variant.weight}
                      onChange={(e) => updateVariant(index, { weight: Number(e.target.value) })}
                      placeholder="配分"
                      className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-sm text-gray-700">
                        <input
                          type="radio"
                          name="control"
                          checked={variant.is_control}
                          onChange={() => setControl(index)}
                        />
                        対照群
                      </label>
                      {values.variants.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeVariant(index)}
                          aria-label={`枝${index + 1}を削除`}
                          className="text-gray-500 hover:text-red-600"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    aria-label={`枝${index + 1}の設定値`}
                    value={values.configTexts[index] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        configTexts: prev.configTexts.map((text, i) =>
                          i === index ? e.target.value : text
                        ),
                      }))
                    }
                    placeholder='設定値（JSON・任意）例: {"label": "いますぐ買う"}'
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-mono"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-600">
              設定値はフロントの useVariant() がそのまま読みます。分岐をコードに書かず設定で
              切り替えられるようにしておくと、枝を増やしても実装を変えずに済みます。
            </p>
          </div>

          {error && (
            <p role="alert" className="text-red-600 text-sm">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>
              キャンセル
            </button>
            <button type="submit" disabled={submitting} className={btnPrimary}>
              {submitting ? '作成中...' : '下書きとして作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<Experiment[]>('/admin/experiments')
      .then(setExperiments)
      .catch(() => setError('実験の取得に失敗しました'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const changeStatus = async (experiment: Experiment, next: ExperimentStatus) => {
    setError('');
    try {
      await api.put(`/admin/experiments/${experiment.id}`, { status: next });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '状態の変更に失敗しました');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">A/Bテスト</h1>
        <button type="button" onClick={() => setFormOpen(true)} className={`${btnPrimary} inline-flex items-center gap-1.5`}>
          <PlusIcon className="w-4 h-4" />
          新規作成
        </button>
      </div>

      {error && (
        <p role="alert" className="text-red-600 mb-4">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-gray-600 flex items-center">
          <Spinner className="mr-2" />
          読み込み中...
        </p>
      ) : experiments.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-600">実験がありません。「新規作成」から追加してください。</p>
        </div>
      ) : (
        <ScrollableTable>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">実験</th>
                <th className="px-4 py-3 font-medium">状態</th>
                <th className="px-4 py-3 font-medium">枝</th>
                <th className="px-4 py-3 font-medium">対象</th>
                <th className="px-4 py-3 font-medium">主要指標</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {experiments.map((experiment) => {
                const meta = EXPERIMENT_STATUS_META[experiment.status];
                return (
                  <tr key={experiment.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/experiments/${experiment.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {experiment.name}
                      </Link>
                      <p className="text-xs text-gray-500 font-mono">{experiment.key}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {experiment.variants.map((v) => `${v.key}:${v.weight}`).join(' / ')}
                    </td>
                    <td className="px-4 py-3 text-gray-700 tabular-nums">
                      {experiment.traffic_allocation}%
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {experiment.primary_metric}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {meta.actions.map((action) => (
                          <button
                            key={action.next}
                            type="button"
                            onClick={() => changeStatus(experiment, action.next)}
                            className="text-sm text-brand-600 hover:underline"
                          >
                            {action.label}
                          </button>
                        ))}
                        <Link
                          href={`/admin/experiments/${experiment.id}`}
                          className="text-sm text-gray-700 hover:underline"
                        >
                          結果
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollableTable>
      )}

      {formOpen && (
        <ExperimentFormModal
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
