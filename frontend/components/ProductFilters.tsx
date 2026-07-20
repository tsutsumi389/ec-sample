'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Category } from '@/lib/types';
import { Skeleton } from '@/components/Skeleton';
import { CloseIcon, MenuIcon } from '@/components/Icons';
import { btnPrimary, iconButton } from '@/lib/buttonStyles';

export type ProductSort = 'recommended' | 'newest' | 'price_asc' | 'price_desc' | 'rating';

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'recommended', label: 'おすすめ順' },
  { value: 'newest', label: '新着順' },
  { value: 'price_asc', label: '価格が安い順' },
  { value: 'price_desc', label: '価格が高い順' },
  { value: 'rating', label: '評価が高い順' },
];

// 「関連度順」は select 内だけで使う擬似値。バックエンドに sort=relevance は存在しないため、
// この値が選ばれたら sort: null（URL から sort を消す）にマップし、URL には流さない。
const RELEVANCE_VALUE = '__relevance__';

export interface ProductFiltersValue {
  categoryId: number | null;
  sort: ProductSort | null;
  minPrice: string;
  maxPrice: string;
}

interface ProductFiltersProps {
  value: ProductFiltersValue;
  onChange: (value: ProductFiltersValue) => void;
  /** 検索中（?search=...）か。検索中は既定の並び順が「関連度順」になるため表示を切り替える。 */
  searching: boolean;
}

const chipBase =
  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2';

interface FilterBodyProps {
  value: ProductFiltersValue;
  onChange: (value: ProductFiltersValue) => void;
  searching: boolean;
  categories: Category[];
  loadingCategories: boolean;
  minPriceInput: string;
  maxPriceInput: string;
  setMinPriceInput: (v: string) => void;
  setMaxPriceInput: (v: string) => void;
  applyPriceRange: () => void;
  handlePriceKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * フィルタUIの中身（カテゴリチップ・並び替え・価格帯）。
 * PC 版のインライン表示とモバイルのドロワーで同じものを使い回すため、レイアウトの器は持たず
 * 3つのグループを並べるだけにしている（器は呼び出し側が用意する）。
 * 同時に2箇所へ描画されても id が衝突しないよう、input/select の id は useId で払い出す。
 */
function FilterBody({
  value,
  onChange,
  searching,
  categories,
  loadingCategories,
  minPriceInput,
  maxPriceInput,
  setMinPriceInput,
  setMaxPriceInput,
  applyPriceRange,
  handlePriceKeyDown,
}: FilterBodyProps) {
  const sortId = useId();
  const minPriceId = useId();
  const maxPriceId = useId();

  // 検索中だけ「関連度順」を先頭に出す。sort 未指定（null）のときの表示は、
  // 検索中なら「関連度順」、非検索時は従来どおり「新着順」。
  const sortOptions = searching
    ? [{ value: RELEVANCE_VALUE, label: '関連度順' }, ...SORT_OPTIONS]
    : SORT_OPTIONS;
  const selectValue = searching ? value.sort ?? RELEVANCE_VALUE : value.sort ?? 'newest';

  const handleSortChange = (raw: string) => {
    const nextSort = raw === RELEVANCE_VALUE ? null : (raw as ProductSort);
    onChange({ ...value, sort: nextSort });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {loadingCategories ? (
          <>
            <Skeleton className="h-[34px] w-16 rounded-full" />
            <Skeleton className="h-[34px] w-20 rounded-full" />
            <Skeleton className="h-[34px] w-24 rounded-full" />
            <Skeleton className="h-[34px] w-16 rounded-full" />
            <Skeleton className="h-[34px] w-20 rounded-full" />
          </>
        ) : (
          <>
            <button
              type="button"
              aria-pressed={value.categoryId === null}
              onClick={() => onChange({ ...value, categoryId: null })}
              className={`${chipBase} ${
                value.categoryId === null
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              すべて
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={value.categoryId === category.id}
                onClick={() => onChange({ ...value, categoryId: category.id })}
                className={`${chipBase} ${
                  value.categoryId === category.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category.name}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={sortId} className="text-sm text-gray-600 whitespace-nowrap">
          並び替え
        </label>
        <select
          id={sortId}
          value={selectValue}
          onChange={(e) => handleSortChange(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 whitespace-nowrap">価格帯</span>
        <label htmlFor={minPriceId} className="sr-only">
          価格の下限
        </label>
        <input
          id={minPriceId}
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="下限"
          value={minPriceInput}
          onChange={(e) => setMinPriceInput(e.target.value)}
          onKeyDown={handlePriceKeyDown}
          className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <span className="text-gray-400" aria-hidden="true">
          〜
        </span>
        <label htmlFor={maxPriceId} className="sr-only">
          価格の上限
        </label>
        <input
          id={maxPriceId}
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="上限"
          value={maxPriceInput}
          onChange={(e) => setMaxPriceInput(e.target.value)}
          onKeyDown={handlePriceKeyDown}
          className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={applyPriceRange}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          適用
        </button>
      </div>
    </>
  );
}

/**
 * モバイル用のボトムシート。下から迫り上がるドロワーでフィルタ本体を表示する。
 * ConfirmDialog と同じ作法: Esc・背景タップで閉じ、開いている間は背景スクロールを固定、
 * role="dialog" aria-modal + 簡易フォーカストラップ、閉じたらトリガーへフォーカスを戻す。
 */
function FilterDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [entered, setEntered] = useState(false);

  // onClose は毎レンダー参照が変わり得るため ref に退避し、effect の依存から外す。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 開く直前のフォーカス要素を保持し、閉じたら戻す。
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }

    triggerRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const raf = requestAnimationFrame(() => setEntered(true));

    // 背景スクロール固定
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
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
      document.body.style.overflow = prevOverflow;
      triggerRef.current?.focus();
      triggerRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/40 transition-opacity duration-200 sm:hidden ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl transition-transform duration-200 ease-out ${
          entered ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold text-gray-900">
            絞り込み・並び替え
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className={iconButton}
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-4">{children}</div>
        <div className="mt-6">
          <button type="button" onClick={onClose} className={`${btnPrimary} w-full`}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductFilters({ value, onChange, searching }: ProductFiltersProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [minPriceInput, setMinPriceInput] = useState(value.minPrice);
  const [maxPriceInput, setMaxPriceInput] = useState(value.maxPrice);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Category[]>('/categories')
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch((e) => {
        if (!(e instanceof ApiError)) throw e;
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMinPriceInput(value.minPrice);
    setMaxPriceInput(value.maxPrice);
  }, [value.minPrice, value.maxPrice]);

  const applyPriceRange = () => {
    let min = minPriceInput;
    let max = maxPriceInput;
    // 両方入力されていて下限 > 上限のときは自動で入れ替える。
    if (min !== '' && max !== '' && Number(min) > Number(max)) {
      [min, max] = [max, min];
      setMinPriceInput(min);
      setMaxPriceInput(max);
    }
    if (min === value.minPrice && max === value.maxPrice) return;
    onChange({ ...value, minPrice: min, maxPrice: max });
  };

  const handlePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyPriceRange();
    }
  };

  // 適用中フィルタ数（バッジ用）。search は含めない。並び順は「既定からの逸脱」を1件と数える。
  // 既定は検索中なら関連度順（sort=null）、非検索時なら新着順。
  const sortActive = searching
    ? value.sort !== null
    : Boolean(value.sort && value.sort !== 'newest');
  const activeCount =
    (value.categoryId !== null ? 1 : 0) +
    (value.minPrice || value.maxPrice ? 1 : 0) +
    (sortActive ? 1 : 0);

  const bodyProps: FilterBodyProps = {
    value,
    onChange,
    searching,
    categories,
    loadingCategories,
    minPriceInput,
    maxPriceInput,
    setMinPriceInput,
    setMaxPriceInput,
    applyPriceRange,
    handlePriceKeyDown,
  };

  return (
    <>
      {/* モバイル（sm 未満）: フィルタ本体は畳み、トリガーボタン + ドロワーで出す */}
      <div className="mb-6 sm:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          <MenuIcon className="h-5 w-5" />
          絞り込み・並び替え
          {activeCount > 0 && (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* PC（sm 以上）: 従来どおりインラインで横並び表示 */}
      <div className="mb-6 hidden rounded-lg border border-gray-200 bg-white p-4 sm:flex sm:flex-wrap sm:items-end sm:gap-6">
        <FilterBody {...bodyProps} />
      </div>

      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <FilterBody {...bodyProps} />
      </FilterDrawer>
    </>
  );
}
