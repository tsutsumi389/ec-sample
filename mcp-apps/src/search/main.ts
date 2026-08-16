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

// CSS は shared → View 固有の順で読む（この順がそのままカスケードの順になる）。
// エントリ HTML 側にスタイルを直書きしないのは、両 View で共通の部分を
// shared/theme.css の1か所に保つため。
import "../shared/theme.css";
import "./search.css";

import { App } from "@modelcontextprotocol/ext-apps";

import { createBanner, fillImage, requireEl, setOptionalText } from "../shared/dom.ts";
import { formatRating, formatYen, readNumber, readString, toArg } from "../shared/format.ts";
import { connectWithHostContext } from "../shared/host.ts";
import { openPageInHost } from "../shared/openLink.ts";
import {
  extractErrorMessage,
  extractSearchUiItems,
  extractStructuredContent,
  type ToolResult,
} from "../shared/toolResult.ts";
import {
  SORT_KEYS,
  type ProductBrief,
  type ProductSearchResult,
  type SearchProductsArgs,
  type SearchUiItem,
  type SortKey,
} from "../shared/types.ts";

const DEFAULT_SORT: SortKey = "recommended";
const DEFAULT_LIMIT = 10;

/** shared/dom.ts の requireEl に、この View のエントリ HTML 名を固定しただけの別名。 */
const el = <T extends HTMLElement = HTMLElement>(id: string): T => requireEl<T>(id, "search.html");

// 型引数を付けるのは value / disabled を触る4つだけ。残りは textContent / hidden しか
// 使わないので HTMLElement のままにする（付けても検査は増えず、HTML を直したときに
// 真であり続けさせる約束だけが増える）。
const els = {
  app: el("app"),
  title: el("result-title"),
  sortSelect: el<HTMLSelectElement>("sort-select"),
  note: el("note"),
  refreshError: el("refresh-error"),
  refreshErrorText: el("refresh-error-text"),
  refreshErrorDismiss: el<HTMLButtonElement>("refresh-error-dismiss"),
  loadingState: el("loading-state"),
  initialErrorState: el("initial-error-state"),
  initialErrorText: el("initial-error-text"),
  initialErrorRetry: el<HTMLButtonElement>("initial-error-retry"),
  emptyState: el("empty-state"),
  grid: el("grid"),
  pagination: el("pagination"),
  prevBtn: el<HTMLButtonElement>("prev-btn"),
  nextBtn: el<HTMLButtonElement>("next-btn"),
  pageIndicator: el("page-indicator"),
};

/** 再検索・リンク開放の失敗を重ねて出すバナー（全面エラーとは領域が重ならない）。 */
const refreshError = createBanner(els.refreshError, els.refreshErrorText);

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
  /**
   * 直近成功時の総ページ数。「前へ / 次へ」を押せるかの判定にしか使わない。
   * **結果そのもの（ProductSearchResult）を抱えないこと**——欲しいのはこの1つの数で、
   * 保持すると「いつまで有効なキャッシュなのか」を読み手に考えさせる。
   */
  totalPages: number;
  hasResult: boolean;
  loading: boolean;
}

// 再検索では query / category / min_price / max_price はツールの初回引数
// （ontoolinput で受け取る）から一切変えない。ontoolresult / callServerTool の
// 戻り値にはこれらが含まれないため、ここが再検索の唯一の土台になる。
// sort / page / limit / totalPages は「直近成功した検索」の値（= 画面に実際に出ている
// 内容）を表す。再検索が失敗しても書き換えない（resetControlsToConfirmed 参照）。
const state: SearchState = {
  base: { query: undefined, category: undefined, minPrice: undefined, maxPrice: undefined },
  sort: DEFAULT_SORT,
  page: 1,
  limit: DEFAULT_LIMIT,
  totalPages: 1,
  // 一度でも結果（成功・失敗いずれか）を受け取ったか。
  // **実装は renderResult（= 成功時）でしか true にしない。** 上の一文は移植元の
  // ままだが、この非対称こそが「初回の失敗は全面エラー / 2回目以降の失敗はバナー」の
  // 分岐そのものなので、コメントに合わせて失敗時にも立てるよう「直して」はならない
  // （直すと初回失敗が全面エラーにならず、何も出ていない画面にバナーだけが出る）。
  hasResult: false,
  loading: false,
};

/** sort に使える値かどうか。ホストが知らない並び順を寄越したら既定へ落とす。 */
function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && (SORT_KEYS as readonly string[]).includes(value);
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
  els.prevBtn.disabled = state.page <= 1;
  els.nextBtn.disabled = state.page >= state.totalPages;
}

/**
 * 一度も結果を描けていないときの全面エラー。
 * **バナー（refreshError.show）とは触る領域が重ならない**——こちらはグリッドや
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

/**
 * 失敗の見せ方を二層に振り分ける（product の View の showFailure と同じ判断）。
 *
 * - 一度も描画できていない（hasResult=false）→ 全面エラー。まだ残すべき表示が
 *   無いので、画面いっぱいに理由と再試行ボタンを出す。
 * - 既に描画済み（hasResult=true）→ グリッドはそのまま残し、バナーだけを足す。
 *
 * **この分岐を呼び出し側に書き写さないこと。** 移植直後は4か所に開いて書いてあり、
 * そのうち1か所だけ resetControlsToConfirmed() の位置が違っていた。
 */
function showFailure(message: string): void {
  resetControlsToConfirmed();
  if (state.hasResult) {
    refreshError.show(message);
  } else {
    showInitialError(message);
  }
}

function buildCard(item: ProductBrief, meta: SearchUiItem | undefined): HTMLButtonElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.dataset.purchasable = String(item.purchasable);

  const imageWrap = document.createElement("div");
  imageWrap.className = "card-image";
  // src に入れてよいのは _meta.ui 側の絶対URLだけ。structuredContent には
  // そもそも画像が入っていない（views.py の「画像は詳細ツールだけ」規律）。
  fillImage(imageWrap, meta ? meta.image_url : null);
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
  card.addEventListener("click", () => {
    if (!pageUrl) return;
    void openPageInHost({
      app,
      url: pageUrl,
      button: card,
      isLoading: () => state.loading,
      onError: refreshError.show,
    });
  });

  return card;
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
  // total が 0 なら ceil(0 / limit) = 0 なので 1 ページ扱いになる（空の検索結果でも
  // 「1 / 1 ページ」の土台は保つ）。
  state.totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  state.hasResult = true;

  els.loadingState.hidden = true;
  els.initialErrorState.hidden = true;

  els.title.textContent = state.base.query
    ? `『${state.base.query}』の検索結果 ${data.total}件`
    : `検索結果 ${data.total}件`;

  setOptionalText(els.note, data.note);

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
    els.pageIndicator.textContent = `${data.page} / ${state.totalPages} ページ`;
    els.prevBtn.disabled = data.page <= 1;
    els.nextBtn.disabled = data.page >= state.totalPages;
    els.pagination.hidden = false;
  }

  els.sortSelect.value = state.sort;
  els.sortSelect.disabled = false;
}

function handleToolResult(result: ToolResult | undefined, requestedSort: SortKey): void {
  setLoading(false);

  if (!result || result.isError) {
    showFailure(
      result
        ? extractErrorMessage(result, "検索に失敗しました。もう一度お試しください。")
        : "検索結果を受け取れませんでした。",
    );
    return;
  }

  const data = extractStructuredContent<ProductSearchResult>(result);
  if (!data) {
    showFailure("検索結果の形式が不正です。");
    return;
  }

  refreshError.hide();
  renderResult(data, extractSearchUiItems(result), requestedSort);
}

async function doSearch(sortValue: SortKey, pageValue: number): Promise<void> {
  if (state.loading) return; // 多重送信を避ける
  refreshError.hide();
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
    showFailure("通信エラーが発生しました。もう一度お試しください。");
  }
}

// ---- イベント配線 -------------------------------------------------------

els.sortSelect.addEventListener("change", () => {
  // option は search.html に書いた5つだけなので、実際に DEFAULT_SORT へ落ちることは
  // 無い。それでも isSortKey を通すのは、ツール引数へ渡る値の型を SortKey 1本に
  // 保つため（string のまま持ち回すと、どこからでも知らない並び順を入れられる）。
  const requested = isSortKey(els.sortSelect.value) ? els.sortSelect.value : DEFAULT_SORT;
  void doSearch(requested, 1); // 並び替えを変えたら 1 ページ目に戻す
});
els.prevBtn.addEventListener("click", () => {
  if (state.page > 1) void doSearch(state.sort, state.page - 1);
});
els.nextBtn.addEventListener("click", () => {
  void doSearch(state.sort, state.page + 1);
});
els.initialErrorRetry.addEventListener("click", () => {
  void doSearch(state.sort, state.page);
});
els.refreshErrorDismiss.addEventListener("click", () => refreshError.hide());

// ---- App 初期化 ----------------------------------------------------------
// ハンドラは必ず connect() より前に登録する。tool-input / tool-result /
// tool-cancelled は一度きりの通知なので、connect() 解決後に登録すると
// 取りこぼす（SDK 自身が _assertHandlerTiming で警告・例外を出す設計になっている）。
// connect() は末尾の connectWithHostContext が呼ぶので、**この3つはそれより前**。
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
  state.page = readNumber(args.page) ?? 1;
  state.limit = readNumber(args.limit) ?? DEFAULT_LIMIT;
  els.sortSelect.value = state.sort;
  setLoading(true); // ui/notifications/tool-result が届くまで操作不可にする
};

app.ontoolresult = (result) => {
  handleToolResult(result, state.sort);
};

app.ontoolcancelled = (params) => {
  setLoading(false);
  showFailure(
    params && params.reason ? `検索が中断されました（${params.reason}）。` : "検索が中断されました。",
  );
};

// テーマ・safe area の配線と connect()。**必ず最後に呼ぶ**（上の3ハンドラの登録が
// connect() より前でなければならないため。理由は shared/host.ts のコメント）。
connectWithHostContext(app, els.app, "search-products view", showInitialError);
