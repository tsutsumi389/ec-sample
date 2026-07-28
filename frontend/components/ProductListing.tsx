'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Category, Product, ProductListResponse } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import Pagination from '@/components/Pagination';
import { type BreadcrumbItem } from '@/components/Breadcrumbs';
import PageMasthead from '@/components/PageMasthead';
import { motifForCategory } from '@/lib/categoryMotifs';
import { CupMotif, PlantMotif } from '@/components/BrandMotifs';
import { ProductGridSkeleton } from '@/components/Skeleton';
import EmptyState from '@/components/EmptyState';
import ErrorNotice from '@/components/ErrorNotice';
import { ChatBubbleIcon, XMarkIcon } from '@/components/Icons';
import ProductFilters, { type ProductFiltersValue, type ProductSort } from '@/components/ProductFilters';
import { btn } from '@/lib/buttonStyles';
import { listingGrid } from '@/lib/gridStyles';
import { EVENT_SEARCH_NO_RESULT, track } from '@/lib/analytics';
import { useAssistant } from '@/lib/assistant-context';

const LIMIT = 12;

const SORT_LABELS: Record<ProductSort, string> = {
  recommended: 'おすすめ順',
  newest: '新着順',
  price_asc: '価格が安い順',
  price_desc: '価格が高い順',
  rating: '評価が高い順',
};

const yen = (value: string) => `¥${Number(value).toLocaleString('ja-JP')}`;

interface ProductListingProps {
  /** URL を組み立てる基点。'/products' または `/categories/${id}` */
  basePath: string;
  /** カテゴリページで固定するカテゴリ。指定時は category_id を URL パラメータでなくこの値から取る */
  fixedCategory?: { id: number; name: string };
  /**
   * マストヘッド帯の中に出すパンくず（末尾は現在地）。
   * 検索中はこの末尾をリンクに変えて「『◯◯』の検索結果」を1段積む。
   * **必ず渡すこと**: 渡さないとこのページだけ扉からパンくず行が消え、
   * h1 の垂直位置が他ページと約40px ずれる。
   */
  breadcrumbs?: BreadcrumbItem[];
}

function FilterChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-9 items-center gap-1 rounded-full bg-brand-50 pl-3.5 pr-1.5 text-caption text-brand-800">
      {label}
      {/* .hit で見た目 24px のまま実効 36px 角のタップ領域にする */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="hit inline-flex h-6 w-6 items-center justify-center rounded-full text-brand-600 transition-colors duration-fast ease-standard hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/**
 * グリッドの途中に挟む「棚の途中で」の帯（全幅1行）。
 *
 * なぜ必要か: 一覧は 4列×3行が同一の余白で連続し、1440px で 5,400px 以上スクロールしても
 * 版面のリズムが変わるのは巻末の EDITOR'S NOTE の1回だけだった。グリッドを途中で
 * 1本割って「2行＋帯＋1行」にすると、誌面としての段落が生まれる。
 *
 * 巻末の EDITOR'S NOTE（bg-invert）とは造形を変える。同じ暗色帯を2本出すと
 * 「同じ装置の反復」になり、リズムではなく模様になるため、こちらは沈んだ地＋上下罫の
 * 静かな帯にして、暗色帯＝巻末の締め、という役割分担を保つ。
 *
 * 差し込み位置は列数で変わる（全幅セルは行の途中に入れないこと。行が閉じずに穴が空く）:
 *   2列（<md）… 8枚目の後   3列（md〜xl未満）… 6枚目の後   4列（xl〜）… 8枚目の後
 * 位置ごとに DOM を2つ置き、効かない側は display:none で消す（grid から外れるので穴は空かない）。
 */
function ShelfNote({ className }: { className: string }) {
  return (
    // ⚠ ここに animate-rise を付けないこと（実測）。この <li> は列数で display を
    // 切り替える（hidden ⇄ block）ので、display が none から戻るたびに CSS アニメーションが
    // **最初から**やり直しになる。ビューポートの高さを変えてから撮る full-page
    // スクリーンショット（Playwright の fullPage / 評価の撮影も同じ）はまさにその瞬間を
    // 捉えるため、.stagger の遅延（270ms）中＝opacity 0 で写り、
    // 「グリッドの途中に 193px の空白が空いているだけ」の画になっていた。
    // 静止した編集の帯なので、出現の動きは持たせない。
    <li className={`col-span-full ${className}`}>
      <div className="edge-y relative flex flex-col gap-3 overflow-hidden rounded-xl bg-sunken px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
        {/* 線画は隅で裁ち落とす（文字とは重ねない）。図案は扉の「棚の器」と同じ湯呑み。 */}
        <CupMotif
          aria-hidden
          className="pointer-events-none absolute -right-5 -top-6 h-28 select-none text-brand-700 opacity-[0.12] sm:h-32"
        />
        <div className="relative min-w-0">
          <p className="text-eyebrow uppercase font-num text-ink-muted">Shelf note — 棚の途中で</p>
          <p className="mt-2 font-mincho text-h3 text-ink jp-head jp-name">
            道具は、使う時間の長さで選ぶ。
          </p>
        </div>
        <p className="relative text-caption text-ink-muted jp-body sm:max-w-[20rem] sm:shrink-0 sm:border-l sm:border-line-strong sm:pl-8">
          毎日さわるものほど、値段より手ざわりで決めたほうが長く続きます。
        </p>
      </div>
    </li>
  );
}

/** クエリが空のときに `?` だけが残らないよう URL を組み立てる。 */
const withQuery = (path: string, params: URLSearchParams) => {
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
};

/**
 * 検索・絞り込み・ページネーション付きの商品一覧。
 * /products と /categories/[id] の双方から使う。状態の源は URL パラメータ
 * （search / page / sort / min_price / max_price。category_id は /products のときのみ）で、
 * 変更はすべて basePath への router.push で表現する（＝URL 共有・戻るで文脈が復元できる）。
 * useSearchParams を使うため、呼び出し側で Suspense 配下に置くこと。
 */
export default function ProductListing({
  basePath,
  fixedCategory,
  breadcrumbs,
}: ProductListingProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openAssistant } = useAssistant();
  // 0件からアシスタントを開くボタン。閉じたときフォーカスをここへ戻すため ref を渡す。
  const assistantCtaRef = useRef<HTMLButtonElement>(null);
  const search = searchParams.get('search') || '';
  const page = Number(searchParams.get('page') || '1') || 1;
  // カテゴリはパス（/categories/[id]）で固定されている場合はそちらを唯一の源とし、
  // /products のときだけ URL の category_id を読む。
  const categoryIdParam = fixedCategory ? null : searchParams.get('category_id');
  const categoryId = fixedCategory
    ? fixedCategory.id
    : categoryIdParam
    ? Number(categoryIdParam) || null
    : null;
  // 未知の sort 値（例: ?sort=foo）はチップ表示と API 送信の双方でノイズになるため、
  // 既知の ProductSort だけを許可し、それ以外は null（既定の newest 扱い）にフォールバックする。
  const rawSort = searchParams.get('sort');
  const sortParam: ProductSort | null =
    rawSort && rawSort in SORT_LABELS ? (rawSort as ProductSort) : null;
  const minPrice = searchParams.get('min_price') || '';
  const maxPrice = searchParams.get('max_price') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // 一度でもロードが完了したか。初回だけスケルトンを出し、以降の再ロード中は
  // 直前の結果グリッドを薄く残す（レイアウトの跳ねを防ぐ）ための判定に使う。
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Category[]>('/categories')
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        /* 絞り込みチップのラベル用。失敗しても致命的でないため無視する */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (categoryId) params.set('category_id', String(categoryId));
    if (sortParam) params.set('sort', sortParam);
    if (minPrice) params.set('min_price', minPrice);
    if (maxPrice) params.set('max_price', maxPrice);

    api
      .get<ProductListResponse>(`/products?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setProducts(data.items);
        setTotal(data.total);
        // 0 件は「探したのに見つからなかった」＝取りこぼしている需要。何で探して
        // 空になったのかを残す（1 ページ目だけ数える。ページ送りの空振りは需要ではない）。
        if (data.total === 0 && page === 1) {
          track(EVENT_SEARCH_NO_RESULT, {
            props: {
              search: search || null,
              category_id: categoryId,
              min_price: minPrice || null,
              max_price: maxPrice || null,
              sort: sortParam,
            },
          });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : '商品の取得に失敗しました');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setHasLoadedOnce(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [search, page, categoryId, sortParam, minPrice, maxPrice, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const buildParams = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    // 固定カテゴリはパスで表現されるため、クエリには category_id を載せない。
    if (!fixedCategory && categoryId) params.set('category_id', String(categoryId));
    if (sortParam) params.set('sort', sortParam);
    if (minPrice) params.set('min_price', minPrice);
    if (maxPrice) params.set('max_price', maxPrice);
    params.set('page', String(page));

    Object.entries(overrides).forEach(([key, val]) => {
      if (val === null || val === '') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });

    return params;
  };

  const scrollToProducts = () => {
    if (typeof document !== 'undefined') {
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePageChange = (newPage: number) => {
    router.push(withQuery(basePath, buildParams({ page: String(newPage) })));
    scrollToProducts();
  };

  const filtersValue: ProductFiltersValue = {
    categoryId,
    sort: sortParam,
    minPrice,
    maxPrice,
  };

  const handleFiltersChange = (next: ProductFiltersValue) => {
    // カテゴリ固定ページ（/categories/[id]）でカテゴリが変わったら「別ページへの移動」として扱う。
    // 検索語・並び順・価格帯は持ち越し、ページ番号だけ 1 に戻す。
    if (fixedCategory && next.categoryId !== fixedCategory.id) {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (next.sort) params.set('sort', next.sort);
      if (next.minPrice) params.set('min_price', next.minPrice);
      if (next.maxPrice) params.set('max_price', next.maxPrice);
      params.set('page', '1');
      // 「すべて」（解除）なら /products、別カテゴリならそのカテゴリページへ。
      const target = next.categoryId ? `/categories/${next.categoryId}` : '/products';
      router.push(withQuery(target, params));
      return;
    }

    router.push(
      withQuery(
        basePath,
        buildParams({
          category_id: !fixedCategory && next.categoryId ? String(next.categoryId) : null,
          sort: next.sort,
          min_price: next.minPrice,
          max_price: next.maxPrice,
          page: '1',
        })
      )
    );
  };

  const pushWith = (overrides: Record<string, string | null>) => {
    router.push(withQuery(basePath, buildParams({ ...overrides, page: '1' })));
  };

  // 固定カテゴリのチップ解除は「カテゴリページから出る」＝/products へ移動する。
  // 検索語・並び順・価格帯はそのまま持ち越す。
  const removeCategory = () => {
    if (fixedCategory) {
      router.push(withQuery('/products', buildParams({ page: '1' })));
      return;
    }
    pushWith({ category_id: null });
  };

  const hasActiveFilters = Boolean(
    search || categoryId || minPrice || maxPrice || (sortParam && sortParam !== 'newest')
  );

  // 結果の**件数を減らしうる**条件が掛かっているか。0件の空状態で最重要 CTA をどちらに
  // するかの判定に使う。並び替えは含めない（順番を変えるだけで 0件の原因になり得ない）。
  const hasNarrowingFilters = Boolean(categoryId || minPrice || maxPrice);

  const categoryName = fixedCategory
    ? fixedCategory.name
    : categoryId
    ? categories.find((c) => c.id === categoryId)?.name ?? 'カテゴリ'
    : '';

  const priceLabel =
    minPrice && maxPrice
      ? `${yen(minPrice)}〜${yen(maxPrice)}`
      : minPrice
      ? `${yen(minPrice)}以上`
      : maxPrice
      ? `${yen(maxPrice)}以下`
      : '';

  const statusMessage = loading
    ? '商品を読み込んでいます'
    : error
    ? '商品の読み込みに失敗しました'
    : `${total}件の商品が見つかりました`;

  // 見出し: 検索中は検索結果、カテゴリページはカテゴリ名、素の /products は「商品一覧」。
  const heading = search
    ? `「${search}」の検索結果`
    : fixedCategory
    ? fixedCategory.name
    : '商品一覧';

  // 検索中は現在地が1段深くなる（ホーム > 商品一覧 > 「◯◯」の検索結果）。
  // 渡された末尾（＝そのページ自身）をリンクに変え、検索結果を末尾に積む。
  const mastheadBreadcrumbs =
    breadcrumbs && breadcrumbs.length > 0 && search
      ? [
          ...breadcrumbs.slice(0, -1),
          { ...breadcrumbs[breadcrumbs.length - 1], href: basePath },
          { label: heading },
        ]
      : breadcrumbs;

  // 初回ロード（まだ結果グリッドを一度も出していない）だけスケルトンに置き換える。
  // 2回目以降のロード中は直前のグリッドを薄く残して差し替える。
  const showSkeleton = loading && (!hasLoadedOnce || products.length === 0);
  const showDimmedGrid = loading && hasLoadedOnce && products.length > 0;
  const showGrid = showDimmedGrid || (!loading && !error && products.length > 0);

  // グリッドの終いに置く「編集の声」。
  //
  // 以前はカード1枚ぶんのセルとして 7 番目に挟んでいたが、列数が 2/3/4 と変わる版面では
  // 総セル数が必ず列数の倍数から外れ、毎回1枚だけの孤立行（widow）が残った。
  // 2・3・4 のいずれでも割り切れる差し込み位置はグリッドの先頭か末尾しかないため、
  // 全幅（col-span-full）の帯として末尾に置き、ページ送りの直前で誌面を締める形にした。
  // これで商品セルは常に 12 枚＝どの列数でも行が閉じる。lg 未満でも出す。
  const showEditorsNote = page === 1 && products.length >= 6;
  // 出現の段は親の .stagger（globals.css §3b）が配る。子ごとの inline style は持たない。
  //
  // ⚠ ここを `motion-safe:animate-rise` にしないこと。motion-safe は media variant なので
  //   Tailwind が生成 CSS の**最後**に出力し、その `animation:` ショートハンドが
  //   .stagger の animation-delay を 0s に巻き戻す（実測: .stagger>* @382682 に対し
  //   .motion-safe\:animate-rise @396059）。素の `animate-rise` は 345k 付近＝
  //   .stagger より前に出るので遅延が残る。低モーション環境は globals.css §5 の
  //   `*{animation-duration:.01ms!important}` が全称で止めるため motion-safe は不要。
  //
  // グリッドの途中に挟む「棚の途中で」の帯。帯の後ろに最低2枚が残る枚数のときだけ出す
  // （残り1枚だと帯の直後に孤立行ができ、割った意味が消える）。
  const showShelfNote = products.length >= 10;
  const gridCells: ReactNode[] = [];
  products.forEach((product, i) => {
    // 2列（<md）と4列（xl〜）は 8 枚目の後、3列（md〜xl未満）は 6 枚目の後で割る。
    if (showShelfNote && i === 6) {
      gridCells.push(<ShelfNote key="shelf-note-3col" className="hidden md:block xl:hidden" />);
    }
    if (showShelfNote && i === 8) {
      gridCells.push(<ShelfNote key="shelf-note-24col" className="md:hidden xl:block" />);
    }
    gridCells.push(
      <li key={product.id} className="h-full animate-rise">
        <ProductCard product={product} trackSection="listing" />
      </li>
    );
  });
  if (showEditorsNote) {
    gridCells.push(
      <li key="editors-note" className="col-span-full animate-rise">
        {/* 横並びは lg から。768px で横に割ると見出しの取り分が 80px 前後まで痩せて
            明朝の柱が数文字ずつに割れる。lg 以上では右に線画ぶんの余白を確保し、
            文字と図版の縄張りを分ける。 */}
        <div className="on-dark relative flex flex-col gap-5 overflow-hidden rounded-xl bg-invert p-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12 lg:p-9 lg:pr-36 xl:pr-48">
          {/* 線画は背面の装飾として隅で裁ち落とす。文字とは重ねない */}
          <PlantMotif
            className="pointer-events-none absolute -bottom-12 -right-12 h-32 select-none text-brand-300 opacity-[0.14] lg:-bottom-8 lg:right-10 lg:h-44"
            aria-hidden
          />
          <div className="relative min-w-0">
            <p className="text-eyebrow uppercase font-num text-on-dark-muted">EDITOR&apos;S NOTE</p>
            {/* ブランドの標語（「毎日ふれるものほど、すこし良いものを。」）は
                署名帯とフッター奥付の2箇所だけに置く。各ページの扉／ノートは必ず別の一文にする。
                ここに標語を置いていたため、ホーム→商品一覧で同じ文が2ページ連続し、
                しかも一方は本文・他方は柱の見出しと階層が食い違っていた。 */}
            <p className="mt-3 font-mincho text-h2 text-on-dark jp-head jp-name">
              棚に置く前に、一度は使ってみる。
            </p>
          </div>
          <p className="relative max-w-[34rem] border-t border-brand-400/30 pt-4 text-body text-on-dark-muted lg:max-w-[19rem] lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 xl:max-w-[22rem]">
            使う時間の長い道具ほど、選び方が日々に効いてきます。編集部が実際に使って、
            手元に残ったものを並べました。
          </p>
        </div>
      </li>
    );
  }

  return (
    <div id="products" className="scroll-mt-[var(--header-h)]">
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {/* 扉は全ページ共通の PageMasthead に寄せる。下に続くグリッドが wrap-wide なので
          width も wide で揃える（左端が段差しないための契約）。 */}
      <PageMasthead
        // 扉の柱は「欧文の柱 — 編集の一言」。ホームの各節（No.02 — Left in your cart 等）と
        // 同じ組み方にして、一覧も同じ誌面の一節として読ませる。号数は振らない:
        // ホームの節番号はログイン状態でレーン本数が変わり（実測 ゲスト No.05 まで /
        // ログイン済み No.06 まで）、固定の番号を他ページに振ると通しが飛ぶため。
        eyebrow={
          search
            ? 'Products — 探しもの'
            : fixedCategory
            ? 'Products — この棚から'
            : 'Products — 棚のぜんぶ'
        }
        title={heading}
        // ホームの新着と同じ一文（「季節のおすすめと定番の道具を…」）を置いていたため、
        // ホーム→一覧で同じ説明が2ページ連続していた。扉ごとに別の一文にする。
        subtitle={search ? null : '編集部が使ってよかったものだけを、順に並べています。'}
        // 扉の線画はカテゴリの意味に対応させる（ホームのカテゴリ札と同じ図案）。
        // カテゴリを絞っていない一覧は「棚の器」＝ cup を通し番号のように固定で持つ。
        motif={categoryName ? motifForCategory(categoryName) : 'cup'}
        width="wide"
        breadcrumbs={mastheadBreadcrumbs}
        right={
          !loading && !error ? (
            <p className="whitespace-nowrap text-body text-ink-muted">
              全 <span className="text-num-lg tnum text-ink">{total}</span> 件
            </p>
          ) : undefined
        }
      />

      <ProductFilters value={filtersValue} onChange={handleFiltersChange} searching={Boolean(search)} />

      <div className="wrap-wide band-lg">
        {/* 適用中の条件は「出る／消える」ではなく「開く／閉じる」で見せる（.reveal / globals.css §3b）。
            高さ 0⇄auto を grid-template-rows 0fr→1fr で遷移させ、開きは entrance・閉じは exit と
            イージングが非対称になる。チップ自体は hasActiveFilters のときだけ描くので、
            閉じているあいだ隠れた操作要素がタブ順に残ることはない。 */}
        <div className="reveal" data-open={hasActiveFilters}>
          {/* .reveal の子は overflow:hidden なので、そのままだとチップの focus リング
              （ring-2 + offset-2 = 4px）が上端で切られる。内側に 4px の逃げを作り、
              同じぶん外側へ引き戻して版面の左端は動かさない。 */}
          <div className="-mx-1 -mt-1 p-1">
            {hasActiveFilters && (
              <div className="mb-7 flex flex-wrap items-center gap-2">
                <span className="text-caption text-ink-muted">絞り込み中:</span>
                {search && (
                  <FilterChip
                    label={`検索: ${search}`}
                    removeLabel="検索条件を解除"
                    onRemove={() => pushWith({ search: null })}
                  />
                )}
                {categoryId && (
                  <FilterChip
                    label={`カテゴリ: ${categoryName}`}
                    removeLabel="カテゴリの絞り込みを解除"
                    onRemove={removeCategory}
                  />
                )}
                {(minPrice || maxPrice) && (
                  <FilterChip
                    label={`価格: ${priceLabel}`}
                    removeLabel="価格帯の絞り込みを解除"
                    onRemove={() => pushWith({ min_price: null, max_price: null })}
                  />
                )}
                {sortParam && sortParam !== 'newest' && (
                  <FilterChip
                    label={`並び順: ${SORT_LABELS[sortParam]}`}
                    removeLabel="並び順の指定を解除"
                    onRemove={() => pushWith({ sort: null })}
                  />
                )}
                <button
                  type="button"
                  // カテゴリページからの「すべて解除」もカテゴリ固定を外す＝素の /products へ戻す。
                  onClick={() => router.push('/products')}
                  className="hit rounded text-caption font-medium text-ink-muted underline-offset-4 transition-colors duration-fast ease-standard hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                >
                  すべて解除
                </button>
              </div>
            )}
          </div>
        </div>

        {showSkeleton && <ProductGridSkeleton count={LIMIT} className={listingGrid} />}

        {!loading && error && (
          <ErrorNotice description={error} onRetry={() => setReloadKey((k) => k + 1)} />
        )}

        {!loading && !error && products.length === 0 && (
          <EmptyState
            title={
              search
                ? `「${search}」に一致する商品が見つかりませんでした`
                : '条件に合う商品が見つかりませんでした'
            }
            description={
              search
                ? '別の言葉や、もっと一般的な言葉で試してみてください。「雨の日に便利なもの」のような曖昧な表現でも探せます。'
                : '絞り込み条件を変えると、お探しの道具が見つかるかもしれません。'
            }
            action={
              categories.length > 0 || hasActiveFilters ? (
                <div className="flex flex-col items-center gap-8">
                  {categories.length > 0 && (
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-eyebrow uppercase font-num text-ink-muted">
                        CATEGORIES
                      </span>
                      <div className="flex flex-wrap justify-center gap-2">
                        {categories.map((category) => (
                          <Link
                            key={category.id}
                            href={`/categories/${category.id}`}
                            className="inline-flex h-11 items-center whitespace-nowrap rounded-full bg-sunken px-4 text-body font-medium text-ink-soft transition-[background-color,color] duration-fast ease-standard hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                          >
                            {category.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {hasActiveFilters && (
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => router.push('/products')}
                        className={btn(hasNarrowingFilters ? 'primary' : 'secondary', 'md')}
                      >
                        絞り込みをすべて解除する
                      </button>
                      {/* 言葉で探して空振りした人の行き止まりを断つ。何を探していたかを
                          持ったままアシスタントを開き、入力欄へ入れて渡す（送信はしない。
                          予算や用途を書き足してから送れるようにするため）。
                          最重要 CTA をどちらにするかは 0件の原因の当たりで決める——
                          カテゴリや価格帯で絞り込んでいるなら条件側が原因である方が多いので、
                          機械的に直せる「絞り込み解除」に primary を譲る。 */}
                      {search && (
                        <button
                          ref={assistantCtaRef}
                          type="button"
                          onClick={() =>
                            openAssistant({
                              prefill: `「${search}」を探しています`,
                              returnFocusTo: assistantCtaRef,
                            })
                          }
                          data-track-click="search_no_result_assistant"
                          data-track-props={JSON.stringify({ search })}
                          className={btn(hasNarrowingFilters ? 'secondary' : 'primary', 'md')}
                        >
                          <ChatBubbleIcon className="h-4 w-4" />
                          アシスタントに相談する
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : undefined
            }
          />
        )}

        {showGrid && (
          <div
            className={
              showDimmedGrid ? 'pointer-events-none opacity-50 transition-opacity duration-base' : ''
            }
            aria-busy={showDimmedGrid || undefined}
          >
            {/* 見出しの段は h1（扉）→ h2（この行）→ h3（カードの商品名）と飛ばさずに下る。
                版面には扉の見出しがあるので視覚的には要らないが、この h2 が無いと
                h1 の次が h3 になり axe の heading-order 違反になる（実測: 4幅 × 通常/
                ドロワー展開で 7 nodes → 0 nodes）。 */}
            <h2 className="sr-only">商品一覧</h2>
            {/* 行間を列間の倍にして誌面の行送りを作る。1024px 未満は 2 列のまま
                カードを大きく見せ、xl で 4 列に開く。 */}
            <ul className={`stagger grid items-stretch [--stagger-step:45ms] ${listingGrid}`}>
              {gridCells}
            </ul>

            <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
          </div>
        )}
      </div>
    </div>
  );
}
