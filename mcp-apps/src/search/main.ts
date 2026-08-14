/**
 * 検索結果カード一覧の View（backend が ui://hibino/search-products.html として配る中身）。
 *
 * ホストが search_products を呼ぶと、その structuredContent と _meta.ui がこの画面に
 * 届く。並び替え・ページング・再試行では、この画面から同じツールを
 * callServerTool("search_products") で撃ち直す。
 *
 * **判断はここに一切持たない。** 購入可否の理由（availability）も価格帯の申し送り
 * （note）もサーバーが完成文で寄越すものをそのまま出す。文言を組み立て直すと同じ判断が
 * backend（services/cart.py）と二重になり、必ず片方が古くなる。
 *
 * ---- SDK の読み込みについて（移植で変わった点） ----
 * SDK は npm の @modelcontextprotocol/ext-apps から import する。移植前は vendor した
 * バンドルを backend の ui_assets.build_app_html() が HTML へ差し込み、この画面は
 * globalThis.__McpAppSdk からそれを取り出していた。そのため「バンドルが差し込まれて
 * いない／壊れている」場合の保険として、body に「この画面の読み込みに失敗しました。」
 * とだけ出して止まる分岐を持っていた。
 * **その分岐は移植で削除した。** import が解決できなければバンドル自体が出来上がらず、
 * この画面が配信されることも無いので、構造的に到達不能になったため。壊れた成果物を
 * 作らない責任は mcp-apps/scripts/check-dist.ts が、dist が読めないときに UI を諦めて
 * 素のツール登録へ落ちる責任は backend の ui_assets.py + apps_ui.register_fallback() が
 * 引き続き持っている。
 */

/// <reference types="vite/client" />

// CSS は shared → View 固有の順で読む（この順がそのままカスケードの順になる）。
// エントリ HTML 側にスタイルを直書きしないのは、両 View で共通の部分を
// shared/theme.css の1か所に保つため。
import "../shared/theme.css";
import "./search.css";

import { App } from "@modelcontextprotocol/ext-apps";

import { formatRating, formatYen, toArg } from "../shared/format.ts";
import { applyHostContext } from "../shared/host.ts";
import {
  extractErrorMessage,
  extractSearchUiItems,
  extractStructuredContent,
  type ToolResult,
} from "../shared/toolResult.ts";
import type {
  ProductBrief,
  ProductSearchResult,
  SearchProductsArgs,
  SearchUiItem,
  SortKey,
} from "../shared/types.ts";

const DEFAULT_SORT: SortKey = "recommended";
const DEFAULT_LIMIT = 10;
const KNOWN_SORTS = ["newest", "price_asc", "price_desc", "rating", "recommended"] as const;

/**
 * 要素の取り出し。**キャストはこの1か所に閉じてある。**
 *
 * getElementById は HTMLElement までしか教えてくれないので、value / disabled を触る
 * ために具体的な型へ絞る必要がある。id が無ければここで落ちる——「なぜか一部だけ
 * 描画されない」形で気づけないより、エントリ HTML と食い違った瞬間に止まるほうがよい。
 * 要素の種類の食い違い（<select> のつもりが別の要素だった等）までは実行時に検査して
 * いないが、エントリ HTML は同じビルドで一緒に組まれる search.html 1枚だけなので、
 * ここがずれるのは書き換えた直後にしか起こらない。
 */
function pick<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`search.html に #${id} がありません。`);
  }
  return found as T;
}

const els = {
  app: pick<HTMLDivElement>("app"),
  title: pick<HTMLHeadingElement>("result-title"),
  sortSelect: pick<HTMLSelectElement>("sort-select"),
  note: pick<HTMLParagraphElement>("note"),
  refreshError: pick<HTMLDivElement>("refresh-error"),
  refreshErrorText: pick<HTMLSpanElement>("refresh-error-text"),
  refreshErrorDismiss: pick<HTMLButtonElement>("refresh-error-dismiss"),
  loadingState: pick<HTMLParagraphElement>("loading-state"),
  initialErrorState: pick<HTMLDivElement>("initial-error-state"),
  initialErrorText: pick<HTMLParagraphElement>("initial-error-text"),
  initialErrorRetry: pick<HTMLButtonElement>("initial-error-retry"),
  emptyState: pick<HTMLParagraphElement>("empty-state"),
  grid: pick<HTMLDivElement>("grid"),
  pagination: pick<HTMLElement>("pagination"),
  prevBtn: pick<HTMLButtonElement>("prev-btn"),
  nextBtn: pick<HTMLButtonElement>("next-btn"),
  pageIndicator: pick<HTMLSpanElement>("page-indicator"),
};

/** 再検索のたびに据え置く検索条件（ツールの初回引数から取る）。 */
interface SearchBase {
  query: string | undefined;
  category: string | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
}

interface SearchState {
  base: SearchBase;
  sort: SortKey;
  page: number;
  limit: number;
  /** 直近成功時の structuredContent（{items,total,page,limit,note}）。 */
  lastGood: ProductSearchResult | null;
  hasResult: boolean;
  loading: boolean;
}

// 再検索では query / category / min_price / max_price はツールの初回引数
// （ontoolinput で受け取る）から一切変えない。ontoolresult / callServerTool の
// 戻り値にはこれらが含まれないため、ここが再検索の唯一の土台になる。
// sort / page / limit は「直近成功した検索」の値（= 画面に実際に出ている内容）を
// 表す。再検索が失敗しても書き換えない（resetControlsToConfirmed 参照）。
const state: SearchState = {
  base: { query: undefined, category: undefined, minPrice: undefined, maxPrice: undefined },
  sort: DEFAULT_SORT,
  page: 1,
  limit: DEFAULT_LIMIT,
  lastGood: null,
  // 一度でも結果（成功・失敗いずれか）を受け取ったか。
  // **実装は renderResult（= 成功時）でしか true にしない。** 上の一文は移植元の
  // ままだが、この非対称こそが「初回の失敗は全面エラー / 2回目以降の失敗はバナー」の
  // 分岐そのものなので、コメントに合わせて失敗時にも立てるよう「直して」はならない
  // （直すと初回失敗が全面エラーにならず、何も出ていない画面にバナーだけが出る）。
  hasResult: false,
  loading: false,
};

/**
 * ツール引数から文字列だけを受け取る（型が違えば「指定なし」として落とす）。
 *
 * 引数は backend 側（tools.search_products のシグネチャ）で検証済みなので、実際には
 * string 以外が届くことは無い。それでも素通しにしないのは、ontoolinput が渡してくる
 * のが Record<string, unknown> であり、**中身を確かめずに信じると型の上だけ安全な
 * 嘘になる**ため。移植元は query / category を素通ししていた（sort / page / limit は
 * 当時から型を見ていた）ので、そこだけ扱いを揃えた。
 */
function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** 同上、数値版（min_price / max_price）。 */
function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** sort に使える値かどうか。ホストが知らない並び順を寄越したら既定へ落とす。 */
function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && (KNOWN_SORTS as readonly string[]).includes(value);
}

function setLoading(loading: boolean): void {
  state.loading = loading;
  els.sortSelect.disabled = loading;
  els.prevBtn.disabled = loading;
  els.nextBtn.disabled = loading;
  els.initialErrorRetry.disabled = loading;
  els.grid.dataset.loading = loading ? "true" : "false";
}

// 再検索・リンク開放が失敗したときに、操作系の見た目を「直近成功時」の状態へ
// 戻す。グリッドの中身自体は触らない（触らないことが「元の表示に戻す」の実体）。
function resetControlsToConfirmed(): void {
  // <select> は change の時点で DOM 側の値が既に変わっている。再検索が失敗しても
  // state.sort は更新していないので、ここで DOM を確定済みの値へ巻き戻す。この1行が
  // 無いと「表示は旧ソート・セレクトは新ソート」の食い違いが残る。
  els.sortSelect.value = state.sort;
  els.sortSelect.disabled = false;
  els.initialErrorRetry.disabled = false;
  const totalPages = state.lastGood
    ? Math.max(1, Math.ceil(state.lastGood.total / state.lastGood.limit))
    : 1;
  els.prevBtn.disabled = state.page <= 1;
  els.nextBtn.disabled = state.page >= totalPages;
}

function renderNote(note: string | null): void {
  if (note) {
    els.note.textContent = note;
    els.note.hidden = false;
  } else {
    els.note.hidden = true;
    els.note.textContent = "";
  }
}

function showRefreshError(message: string): void {
  els.refreshErrorText.textContent = message;
  els.refreshError.hidden = false;
}

function hideRefreshError(): void {
  els.refreshError.hidden = true;
  els.refreshErrorText.textContent = "";
}

/**
 * 一度も結果を描けていないときの全面エラー。
 * **バナー（showRefreshError）とは触る領域が重ならない**——こちらはグリッドや
 * ページングを消して再試行だけを残し、あちらは今出ている表示を残したまま上に重ねる。
 * 片方がもう片方の領域を触り始めると、この二層の意味が崩れる。
 */
function showInitialError(message: string): void {
  els.loadingState.hidden = true;
  els.emptyState.hidden = true;
  els.grid.hidden = true;
  els.pagination.hidden = true;
  els.initialErrorText.textContent = message;
  els.initialErrorState.hidden = false;
}

function buildCard(item: ProductBrief, meta: SearchUiItem | undefined): HTMLButtonElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.dataset.purchasable = String(item.purchasable);

  const imageWrap = document.createElement("div");
  imageWrap.className = "card-image";
  if (meta && meta.image_url) {
    const img = document.createElement("img");
    // src に入れてよいのは _meta.ui 側の絶対URLだけ。structuredContent には
    // そもそも画像が入っていない（views.py の「画像は詳細ツールだけ」規律）。
    img.src = meta.image_url;
    // 商品名はこの下に別途テキストで出るので、ここは装飾画像として alt を空にする。
    img.alt = "";
    img.loading = "lazy";
    imageWrap.appendChild(img);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "placeholder";
    placeholder.textContent = "画像なし";
    imageWrap.appendChild(placeholder);
  }
  card.appendChild(imageWrap);

  const body = document.createElement("div");
  body.className = "card-body";

  if (item.category) {
    const category = document.createElement("span");
    category.className = "card-category";
    // 商品名・カテゴリ名は未信頼のテキストとして扱い、必ず textContent で入れる。
    category.textContent = item.category;
    body.appendChild(category);
  }

  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = item.name;
  body.appendChild(name);

  const priceRow = document.createElement("div");
  priceRow.className = "card-price-row";
  const price = document.createElement("span");
  price.className = "card-price";
  price.textContent = formatYen(item.effective_price);
  priceRow.appendChild(price);
  if (item.list_price != null) {
    const listPrice = document.createElement("span");
    listPrice.className = "card-list-price";
    listPrice.textContent = formatYen(item.list_price);
    priceRow.appendChild(listPrice);
  }
  body.appendChild(priceRow);

  const rating = document.createElement("span");
  rating.className = "card-rating";
  rating.textContent = formatRating(item.avg_rating, item.review_count);
  body.appendChild(rating);

  // availability は「購入できます」/ 買えない理由の完成文がサーバーから来る。
  // 理由をここで組み立て直さない（CLAUDE.md の規律をそのまま踏襲）。
  const availability = document.createElement("span");
  availability.className = "card-availability";
  availability.dataset.ok = String(item.purchasable);
  availability.textContent = item.availability;
  body.appendChild(availability);

  card.appendChild(body);

  const pageUrl = meta ? meta.page_url : null;
  card.addEventListener("click", () => openProductPage(pageUrl, card));

  return card;
}

async function openProductPage(url: string | null, triggerButton: HTMLButtonElement): Promise<void> {
  if (!url) return;
  triggerButton.disabled = true;
  try {
    const { isError } = await app.openLink({ url });
    if (isError) {
      showRefreshError("商品ページを開けませんでした。");
    }
  } catch {
    showRefreshError("商品ページを開く操作に失敗しました。");
  } finally {
    // **false 固定にしないこと。** リンクを開いている間に別の再検索が始まっていた
    // 場合、無条件に有効化すると読み込み中なのにこのカードだけ押せる状態になる。
    triggerButton.disabled = state.loading;
  }
}

function renderResult(
  data: ProductSearchResult,
  uiItems: SearchUiItem[],
  requestedSort: SortKey,
): void {
  // 状態が確定するのは成功したこの時点だけ。失敗しても書き換えないことが
  // resetControlsToConfirmed の前提になっている。
  state.sort = requestedSort;
  state.page = data.page;
  state.limit = data.limit;
  state.lastGood = data;
  state.hasResult = true;

  els.loadingState.hidden = true;
  els.initialErrorState.hidden = true;

  els.title.textContent = state.base.query
    ? `『${state.base.query}』の検索結果 ${data.total}件`
    : `検索結果 ${data.total}件`;

  renderNote(data.note);

  // **突き合わせは id で行う。** backend（ui_assets.build_search_ui_items）は
  // structuredContent.items と同じ順序で組んでくれるが、順序に依存した対応づけ
  // （配列の添字）にすると、片方の並びが変わった日に「別の商品の画像とリンクを
  // 貼ったカード」が黙って出来上がる。
  const metaById = new Map<number, SearchUiItem>();
  for (const entry of uiItems) {
    if (entry && typeof entry.id !== "undefined") metaById.set(entry.id, entry);
  }

  els.grid.textContent = ""; // innerHTML は使わず子要素を作り直す

  if (data.items.length === 0) {
    els.emptyState.hidden = false;
    els.grid.hidden = true;
    els.pagination.hidden = true;
  } else {
    els.emptyState.hidden = true;
    els.grid.hidden = false;
    for (const item of data.items) {
      els.grid.appendChild(buildCard(item, metaById.get(item.id)));
    }
    const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
    els.pageIndicator.textContent = `${data.page} / ${totalPages} ページ`;
    els.prevBtn.disabled = data.page <= 1;
    els.nextBtn.disabled = data.page >= totalPages;
    els.pagination.hidden = false;
  }

  els.sortSelect.value = state.sort;
  els.sortSelect.disabled = false;
}

function handleToolResult(result: ToolResult | undefined, requestedSort: SortKey): void {
  setLoading(false);

  if (!result || result.isError) {
    const message = result
      ? extractErrorMessage(result, "検索に失敗しました。もう一度お試しください。")
      : "検索結果を受け取れませんでした。";
    if (state.hasResult) {
      resetControlsToConfirmed();
      showRefreshError(message);
    } else {
      showInitialError(message);
    }
    return;
  }

  const data = extractStructuredContent<ProductSearchResult>(result);
  if (!data) {
    const message = "検索結果の形式が不正です。";
    if (state.hasResult) {
      resetControlsToConfirmed();
      showRefreshError(message);
    } else {
      showInitialError(message);
    }
    return;
  }

  hideRefreshError();
  renderResult(data, extractSearchUiItems(result), requestedSort);
}

async function doSearch(sortValue: SortKey, pageValue: number): Promise<void> {
  if (state.loading) return; // 多重送信を避ける
  hideRefreshError();
  setLoading(true);
  // toArg は空文字・undefined・null を「指定なし」として落とすが、**0 は落とさない**
  // （min_price=0 は有効な指定）。`||` や `??` に書き換えると壊れる。
  const args = {
    query: toArg(state.base.query),
    category: toArg(state.base.category),
    min_price: toArg(state.base.minPrice),
    max_price: toArg(state.base.maxPrice),
    sort: sortValue,
    page: pageValue,
    limit: state.limit,
    // satisfies にしてあるのは、callServerTool の arguments が
    // Record<string, unknown> を要求するため（interface 型の値は暗黙の
    // インデックスシグネチャを持たず、そのままでは渡せない）。型の検査は効かせつつ、
    // 推論される型はオブジェクトリテラルのままにする。
  } satisfies SearchProductsArgs;
  try {
    const result = await app.callServerTool({ name: "search_products", arguments: args });
    handleToolResult(result, sortValue);
  } catch {
    setLoading(false);
    resetControlsToConfirmed();
    const message = "通信エラーが発生しました。もう一度お試しください。";
    if (state.hasResult) {
      showRefreshError(message);
    } else {
      showInitialError(message);
    }
  }
}

// ---- イベント配線 -------------------------------------------------------

els.sortSelect.addEventListener("change", () => {
  // option は search.html に書いた5つだけなので、実際に DEFAULT_SORT へ落ちることは
  // 無い。それでも isSortKey を通すのは、ツール引数へ渡る値の型を SortKey 1本に
  // 保つため（string のまま持ち回すと、どこからでも知らない並び順を入れられる）。
  const requested = isSortKey(els.sortSelect.value) ? els.sortSelect.value : DEFAULT_SORT;
  doSearch(requested, 1); // 並び替えを変えたら 1 ページ目に戻す
});
els.prevBtn.addEventListener("click", () => {
  if (state.page > 1) doSearch(state.sort, state.page - 1);
});
els.nextBtn.addEventListener("click", () => {
  doSearch(state.sort, state.page + 1);
});
els.initialErrorRetry.addEventListener("click", () => {
  doSearch(state.sort, state.page);
});
els.refreshErrorDismiss.addEventListener("click", hideRefreshError);

// ---- App 初期化 ----------------------------------------------------------
// ハンドラは必ず connect() より前に登録する。tool-input / tool-result /
// tool-cancelled は一度きりの通知なので、connect() 解決後に登録すると
// 取りこぼす（SDK 自身が _assertHandlerTiming で警告・例外を出す設計になっている）。
//
// 第2・第3引数（capabilities / options）は渡さない。options の既定が
// { autoResize: true } で、ResizeObserver による高さのホストへの通知がこれで付く。
// 渡して上書きすると、その既定ごと失う。

const app = new App({ name: "search-products-view", version: "1.0.0" });

app.ontoolinput = (params) => {
  const args = params?.arguments ?? {};
  state.base = {
    query: readString(args.query),
    category: readString(args.category),
    minPrice: readNumber(args.min_price),
    maxPrice: readNumber(args.max_price),
  };
  state.sort = isSortKey(args.sort) ? args.sort : DEFAULT_SORT;
  state.page = typeof args.page === "number" ? args.page : 1;
  state.limit = typeof args.limit === "number" ? args.limit : DEFAULT_LIMIT;
  els.sortSelect.value = state.sort;
  setLoading(true); // ui/notifications/tool-result が届くまで操作不可にする
};

app.ontoolresult = (result) => {
  handleToolResult(result, state.sort);
};

app.ontoolcancelled = (params) => {
  setLoading(false);
  const message = params && params.reason
    ? `検索が中断されました（${params.reason}）。`
    : "検索が中断されました。";
  if (state.hasResult) {
    resetControlsToConfirmed();
    showRefreshError(message);
  } else {
    showInitialError(message);
  }
};

app.onhostcontextchanged = (ctx) => {
  // このコールバックが呼ばれる時点で、SDK は変更分を内部の hostContext へ
  // マージ済み（onEventDispatch）。テーマ・変数・フォント・safe area は
  // 「差分だけ」渡ってくる可能性があるため、渡ってきたフィールドだけ適用する
  // （その判断は shared/host.ts の applyHostContext が持つ）。
  applyHostContext(ctx, els.app);
};

app.onerror = (err) => {
  console.error("[search-products view] transport error", err);
};

app.connect().then(() => {
  // 初期状態はホストから通知が飛んでこない可能性があるため、connect() 解決後に
  // 手動で一度だけ getHostContext() を読んで適用する（以後の変化は
  // onhostcontextchanged が拾う）。
  applyHostContext(app.getHostContext(), els.app);
}).catch((err: unknown) => {
  console.error("[search-products view] connect failed", err);
  showInitialError("ホストとの接続に失敗しました。");
});
