'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Category } from '@/lib/types';

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'rating';

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
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

export default function ProductFilters({ value, onChange }: ProductFiltersProps) {
  const [categories, setCategories] = useState<Category[]>([]);
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
    if (minPriceInput === value.minPrice && maxPriceInput === value.maxPrice) return;
    onChange({ ...value, minPrice: minPriceInput, maxPrice: maxPriceInput });
  };

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, categoryId: null })}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
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
            onClick={() => onChange({ ...value, categoryId: category.id })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
              value.categoryId === category.id
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {category.name}
          </button>
        ))}
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
        <label className="text-sm text-gray-600 whitespace-nowrap">価格帯</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="下限"
          value={minPriceInput}
          onChange={(e) => setMinPriceInput(e.target.value)}
          onBlur={applyPriceRange}
          className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <span className="text-gray-400">〜</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="上限"
          value={maxPriceInput}
          onChange={(e) => setMaxPriceInput(e.target.value)}
          onBlur={applyPriceRange}
          className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
    </div>
  );
}
