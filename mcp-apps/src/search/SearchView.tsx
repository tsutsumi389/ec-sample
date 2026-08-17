/**
 * 検索結果カード一覧の View（backend が ui://hibino/search-products.html として配る中身）。
 *
 * ホストが search_products を呼ぶと、その structuredContent と _meta.ui がこの画面に
 * 届く。並び替え・ページング・再試行では、この画面から同じツールを
 * callServerTool("search_products") で撃ち直す（配線は useSearchView.ts）。
 *
 * **判断はここに一切持たない。** 購入可否の理由（availability）も価格帯の申し送り
 * （note）もサーバーが完成文で寄越すものをそのまま出す。文言を組み立て直すと同じ判断が
 * backend（services/cart.py）と二重になり、必ず片方が古くなる。
 *
 * **押せる／押せないは必ず状態からの派生で書く。** 移植前は setLoading() と
 * resetControlsToConfirmed() が DOM の disabled を書き換えており、経路によって
 * 片方だけ通る食い違いが実際に起きていた。ここでは disabled 属性の式が唯一の源。
 */

import type { ReactElement } from "react";

import { formatRating, formatYen } from "../shared/format.ts";
import { ErrorBanner, InitialError, ProductImage } from "../shared/ui.tsx";
import type { ProductBrief, SearchUiItem, SortKey } from "../shared/types.ts";
import { useSearchView } from "./useSearchView.ts";

/**
 * 並び順の表示名。**キーの列を書き並べず、SortKey 全件を要求する Record で持つ。**
 * 文言は View 側のものだが、キーの集合は backend の写し（types.ts の SORT_KEYS）が
 * 唯一の源であり、ここに5つ書き写すと「SORT_KEYS に足したのに画面に出ない」が
 * 型検査を素通りしてしまう（SORT_KEYS を配列で持っているのは、まさにその食い違いを
 * 防ぐため）。Record<SortKey, string> なら並び順が1つ増えた時点でここが型エラーになる。
 *
 * 画面に出る順序はこの宣言順（オブジェクトの文字列キーは挿入順を保つ）。
 */
const SORT_LABELS: Record<SortKey, string> = {
  recommended: "おすすめ順",
  newest: "新着順",
  price_asc: "価格が安い順",
  price_desc: "価格が高い順",
  rating: "評価が高い順",
};

/**
 * カード1枚。クリックで商品ページをホスト側に開かせる（この画面は遷移しない）。
 *
 * disabled は「このカードのリンクを開いている最中か」だけを見る。**読み込み中を
 * ここに足さないこと**——通信中にカードを押させないのは .grid[data-loading="true"] の
 * pointer-events: none の役目で、両方でやると読み込み中に .card:disabled の減光が
 * 二重に掛かる。
 */
function ProductCard({
  item,
  meta,
  opening,
  onOpen,
}: {
  item: ProductBrief;
  meta: SearchUiItem | undefined;
  opening: boolean;
  onOpen: (productId: number) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className="card"
      data-purchasable={String(item.purchasable)}
      disabled={opening}
      onClick={() => onOpen(item.id)}
    >
      {/* src に入れてよいのは _meta.ui 側の絶対URLだけ。structuredContent には
          そもそも画像が入っていない（views.py の「画像は詳細ツールだけ」規律）。 */}
      <ProductImage className="card-image" url={meta ? meta.image_url : null} />
      <div className="card-body">
        {item.category ? <span className="card-category">{item.category}</span> : null}
        <span className="card-name">{item.name}</span>
        <div className="card-price-row">
          <span className="card-price">{formatYen(item.effective_price)}</span>
          {item.list_price != null ? (
            <span className="card-list-price">{formatYen(item.list_price)}</span>
          ) : null}
        </div>
        <span className="card-rating">{formatRating(item.avg_rating, item.review_count)}</span>
        {/* availability は「購入できます」/ 買えない理由の完成文がサーバーから来る。
            理由をここで組み立て直さない（CLAUDE.md の規律をそのまま踏襲）。 */}
        <span className="card-availability" data-ok={String(item.purchasable)}>
          {item.availability}
        </span>
      </div>
    </button>
  );
}

export function SearchView(): ReactElement {
  // result は「全面エラーが出ている間は null」に揃えたもの（useSearchView が確定させる）。
  // 全面エラーはグリッド・ページング・読み込み中の表示を丸ごと置き換え、バナー
  // （下の ErrorBanner）はそのどれにも触らない、という二層の分け方がこれで保たれる。
  const { state, result, totalPages, changeSort, goToPage, retry, dismissBanner, openPage } =
    useSearchView();

  const initialError = state.initialError;
  const hasItems = result !== null && result.items.length > 0;

  const title =
    result === null
      ? "商品検索"
      : state.base.query
        ? `『${state.base.query}』の検索結果 ${result.total}件`
        : `検索結果 ${result.total}件`;

  return (
    // id="app" は theme.css が余白を当てるためのフック。safe area のインセットは
    // shared/host.ts の useSafeAreaInsets がドキュメントのルートへ載せ、足し算は
    // theme.css の calc() 側がやる（この要素に ref を付ける必要はない）。
    <div id="app">
      <header className="header">
        <h1 className="title">{title}</h1>
        <div className="sort-row">
          <label className="sort-label" htmlFor="sort-select">
            並び替え
          </label>
          {/* value を state.sort で制御する。**これが移植前の
              resetControlsToConfirmed() の代わり**——再検索が失敗しても state.sort は
              書き換わらないので、セレクトの表示は勝手に確定済みの値へ戻る
              （「表示は旧ソート・セレクトは新ソート」の食い違いが構造的に起きない）。 */}
          <select
            id="sort-select"
            value={state.sort}
            disabled={state.loading}
            onChange={(event) => changeSort(event.target.value)}
          >
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {/* structuredContent.note（価格帯の申し送り、またはカテゴリ不一致の案内）。
            控えめな表示にとどめ、無ければ何も出さない。 */}
        {result !== null && result.note ? <p className="note">{result.note}</p> : null}
      </header>

      {/* 再検索・商品ページを開く操作の失敗はここに出す。直前まで表示していた
          グリッドはそのまま残す（= 元の表示に戻せる）。 */}
      <ErrorBanner message={state.banner} onDismiss={dismissBanner} />

      <main className="main">
        {initialError !== null ? (
          // 一度も結果を受け取れていない状態（初回の検索そのものが失敗）専用の
          // 全面エラー。グリッドも並び替え結果もまだ無いので、ここにだけ再試行を置く。
          <InitialError message={initialError} loading={state.loading} onRetry={retry} />
        ) : result === null ? (
          <p className="state-message">商品を検索しています…</p>
        ) : !hasItems ? (
          <p className="state-message">該当する商品が見つかりませんでした。</p>
        ) : (
          // 通信中も中身は消さない（薄くするだけ。.grid[data-loading="true"] 参照）。
          // 消すと再検索が失敗したときに戻る先が無くなる。
          <div className="grid" data-loading={state.loading ? "true" : "false"}>
            {result.items.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                meta={state.uiItems.get(item.id)}
                opening={state.openingId === item.id}
                onOpen={openPage}
              />
            ))}
          </div>
        )}
      </main>

      {hasItems ? (
        <footer className="pagination">
          <button
            className="page-btn"
            type="button"
            disabled={state.loading || state.page <= 1}
            onClick={() => goToPage(state.page - 1)}
          >
            前へ
          </button>
          <span className="page-indicator">
            {state.page} / {totalPages} ページ
          </span>
          <button
            className="page-btn"
            type="button"
            disabled={state.loading || state.page >= totalPages}
            onClick={() => goToPage(state.page + 1)}
          >
            次へ
          </button>
        </footer>
      ) : null}
    </div>
  );
}
