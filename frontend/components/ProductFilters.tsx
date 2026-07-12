'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Category } from '@/lib/types';
import { Skeleton } from '@/components/Skeleton';

export type ProductSort = 'recommended' | 'newest' | 'price_asc' | 'price_desc' | 'rating';

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'recommended', label: 'おすすめ順' },
  { value: 'newest', label: '新着順' },
  { value: 'price_asc', label: '価格が安い順' },
  { value: 'price_desc', label: '価格が高い順' },
  { value: 'rating', label: '評価が高い順' },
];

export interface ProductFiltersValue {
  categoryId: number | null;
  sort: ProductSort | null;
  minPrice: string;
  maxPrice: string;
}

interface ProductFiltersProps {
  value: ProductFiltersValue;
  onChange: (value: ProductFiltersValue) => void;
}

const chipBase =
  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2';

export default function ProductFilters({ value, onChange }: ProductFiltersProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [minPriceInput, setMinPriceInput] = useState(value.minPrice);
  const [maxPriceInput, setMaxPriceInput] = useState(value.maxPrice);

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

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
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
        <label htmlFor="product-sort" className="text-sm text-gray-600 whitespace-nowrap">
          並び替え
        </label>
        <select
          id="product-sort"
          value={value.sort ?? 'newest'}
          onChange={(e) => onChange({ ...value, sort: e.target.value as ProductSort })}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 whitespace-nowrap">価格帯</span>
        <label htmlFor="min-price" className="sr-only">
          価格の下限
        </label>
        <input
          id="min-price"
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
        <label htmlFor="max-price" className="sr-only">
          価格の上限
        </label>
        <input
          id="max-price"
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
    </div>
  );
}
