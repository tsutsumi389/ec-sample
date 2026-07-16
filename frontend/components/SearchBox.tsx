'use client';

import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { SuggestResponse } from '@/lib/types';
import { SearchIcon } from '@/components/Icons';

interface SearchBoxProps {
  /** 外側 form に付けるクラス（表示/レイアウトの差はここで吸収する）。 */
  className?: string;
  /** 入力欄の padding など、PC/モバイルで変えたい部分。 */
  inputClassName?: string;
  /** 検索ボタンの padding など、PC/モバイルで変えたい部分。 */
  buttonClassName?: string;
  /** モバイル開閉バー用。マウント時に入力へフォーカスする。 */
  autoFocus?: boolean;
  /** 検索を実行した（＝遷移した）ときに呼ぶ。モバイルバーを閉じる用途。 */
  onSubmitted?: () => void;
}

// サジェストを出すまでの最小文字数。1 文字は候補過多になるだけなので API も叩かない。
const MIN_QUERY_LENGTH = 2;
// 入力が止まってから API を叩くまでの待ち時間（ms）。打鍵ごとの過剰リクエストを間引く。
const DEBOUNCE_MS = 250;

/**
 * 検索窓 + サジェスト（キーワードオートコンプリート）。
 *
 * WAI-ARIA の combobox パターンに準拠する:
 * - 入力は role="combobox"、候補リストは role="listbox"、各候補は role="option"
 * - ↑↓ で候補を移動、Enter で確定（未選択なら入力値で検索）、Esc で閉じる
 * - aria-activedescendant で「今どの候補がアクティブか」を支援技術へ伝える
 *
 * サジェストはキーワード（商品名）候補のみで、確定するとフルのハイブリッド検索
 * （GET /products?search=）に渡す。埋め込み等の重い処理は入力中には一切呼ばない。
 */
export default function SearchBox({
  className = '',
  inputClassName = '',
  buttonClassName = '',
  autoFocus = false,
  onSubmitted,
}: SearchBoxProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  // キーボードでハイライト中の候補。-1 は「未選択」（Enter は入力値で検索）。
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // 候補確定で query を書き換えた直後の 1 回だけサジェスト取得を抑止するフラグ。
  // これが無いと setQuery → useEffect 再発火でドロップダウンが開き直してしまう
  // （ホーム上の確定は pathname が変わらず、遷移による自動クローズも効かないため）。
  const suppressFetchRef = useRef(false);

  const optionId = (index: number) => `${listboxId}-opt-${index}`;

  // 入力を間引いてサジェストを取得する。古いリクエストは AbortController で捨て、
  // 応答の到着順が入れ替わっても表示がちらつかないようにする。
  useEffect(() => {
    // 候補確定で query を設定した直後は、開き直しを防ぐため 1 回だけ取得しない。
    if (suppressFetchRef.current) {
      suppressFetchRef.current = false;
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get<SuggestResponse>(
          `/products/suggest?q=${encodeURIComponent(q)}`,
          controller.signal
        );
        setSuggestions(res.suggestions);
        setActiveIndex(-1);
        setOpen(true);
      } catch (err) {
        // 中断は正常系。それ以外の失敗はサジェストを黙って畳む（本検索は生きている）。
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // マウント時フォーカス（モバイルの開閉バー用）。autoFocus 属性は使わず明示的に当てる。
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // ページ遷移でドロップダウンを閉じる（検索実行や他リンク遷移の後始末）。
  useEffect(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, [pathname]);

  const runSearch = (term: string) => {
    const trimmed = term.trim();
    // 確定したキーワードを検索欄にも反映する。直後の query 変化による
    // サジェスト再取得（＝ドロップダウンの開き直し）は上のフラグで抑止する。
    if (trimmed !== query) {
      suppressFetchRef.current = true;
      setQuery(trimmed);
    }
    setOpen(false);
    setActiveIndex(-1);
    const params = new URLSearchParams();
    if (trimmed) {
      params.set('search', trimmed);
    }
    router.push(params.toString() ? `/?${params.toString()}` : '/');
    onSubmitted?.();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // 候補をハイライト中ならその候補で、そうでなければ入力値そのままで検索する。
    const term = activeIndex >= 0 && suggestions[activeIndex] ? suggestions[activeIndex] : query;
    runSearch(term);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (!open && suggestions.length > 0) {
        setOpen(true);
        return;
      }
      if (suggestions.length === 0) return;
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit} className="flex">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder="商品名や雰囲気で検索（例: 雨の日に便利なもの）"
          aria-label="商品を検索"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          className={`w-full rounded-l-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 ${inputClassName}`}
        />
        <button
          type="submit"
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-r-md border border-l-0 border-gray-300 bg-white px-4 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${buttonClassName}`}
        >
          <SearchIcon />
          検索
        </button>
      </form>

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="検索候補"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              // input の blur より先に選択を処理したいので mousedown で拾い、
              // preventDefault でフォーカスを奪わない（＝リストが閉じない）。
              onMouseDown={(e) => {
                e.preventDefault();
                runSearch(s);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                i === activeIndex ? 'bg-brand-50 text-brand-700' : 'text-gray-700'
              }`}
            >
              <SearchIcon className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
