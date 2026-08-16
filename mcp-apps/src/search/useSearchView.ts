/**
 * 検索結果カード一覧の状態と、ホスト（MCP Apps SDK）との配線。
 *
 * **画面の形は SearchView.tsx、判断はこのファイル**という分担にしてある。
 * ただし「判断」と言っても、購入可否の理由（availability）も価格帯の申し送り（note）も
 * サーバーが完成文で寄越すものをそのまま出すだけで、**文言を組み立て直す処理は
 * ここにも一切書かない**（同じ判断が backend の services/cart.py と二重になり、
 * 必ず片方が古くなる）。ここが持つのは「読み込み中か」「一度でも描けたか」
 * 「失敗をどちらの層に出すか」だけ。
 */

import { useCallback, useEffect, useReducer, useRef, type RefObject } from "react";

// **SDK は必ず `/react` エントリから import する。** `@modelcontextprotocol/ext-apps`
// （ルート）と `/react` は**それぞれが App クラスの実体を持つ別々のバンドル**で、
// 両方から import すると同じクラスが2つ入る（バンドルが 33KB 増え、`instanceof` が
// 食い違う）。`/react` はルートの中身を丸ごと再エクスポートしているので、
// 型も値もこちら1本で足りる。
import { useApp, useHostStyles, type App } from "@modelcontextprotocol/ext-apps/react";

import { readNumber, readString, toArg } from "../shared/format.ts";
import { useSafeAreaInsets } from "../shared/host.ts";
import { openPageInHost } from "../shared/openLink.ts";
import {
  extractErrorMessage,
  extractSearchUiItems,
  extractStructuredContent,
  type ToolResult,
} from "../shared/toolResult.ts";
import {
  SORT_KEYS,
  type ProductSearchResult,
  type SearchProductsArgs,
  type SearchUiItem,
  type SortKey,
} from "../shared/types.ts";

const DEFAULT_SORT: SortKey = "recommended";
const DEFAULT_LIMIT = 10;

/** 再検索のたびに据え置く検索条件（ツールの初回引数から取る）。 */
interface SearchBase {
  query: string | undefined;
  category: string | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
}

export interface SearchState {
  /**
   * 再検索では query / category / min_price / max_price をツールの初回引数
   * （toolinput で受け取る）から一切変えない。toolresult / callServerTool の
   * 戻り値にはこれらが含まれないため、ここが再検索の唯一の土台になる。
   */
  base: SearchBase;
  /** 「直近成功した検索」の並び順（= 画面に実際に出ている内容）。失敗では書き換えない。 */
  sort: SortKey;
  page: number;
  limit: number;
  loading: boolean;
  /**
   * 直近成功時の結果。**null であることが「まだ一度も描けていない」の唯一の表現**で、
   * これが「初回の失敗は全面エラー / 2回目以降の失敗はバナー」の分岐そのもの
   * （移植前の hasResult フラグに相当する）。失敗では絶対に null へ戻さないこと——
   * 戻すと、一度描けた画面が再検索の失敗で消え、戻る先が無くなる。
   */
  result: ProductSearchResult | null;
  /**
   * 直近成功時の _meta.ui.items を id で引ける形にしたもの。
   * **突き合わせは必ず id で行う**（配列の添字で対応づけない。理由は indexUiItems）。
   */
  uiItems: ReadonlyMap<number, SearchUiItem>;
  /** 二層のうち上側（今の表示を残したまま重ねる）。 */
  banner: string | null;
  /** 二層のうち下側（表示を消して再試行だけを残す全面エラー）。 */
  initialError: string | null;
  /** 商品ページを開いている最中のカードの商品ID。そのカードだけを押せなくする。 */
  openingId: number | null;
}

type SearchAction =
  | { type: "tool-input"; base: SearchBase; sort: SortKey; page: number; limit: number }
  | { type: "request" }
  | { type: "result"; data: ProductSearchResult; uiItems: SearchUiItem[]; sort: SortKey }
  | { type: "failure"; message: string }
  | { type: "initial-error"; message: string }
  | { type: "dismiss-banner" }
  | { type: "open-start"; id: number }
  | { type: "open-end"; message: string | null };

/**
 * 起動直後は **loading: true** から始める。ホストから tool-input も tool-result も
 * 届いていない時点では、並び替えも再試行も押させてはならない（移植前はエントリ HTML の
 * `<select id="sort-select" disabled>` がこの役目を持っていた。骨組みが React へ移った
 * 以上、初期状態の側で表現する）。
 */
const INITIAL_STATE: SearchState = {
  base: { query: undefined, category: undefined, minPrice: undefined, maxPrice: undefined },
  sort: DEFAULT_SORT,
  page: 1,
  limit: DEFAULT_LIMIT,
  loading: true,
  result: null,
  uiItems: new Map(),
  banner: null,
  initialError: null,
  openingId: null,
};

/**
 * _meta.ui.items を id で引ける形にする。
 *
 * **突き合わせは id で行う。** backend（ui_assets.build_search_ui_items）は
 * structuredContent.items と同じ順序で組んでくれるが、順序に依存した対応づけ
 * （配列の添字）にすると、片方の並びが変わった日に「別の商品の画像とリンクを
 * 貼ったカード」が黙って出来上がる。
 */
function indexUiItems(items: SearchUiItem[]): ReadonlyMap<number, SearchUiItem> {
  const byId = new Map<number, SearchUiItem>();
  for (const entry of items) {
    if (entry && typeof entry.id !== "undefined") byId.set(entry.id, entry);
  }
  return byId;
}

function reducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case "tool-input":
      return {
        ...state,
        base: action.base,
        sort: action.sort,
        page: action.page,
        limit: action.limit,
        loading: true, // tool-result が届くまで操作不可にする
      };

    case "request":
      return { ...state, loading: true, banner: null };

    // 状態が確定するのは成功したこの時点だけ。**失敗では sort / page / limit を
    // 書き換えない**——これが「操作系の見た目は直近成功時のまま」を成立させている
    // （移植前は resetControlsToConfirmed() が DOM を巻き戻していた仕事で、
    // <select> が state.sort で制御されている今は書き換えないだけで足りる）。
    case "result":
      return {
        ...state,
        loading: false,
        sort: action.sort,
        page: action.data.page,
        limit: action.data.limit,
        result: action.data,
        uiItems: indexUiItems(action.uiItems),
        banner: null,
        initialError: null,
      };

    // 失敗の見せ方を二層に振り分ける唯一の場所。**呼び出し側に書き写さないこと**——
    // 移植前は4か所に開いて書いてあり、そのうち1か所だけ操作系の戻し方が違っていた。
    case "failure":
      return state.result !== null
        ? { ...state, loading: false, banner: action.message }
        : { ...state, loading: false, initialError: action.message };

    // 接続そのものの失敗。**loading を false へ落とすこと**——落とさないと全面エラーの
    // 再試行ボタンが disabled のままになり、利用者に何も残らない（接続が失敗した時点で
    // 待っている通信は無い）。
    case "initial-error":
      return { ...state, loading: false, initialError: action.message };

    case "dismiss-banner":
      return { ...state, banner: null };

    case "open-start":
      return { ...state, openingId: action.id };

    // 開くのに失敗したときだけバナーを出す。**成功（message === null）で既存の
    // バナーを消さないこと**——別の理由で出ている申し送りを、無関係な操作の成功で
    // 掃除してしまう。
    case "open-end":
      return { ...state, openingId: null, banner: action.message ?? state.banner };
  }
}

/** sort に使える値かどうか。ホストが知らない並び順を寄越したら既定へ落とす。 */
function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && (SORT_KEYS as readonly string[]).includes(value);
}

export interface SearchView {
  state: SearchState;
  /** 直近成功時の総ページ数。result からの派生値なので状態には持たない。 */
  totalPages: number;
  /** ホストの safe area を受ける要素（#app）に付ける ref。 */
  appElRef: RefObject<HTMLDivElement>;
  changeSort: (value: string) => void;
  goToPage: (page: number) => void;
  retry: () => void;
  dismissBanner: () => void;
  openPage: (productId: number) => void;
}

export function useSearchView(): SearchView {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const appElRef = useRef<HTMLDivElement>(null);

  /**
   * 最新の state をホストのイベントと非同期処理から読むための写し。
   *
   * **これが要るのは、ホストの購読（toolinput / toolresult / toolcancelled）が
   * マウント時に一度だけ登録され、以後差し替えられないため。** 登録時のクロージャは
   * 初期状態を閉じ込めているので、`state` を直接読むと「1回目の検索の並び順」を
   * 永久に使い続ける。書き込みを effect に置いてあるのは描画中に ref を書き換えない
   * ためで、React は次の discrete イベントを処理する前に passive effect を流すので、
   * クリックやセレクト操作から読む値が古いことは無い。
   */
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const handleToolResult = useCallback(
    (result: ToolResult | undefined, requestedSort: SortKey): void => {
      if (!result || result.isError) {
        dispatch({
          type: "failure",
          message: result
            ? extractErrorMessage(result, "検索に失敗しました。もう一度お試しください。")
            : "検索結果を受け取れませんでした。",
        });
        return;
      }

      const data = extractStructuredContent<ProductSearchResult>(result);
      if (!data) {
        dispatch({ type: "failure", message: "検索結果の形式が不正です。" });
        return;
      }

      dispatch({ type: "result", data, uiItems: extractSearchUiItems(result), sort: requestedSort });
    },
    [],
  );

  /**
   * ホストからの通知の購読。**useApp が App を作った直後・connect() を呼ぶ前に**
   * 一度だけ呼ばれる（onAppCreated）。
   *
   * **この締切は守らなければならない。** tool-input / tool-result / tool-cancelled は
   * 一度きりの通知で、connect() が ui/initialize を終えた後に登録すると取りこぼす
   * （SDK 自身が _assertHandlerTiming で警告・例外を出す設計になっている）。
   * 手で `new App()` して connect() する形に戻すと、この順序を自分で守り続ける必要が
   * 生まれる——useApp を使う理由の半分はそこにある。
   */
  const registerHandlers = useCallback(
    (app: App): void => {
      app.addEventListener("toolinput", (params) => {
        const args = params?.arguments ?? {};
        dispatch({
          type: "tool-input",
          base: {
            query: readString(args.query),
            category: readString(args.category),
            minPrice: readNumber(args.min_price),
            maxPrice: readNumber(args.max_price),
          },
          sort: isSortKey(args.sort) ? args.sort : DEFAULT_SORT,
          page: readNumber(args.page) ?? 1,
          limit: readNumber(args.limit) ?? DEFAULT_LIMIT,
        });
      });

      app.addEventListener("toolresult", (result) => {
        handleToolResult(result, stateRef.current.sort);
      });

      app.addEventListener("toolcancelled", (params) => {
        dispatch({
          type: "failure",
          message: params?.reason
            ? `検索が中断されました（${params.reason}）。`
            : "検索が中断されました。",
        });
      });

      app.onerror = (err) => {
        console.error("[search-products view] transport error", err);
      };
    },
    [handleToolResult],
  );

  // capabilities は空、autoResize は既定（true）のまま。**autoResize を明示的に
  // false にしないこと**——ResizeObserver による高さのホストへの通知がこれで付く。
  const { app, error } = useApp({
    appInfo: { name: "search-products-view", version: "1.0.0" },
    capabilities: {},
    onAppCreated: registerHandlers,
  });

  // テーマ・CSS 変数・フォントの適用は SDK に任せる。safe area だけは
  // useHostStyles が扱わないので、こちらで #app に載せる（shared/host.ts）。
  useHostStyles(app, app?.getHostContext());
  useSafeAreaInsets(app, appElRef);

  useEffect(() => {
    if (error === null) return;
    console.error("[search-products view] connect failed", error);
    dispatch({ type: "initial-error", message: "ホストとの接続に失敗しました。" });
  }, [error]);

  // ---- 画面からの操作 ----------------------------------------------------

  const doSearch = useCallback(
    async (sortValue: SortKey, pageValue: number): Promise<void> => {
      const current = stateRef.current;
      // app が null なのは接続が終わるまで。ツールは撃てないので何もしない。
      if (app === null || current.loading) return; // 多重送信を避ける
      dispatch({ type: "request" });
      // toArg は空文字・undefined・null を「指定なし」として落とすが、**0 は落とさない**
      // （min_price=0 は有効な指定）。`||` や `??` に書き換えると壊れる。
      const args = {
        query: toArg(current.base.query),
        category: toArg(current.base.category),
        min_price: toArg(current.base.minPrice),
        max_price: toArg(current.base.maxPrice),
        sort: sortValue,
        page: pageValue,
        limit: current.limit,
        // satisfies にしてあるのは、callServerTool の arguments が
        // Record<string, unknown> を要求するため（interface 型の値は暗黙の
        // インデックスシグネチャを持たず、そのままでは渡せない）。型の検査は効かせつつ、
        // 推論される型はオブジェクトリテラルのままにする。
      } satisfies SearchProductsArgs;
      try {
        const result = await app.callServerTool({ name: "search_products", arguments: args });
        handleToolResult(result, sortValue);
      } catch {
        dispatch({ type: "failure", message: "通信エラーが発生しました。もう一度お試しください。" });
      }
    },
    [app, handleToolResult],
  );

  const changeSort = useCallback(
    (value: string): void => {
      // option は SearchView.tsx に書いた5つだけなので、実際に DEFAULT_SORT へ落ちる
      // ことは無い。それでも isSortKey を通すのは、ツール引数へ渡る値の型を SortKey
      // 1本に保つため（string のまま持ち回すと、どこからでも知らない並び順を入れられる）。
      void doSearch(isSortKey(value) ? value : DEFAULT_SORT, 1); // 並び替えたら1ページ目へ
    },
    [doSearch],
  );

  const goToPage = useCallback(
    (page: number): void => {
      void doSearch(stateRef.current.sort, page);
    },
    [doSearch],
  );

  const retry = useCallback((): void => {
    const current = stateRef.current;
    void doSearch(current.sort, current.page);
  }, [doSearch]);

  const dismissBanner = useCallback((): void => {
    dispatch({ type: "dismiss-banner" });
  }, []);

  const openPage = useCallback(
    (productId: number): void => {
      const meta = stateRef.current.uiItems.get(productId);
      // page_url を持たないカード（_meta.ui が届かなかった場合）は押しても何もしない。
      if (app === null || meta === undefined) return;
      void (async () => {
        dispatch({ type: "open-start", id: productId });
        dispatch({ type: "open-end", message: await openPageInHost(app, meta.page_url) });
      })();
    },
    [app],
  );

  // total が 0 なら ceil(0 / limit) = 0 なので 1 ページ扱いになる（空の検索結果でも
  // 「1 / 1 ページ」の土台は保つ）。
  const totalPages =
    state.result !== null ? Math.max(1, Math.ceil(state.result.total / state.result.limit)) : 1;

  return { state, totalPages, appElRef, changeSort, goToPage, retry, dismissBanner, openPage };
}
