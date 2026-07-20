'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  FormEvent,
  Fragment,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '@/lib/api';
import type { SuggestProduct, SuggestResponse } from '@/lib/types';
import { SearchIcon, XMarkIcon } from '@/components/Icons';
import Price from '@/components/Price';
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
  removeSearchHistory,
} from '@/lib/searchHistory';

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
// これ未満のときは代わりに「最近の検索」（履歴）を出す。
const MIN_QUERY_LENGTH = 2;
// 入力が止まってから API を叩くまでの待ち時間（ms）。打鍵ごとの過剰リクエストを間引く。
const DEBOUNCE_MS = 250;

/**
 * ドロップダウンに並ぶ選択肢のフラットなモデル。
 * 履歴・キーワード候補・商品候補が混在するため、種別付きの 1 次元配列に正規化し、
 * ↑↓ / Enter / aria-activedescendant がどの種別でも同じインデックスで一貫して動くようにする。
 * 見出し（「最近の検索」「商品」）はこの配列には含めない（＝キーボードで止まらない）。
 */
type Option =
  | { kind: 'history'; value: string }
  | { kind: 'keyword'; value: string }
  | { kind: 'product'; product: SuggestProduct };

/**
 * 検索窓 + サジェスト（履歴・キーワード・商品ダイレクト候補）。
 *
 * WAI-ARIA の combobox パターンに準拠する:
 * - 入力は role="combobox"、候補リストは role="listbox"、各候補は role="option"
 * - ↑↓ で候補を移動、Enter で確定（未選択なら入力値で検索）、Esc で閉じる
 * - aria-activedescendant で「今どの候補がアクティブか」を支援技術へ伝える
 *
 * キーワード候補・商品候補は入力中に GET /products/suggest から取得する。
 * 2 文字未満のときは代わりに localStorage の検索履歴を出す。
 * 確定するとフルのハイブリッド検索（GET /products?search=）に渡す。埋め込み等の
 * 重い処理は入力中には一切呼ばない。
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
  const searchParams = useSearchParams();

  // URL の search パラメータを初期値にする（/?search=傘 を直接開いた／リロードした
  // ときに検索欄へ反映するため）。以降の URL 変化は下の同期 effect で拾う。
  const initialSearch = searchParams.get('search') ?? '';

  const [query, setQuery] = useState(initialSearch);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [products, setProducts] = useState<SuggestProduct[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  // キーボードでハイライト中の候補（options 配列のインデックス）。-1 は「未選択」。
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // 候補確定で query を書き換えた直後の 1 回だけサジェスト取得を抑止するフラグ。
  // これが無いと setQuery → useEffect 再発火でドロップダウンが開き直してしまう
  // （ホーム上の確定は pathname が変わらず、遷移による自動クローズも効かないため）。
  // URL 由来の初期値がある場合も、マウント直後に勝手に開かないよう最初から立てておく。
  const suppressFetchRef = useRef(initialSearch.length > 0);
  // URL 同期で「前回見た search パラメータ」を覚えておく。入力中のタイピングを
  // 上書きしないよう、値が実際に変わったときだけ query へ反映する。
  const prevSearchParamRef = useRef(initialSearch);

  const optionId = (index: number) => `${listboxId}-opt-${index}`;

  const trimmedQuery = query.trim();
  // 2 文字未満のときは履歴モード（＝「最近の検索」を出す）。
  const isHistoryMode = trimmedQuery.length < MIN_QUERY_LENGTH;

  // ドロップダウンの選択肢を種別付きのフラット配列へ正規化する。
  // 履歴モードなら履歴だけ、通常モードならキーワード候補 → 商品候補の順に並べる。
  const options = useMemo<Option[]>(() => {
    if (isHistoryMode) {
      return history.map((value) => ({ kind: 'history', value }) as const);
    }
    return [
      ...suggestions.map((value) => ({ kind: 'keyword', value }) as const),
      ...products.map((product) => ({ kind: 'product', product }) as const),
    ];
  }, [isHistoryMode, history, suggestions, products]);

  // 入力を間引いてサジェストを取得する。古いリクエストは AbortController で捨て、
  // 応答の到着順が入れ替わっても表示がちらつかないようにする。
  useEffect(() => {
    // 候補確定・URL 反映で query を設定した直後は、開き直しを防ぐため 1 回だけ取得しない。
    if (suppressFetchRef.current) {
      suppressFetchRef.current = false;
      setSuggestions([]);
      setProducts([]);
      setActiveIndex(-1);
      setOpen(false);
      return;
    }

    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      // 履歴モード。API は叩かない。open は focus/blur・履歴の有無側で制御するので
      // ここでは触らない（空欄フォーカスで履歴を出せるようにするため）。
      setSuggestions([]);
      setProducts([]);
      setActiveIndex(-1);
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
        // products はバックエンドが未対応だと欠損し得るので必ず ?? [] で受ける。
        setProducts(res.products ?? []);
        setActiveIndex(-1);
        setOpen(true);
      } catch (err) {
        // 中断は正常系。それ以外の失敗はサジェストを黙って畳む（本検索は生きている）。
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setSuggestions([]);
          setProducts([]);
          setOpen(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // 検索履歴をマウント時に読み込む（SSR ガードは lib 側で担保）。
  useEffect(() => {
    setHistory(getSearchHistory());
  }, []);

  // マウント時フォーカス（モバイルの開閉バー用）。autoFocus 属性は使わず明示的に当てる。
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // URL の search パラメータが変わったら検索欄へ反映する（リンク遷移・ブラウザ戻る等）。
  // タイピング中の値を潰さないよう、パラメータが実際に変化したときだけ setQuery する。
  useEffect(() => {
    const sp = searchParams.get('search') ?? '';
    if (sp === prevSearchParamRef.current) return;
    prevSearchParamRef.current = sp;
    // 既に同じ値（自分の runSearch 起点の URL 更新など）なら何もしない。
    if (sp === query) return;
    // URL 起点の反映ではドロップダウンを開かない（フォーカスしていないのに開くのを防ぐ）。
    suppressFetchRef.current = true;
    setQuery(sp);
  }, [searchParams, query]);

  // ページ遷移でドロップダウンを閉じる（検索実行や他リンク遷移の後始末）。
  useEffect(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, [pathname]);

  const runSearch = (term: string) => {
    const trimmed = term.trim();
    // 空でない検索は履歴へ残す（state も即時反映して次回フォーカスで出せるように）。
    if (trimmed) {
      setHistory(addSearchHistory(trimmed));
    }
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

  // 選択肢の確定。商品候補は詳細ページへ、それ以外（履歴・キーワード）は検索を実行する。
  const selectOption = (opt: Option) => {
    if (opt.kind === 'product') {
      setOpen(false);
      setActiveIndex(-1);
      router.push(`/products/${opt.product.id}`);
      onSubmitted?.();
      return;
    }
    runSearch(opt.value);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // 候補をハイライト中ならその候補で、そうでなければ入力値そのままで検索する。
    if (activeIndex >= 0 && options[activeIndex]) {
      selectOption(options[activeIndex]);
      return;
    }
    runSearch(query);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // IME 変換中のキーは無視する。isComposing に加え、Safari が compositionend 後の
    // Enter で 229 を返す取りこぼしにも keyCode===229 で備える（誤確定・誤検索の防止）。
    const composing = e.nativeEvent.isComposing || e.keyCode === 229;

    if (e.key === 'Enter') {
      if (composing) {
        // 変換確定の Enter。ここで止めないと form の暗黙送信で誤検索が走る。
        e.preventDefault();
        return;
      }
      // 変換中でなければ form の onSubmit（handleSubmit）に確定を任せる。
      return;
    }

    // ここから下（矢印・Esc）は変換中なら一切動かさない。
    if (composing) return;

    if (e.key === 'ArrowDown') {
      if (!open && options.length > 0) {
        setOpen(true);
        return;
      }
      if (options.length === 0) return;
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      if (options.length === 0) return;
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  // × ボタン: 入力をクリアしてフォーカスを戻す。空欄フォーカス状態になるので履歴を出す。
  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setProducts([]);
    setActiveIndex(-1);
    setHistory(getSearchHistory());
    setOpen(true);
    inputRef.current?.focus();
  };

  // 履歴の個別削除。ドロップダウンは閉じずに即時反映する。
  const handleRemoveHistory = (value: string) => {
    setHistory(removeSearchHistory(value));
    setActiveIndex(-1);
  };

  // 履歴の全消去。同じくドロップダウンは開いたまま。
  const handleClearHistory = () => {
    setHistory(clearSearchHistory());
    setActiveIndex(-1);
  };

  const showList = open && options.length > 0;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit} className="flex">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              // 最新の履歴を読み直してから開く（他タブでの更新や直前の確定を反映）。
              setHistory(getSearchHistory());
              setOpen(true);
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
            className={`w-full rounded-l-md border border-gray-300 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 ${
              query ? 'pr-9' : 'pr-3'
            } ${inputClassName}`}
          />
          {query && (
            <button
              type="button"
              // input の blur → リスト閉じを避けるため mousedown でフォーカスを奪わない。
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              aria-label="検索キーワードをクリア"
              className="absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
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
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-96 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {/* 履歴モードの見出し（「最近の検索」＋全消去）。option ではないので role=presentation。 */}
          {isHistoryMode && (
            <li
              role="presentation"
              className="flex items-center justify-between px-3 py-1.5 text-xs font-medium text-gray-500"
            >
              <span>最近の検索</span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClearHistory}
                className="rounded text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                履歴を消去
              </button>
            </li>
          )}

          {options.map((opt, i) => {
            const active = i === activeIndex;
            // 「商品」セクション見出しは最初の商品候補の直前に一度だけ挟む。
            const showProductHeading =
              opt.kind === 'product' && (i === 0 || options[i - 1].kind !== 'product');

            return (
              <Fragment key={optionKey(opt)}>
                {showProductHeading && (
                  <li
                    role="presentation"
                    className="mt-1 border-t border-gray-100 px-3 pb-1 pt-2 text-xs font-medium text-gray-500"
                  >
                    商品
                  </li>
                )}
                <li
                  id={optionId(i)}
                  role="option"
                  aria-selected={active}
                  // input の blur より先に選択を処理したいので mousedown で拾い、
                  // preventDefault でフォーカスを奪わない（＝リストが閉じない）。
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(opt);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                    active ? 'bg-brand-50 text-brand-700' : 'text-gray-700'
                  }`}
                >
                  {opt.kind === 'product' ? (
                    <ProductOptionRow product={opt.product} />
                  ) : (
                    <KeywordOptionRow
                      value={opt.value}
                      query={trimmedQuery}
                      isHistory={opt.kind === 'history'}
                      onRemove={
                        opt.kind === 'history'
                          ? () => handleRemoveHistory(opt.value)
                          : undefined
                      }
                    />
                  )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** option 用の安定キー（種別ごとに名前空間を分けて衝突を避ける）。 */
function optionKey(opt: Option): string {
  if (opt.kind === 'product') return `product-${opt.product.id}`;
  return `${opt.kind}-${opt.value}`;
}

/**
 * クエリと一致する部分を太字で強調して返す（大文字小文字は無視、最初の一致のみ）。
 * XSS を避けるため dangerouslySetInnerHTML は使わず、文字列を分割して描画する。
 */
function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return (
    <>
      {before}
      {/* mark のデフォルト背景（黄色）は使わず、太字だけで強調する。 */}
      <mark className="bg-transparent font-semibold text-inherit">{match}</mark>
      {after}
    </>
  );
}

/** キーワード候補 / 履歴項目の 1 行。履歴は末尾に個別削除ボタンを出す。 */
function KeywordOptionRow({
  value,
  query,
  isHistory,
  onRemove,
}: {
  value: string;
  query: string;
  isHistory: boolean;
  onRemove?: () => void;
}) {
  return (
    <>
      <SearchIcon className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 truncate">
        {/* 履歴は入力が短い（<2 文字）ので基本ハイライトされない。キーワード候補のみ光る。 */}
        {highlightMatch(value, query)}
      </span>
      {isHistory && onRemove && (
        <button
          type="button"
          // mousedown で option の選択（＝検索実行）より先に握り、フォーカスも奪わない。
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`「${value}」を履歴から削除`}
          className="shrink-0 rounded-full p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );
}

/** 商品ダイレクト候補の 1 行（サムネイル + 商品名 + 実売価格）。 */
function ProductOptionRow({ product }: { product: SuggestProduct }) {
  const onSale = product.sale_price != null && product.sale_price < product.price;
  return (
    <>
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded bg-gray-100">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt=""
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.endsWith('/no-image.svg')) return;
              img.onerror = null;
              img.src = '/no-image.svg';
            }}
            className="h-full w-full object-cover"
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-gray-800">{product.name}</span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        <Price value={product.effective_price} size="sm" />
        {onSale && (
          <span className="text-xs text-gray-400 line-through">
            ¥{product.price.toLocaleString()}
          </span>
        )}
      </span>
    </>
  );
}
