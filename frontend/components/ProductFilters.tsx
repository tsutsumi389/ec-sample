'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Category } from '@/lib/types';
import { Skeleton } from '@/components/Skeleton';
import { CloseIcon, MenuIcon } from '@/components/Icons';
import { btn, iconBtn } from '@/lib/buttonStyles';
import { SELECT_CHEVRON } from '@/lib/selectChevron';

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

// カテゴリチップ。高さ 44px のピルに揃え、select・input と同じ行の高さで並ぶようにする。
// whitespace-nowrap は必須: h-11 固定なので折り返すとピルの上下から文字がはみ出す。
const chipBase =
  'inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-body font-medium transition-[background-color,color] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2';

// 入力系（select / input）の共通造形。高さ 44px・生成り紙の面・入力用ボーダー。
// 角丸と左右 padding は呼び出し側で指定する（同一プロパティのユーティリティは
// 連結順ではなく生成順で勝敗が決まるため、ここで rounded-md を握らない）。
const fieldBase =
  'h-11 border border-line-input bg-surface text-body text-ink transition-[border-color,box-shadow] duration-fast ease-standard focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600';

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
      {/*
        カテゴリ: 帯の中で最も面積を取る。
        lg 未満（＝768px 帯）では basis-full で単独の1段目を占有し、並び替え・価格帯を
        2段目へ落とす。同じ行に押し込むとチップが min-content まで潰れてピルが崩壊する。
        lg 以上でだけ残り幅を受け取る1カラムに戻す。
      */}
      <div className="flex flex-wrap gap-2 sm:min-w-0 sm:basis-full lg:basis-0 lg:flex-1">
        {loadingCategories ? (
          <>
            <Skeleton className="h-11 w-16 rounded-full" />
            <Skeleton className="h-11 w-20 rounded-full" />
            <Skeleton className="h-11 w-24 rounded-full" />
            <Skeleton className="h-11 w-16 rounded-full" />
            <Skeleton className="h-11 w-20 rounded-full" />
          </>
        ) : (
          <>
            <button
              type="button"
              aria-pressed={value.categoryId === null}
              onClick={() => onChange({ ...value, categoryId: null })}
              className={`${chipBase} ${
                value.categoryId === null
                  ? 'bg-brand-600 text-white shadow-paper'
                  : 'bg-surface text-ink-soft hover:bg-brand-50 hover:text-brand-800'
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
                    ? 'bg-brand-600 text-white shadow-paper'
                    : 'bg-surface text-ink-soft hover:bg-brand-50 hover:text-brand-800'
                }`}
              >
                {category.name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* 並び替え: 縦罫で「カテゴリ」と別グループであることを示す（lg 以上のみ） */}
      <div className="flex items-center gap-2 lg:border-l lg:border-line lg:pl-6">
        <label htmlFor={sortId} className="whitespace-nowrap text-caption text-ink-muted">
          並び替え
        </label>
        <div className="relative">
          <select
            id={sortId}
            value={selectValue}
            onChange={(e) => handleSortChange(e.target.value)}
            // 角丸はツールバー1行の中で1種類に統一する（入力・適用ボタンと同じ rounded-md）。
            // ピルはカテゴリチップ＝選択肢だけが持つ形として残す。
            className={`${fieldBase} appearance-none rounded-md pl-3.5 pr-9`}
            style={{
              backgroundImage: `url("${SELECT_CHEVRON}")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.625rem center',
              backgroundSize: '1rem',
            }}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:border-l lg:border-line lg:pl-6">
        <span className="whitespace-nowrap text-caption text-ink-muted">価格帯</span>
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
          className={`${fieldBase} w-20 rounded-md px-3 tnum`}
        />
        <span className="text-ink-faint" aria-hidden="true">
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
          className={`${fieldBase} w-20 rounded-md px-3 tnum`}
        />
        {/* 入力欄と同じ行に並ぶ二次ボタンは btn('field')。secondary の罫は line-strong
            （対 surface 1.76:1）で、隣の input の line-input（3.65:1）より2段淡く、
            押せるボタンだけが無効化されて見えていた。罫の濃度を行の中で1つに揃える。
            （局所の `!border-line-input` 上書きは buttonStyles の 'field' に畳んだ） */}
        <button type="button" onClick={applyPriceRange} className={btn('field', 'md')}>
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
      className={`fixed inset-0 z-50 flex items-end justify-center bg-invert/50 backdrop-blur-[2px] transition-opacity duration-slow ease-standard sm:hidden ${
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
        className={`max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-float transition-transform duration-slow ease-entrance ${
          entered ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* ドロワーの掴み手 */}
        <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong" />
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="h-5 w-[2px] shrink-0 bg-brand-600" />
            <h2 id={titleId} className="font-mincho text-h3 text-ink">
              絞り込み・並び替え
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className={iconBtn('md')}
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-5">{children}</div>
        <div className="mt-6">
          <button type="button" onClick={onClose} className={`${btn('primary', 'lg')} w-full`}>
            この条件で見る
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
      {/*
        マストヘッド（bg-sunken）から続く「沈んだ面」の下端。深度は地の色差だけで表し、
        影・角丸は持たせない（§5-4 手段①）。PC ではヘッダー直下に貼り付いて、
        グリッドをスクロールしても条件が視野から消えないようにする。
      */}
      {/*
        マストヘッド（bg-sunken）から続く「沈んだ面」の下端。深度は地の色差だけで表し、
        影・角丸は持たせない（§5-4 手段①）。上端の罫はマストヘッドの border-b が担うので
        ここでは持たない（2本重なって 2px の太罫に見えるため）。
        追従は lg 以上だけにする。768px では帯が2段（チップ／操作）になり、
        ヘッダーと合わせて 170px 超が貼り付いてしまうため。
      */}
      {/* 下端の罫は line-strong。border-line は対 sunken 1.04:1 でほぼ見えず、
          沈んだ帯が本文の生成りに溶けて段差が読めなくなる。 */}
      <div className="z-20 border-b border-line-strong bg-sunken/95 backdrop-blur lg:sticky lg:top-[var(--header-h)]">
        <div className="wrap-wide">
          {/* モバイル（sm 未満）: フィルタ本体は畳み、トリガーボタン + ドロワーで出す */}
          <div className="py-3 sm:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={`${btn('secondary', 'md')} w-full`}
            >
              <MenuIcon className="h-5 w-5" />
              絞り込み・並び替え
              {activeCount > 0 && (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1.5 text-caption font-semibold leading-none tnum text-white">
                  {activeCount}
                </span>
              )}
            </button>
          </div>

          {/* PC（sm 以上）: インラインで横並び表示。
              items-start にして、チップが複数行になっても操作群が1行目の天と揃うようにする。 */}
          <div className="hidden py-3 sm:flex sm:flex-wrap sm:items-start sm:gap-x-6 sm:gap-y-3">
            <FilterBody {...bodyProps} />
          </div>
        </div>
      </div>

      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <FilterBody {...bodyProps} />
      </FilterDrawer>
    </>
  );
}
