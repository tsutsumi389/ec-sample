/**
 * 商品詳細パネルの状態と、ホスト（MCP Apps SDK）との配線。
 *
 * 並び替えもページングも無いので、search の View より状態は単純
 * （読み込み中／表示中／エラーの3つ）。再取得の土台になるのも product_id 1つで、
 * search 側の state.base に相当する。
 *
 * **文言を組み立てる処理はここにも一切書かない。** availability も含め、表示する
 * 日本語はサーバーが完成文で寄越したものをそのまま出す（backend の
 * services/cart.py が唯一の源）。
 */

import { useCallback, useEffect, useReducer, useRef, type RefObject } from "react";

// **SDK は必ず `/react` エントリから import する**（理由は search/useSearchView.ts の
// 同じ import のコメント。ルートと `/react` はそれぞれ App の実体を持つ別バンドル）。
import { useApp, useHostStyles, type App } from "@modelcontextprotocol/ext-apps/react";

import { readNumber } from "../shared/format.ts";
import { useSafeAreaInsets } from "../shared/host.ts";
import { openPageInHost } from "../shared/openLink.ts";
import {
  extractErrorMessage,
  extractProductUiMeta,
  extractStructuredContent,
  type ToolResult,
} from "../shared/toolResult.ts";
import type { GetProductArgs, ProductDetail, ProductUiMeta } from "../shared/types.ts";

/**
 * content から文言を取れなかったときの汎用文。
 * **サーバーが返した文言があるならそちらが常に優先される**（extractErrorMessage）。
 * get_product が存在しない product_id に返す "Product not found" は英語のまま
 * 素通しされるが、View 側で日本語に訳し直さない——訳の対応表を持つと backend が
 * 文言を足したときに View だけが古い訳を出し続ける。
 */
const FALLBACK_ERROR_MESSAGE = "商品情報を取得できませんでした。";

export interface ProductState {
  /**
   * 再取得ではツールの初回引数（toolinput で受け取る）から一切変えない。
   * toolresult / callServerTool の戻り値には product_id が含まれないため、
   * ここが「再試行」「再読み込み」双方の唯一の土台になる。
   */
  productId: number | null;
  loading: boolean;
  /**
   * 直近成功時の商品。**null であることが「まだ一度も描けていない」の唯一の表現**で、
   * これが「初回の失敗＝全面エラー / 2回目以降の失敗＝バナー」の分岐そのもの
   * （移植前の hasResult フラグに相当する）。失敗では絶対に null へ戻さないこと——
   * 最初の取得に失敗した画面が再試行ボタンの無いバナーだけになり、利用者は
   * 何もできなくなる。
   */
  data: ProductDetail | null;
  /** 直近成功時の _meta.ui（画像の絶対URLと商品ページURL）。 */
  meta: ProductUiMeta | null;
  /** 二層のうち上側（今の表示を残したまま重ねる）。 */
  banner: string | null;
  /** 二層のうち下側（表示を消して再試行だけを残す全面エラー）。 */
  initialError: string | null;
  /** 商品ページを開いている最中か。そのボタンだけを押せなくする。 */
  opening: boolean;
}

type ProductAction =
  | { type: "tool-input"; productId: number | null }
  | { type: "request" }
  | { type: "result"; data: ProductDetail; meta: ProductUiMeta | null }
  | { type: "failure"; message: string }
  | { type: "initial-error"; message: string }
  | { type: "dismiss-banner" }
  | { type: "open-start" }
  | { type: "open-end"; message: string | null };

/**
 * 起動直後は **loading: true** から始める。ホストから tool-input も tool-result も
 * 届いていない時点では、再読み込みも再試行も押させてはならない（移植前はエントリ HTML
 * 側で操作系を hidden にしていた役目）。
 */
const INITIAL_STATE: ProductState = {
  productId: null,
  loading: true,
  data: null,
  meta: null,
  banner: null,
  initialError: null,
  opening: false,
};

function reducer(state: ProductState, action: ProductAction): ProductState {
  switch (action.type) {
    case "tool-input":
      return {
        ...state,
        productId: action.productId,
        loading: true, // tool-result が届くまで操作不可にする
      };

    case "request":
      return { ...state, loading: true, banner: null };

    case "result":
      return {
        ...state,
        loading: false,
        data: action.data,
        meta: action.meta,
        banner: null,
        initialError: null,
      };

    // 失敗の見せ方を二層に振り分ける唯一の場所（search 側の reducer と同じ判断）。
    // **全面エラーはバナーに触らず、バナーは全面エラーに触らない。** この非対称は
    // 意図的で、片方を出すときにもう片方を掃除しに行くと「バナーを閉じたら全面エラー
    // まで消えた」のような組み合わせが生まれる。
    case "failure":
      return state.data !== null
        ? { ...state, loading: false, banner: action.message }
        : { ...state, loading: false, initialError: action.message };

    // 接続の失敗と「商品IDを受け取れなかった」場合。**loading を false へ落とすこと**——
    // 落とさないと全面エラーの再試行ボタンが disabled のままになり、利用者に何も残らない。
    case "initial-error":
      return { ...state, loading: false, initialError: action.message };

    case "dismiss-banner":
      return { ...state, banner: null };

    case "open-start":
      return { ...state, opening: true };

    // 開くのに失敗したときだけバナーを出す。**成功（message === null）で既存の
    // バナーを消さないこと**——別の理由で出ている申し送りを、無関係な操作の成功で
    // 掃除してしまう。
    case "open-end":
      return { ...state, opening: false, banner: action.message ?? state.banner };
  }
}

export interface ProductView {
  state: ProductState;
  /** 直近成功時の商品ページURL。meta からの派生値なので状態には持たない。 */
  pageUrl: string | null;
  /** ホストの safe area を受ける要素（#app）に付ける ref。 */
  appElRef: RefObject<HTMLDivElement>;
  reload: () => void;
  dismissBanner: () => void;
  openPage: () => void;
}

export function useProductView(): ProductView {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const appElRef = useRef<HTMLDivElement>(null);

  /**
   * 最新の state をホストのイベントと非同期処理から読むための写し
   * （必要な理由は search 側の useSearchView.ts に同じ）。
   */
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /**
   * ツールの結果を受けて画面を作り直す。ホストからの通知（toolresult）と、
   * View から撃った再取得（callServerTool）の戻り値が同じここに集まる。
   *
   * 引数を `ToolResult | undefined` で受けているのは、移植元の `!result` ガードを
   * そのまま残すため。型の上では常に値が来ることになっているが、これはホストの
   * 実装を信じた型であって検査ではない。
   */
  const handleToolResult = useCallback((result: ToolResult | undefined): void => {
    if (!result || result.isError) {
      dispatch({
        type: "failure",
        message: result
          ? extractErrorMessage(result, FALLBACK_ERROR_MESSAGE)
          : "商品情報を受け取れませんでした。",
      });
      return;
    }

    const data = extractStructuredContent<ProductDetail>(result);
    if (!data) {
      dispatch({ type: "failure", message: "商品情報の形式が不正です。" });
      return;
    }

    dispatch({ type: "result", data, meta: extractProductUiMeta(result) });
  }, []);

  /**
   * ホストからの通知の購読。**useApp が App を作った直後・connect() を呼ぶ前に**
   * 一度だけ呼ばれる（onAppCreated）。この締切を守らなければならない理由は
   * search 側の同じ関数のコメントを参照。
   */
  const registerHandlers = useCallback(
    (app: App): void => {
      app.addEventListener("toolinput", (params) => {
        const args = params?.arguments ?? {};
        dispatch({ type: "tool-input", productId: readNumber(args["product_id"]) ?? null });
      });

      app.addEventListener("toolresult", (result) => {
        handleToolResult(result);
      });

      app.addEventListener("toolcancelled", (params) => {
        dispatch({
          type: "failure",
          message: params?.reason
            ? `取得が中断されました（${params.reason}）。`
            : "取得が中断されました。",
        });
      });

      app.onerror = (err) => {
        console.error("[product-detail view] transport error", err);
      };
    },
    [handleToolResult],
  );

  // capabilities は空、autoResize は既定（true）のまま。**autoResize を明示的に
  // false にしないこと**——ResizeObserver による高さのホストへの通知がこれで付く。
  const { app, error } = useApp({
    appInfo: { name: "product-detail-view", version: "1.0.0" },
    capabilities: {},
    onAppCreated: registerHandlers,
  });

  // テーマ・CSS 変数・フォントの適用は SDK に任せる。safe area だけは
  // useHostStyles が扱わないので、こちらで #app に載せる（shared/host.ts）。
  useHostStyles(app, app?.getHostContext());
  useSafeAreaInsets(app, appElRef);

  useEffect(() => {
    if (error === null) return;
    console.error("[product-detail view] connect failed", error);
    dispatch({ type: "initial-error", message: "ホストとの接続に失敗しました。" });
  }, [error]);

  // ---- 画面からの操作 ----------------------------------------------------

  const fetchProduct = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    // app が null なのは接続が終わるまで。ツールは撃てないので何もしない。
    if (app === null || current.loading) return; // 多重送信を避ける
    if (current.productId === null) {
      dispatch({ type: "initial-error", message: "商品IDを受け取れませんでした。" });
      return;
    }
    dispatch({ type: "request" });
    try {
      // `satisfies`（`:` ではなく）で受けるのは、callServerTool の arguments が
      // `{ [x: string]: unknown }` を求めるため。interface で注釈すると暗黙の
      // インデックスシグネチャが付かず代入できない。satisfies なら backend の
      // 引数契約（shared/types.ts）との照合はそのまま効く。
      const args = { product_id: current.productId } satisfies GetProductArgs;
      const result = await app.callServerTool({ name: "get_product", arguments: args });
      handleToolResult(result);
    } catch {
      dispatch({ type: "failure", message: "通信エラーが発生しました。もう一度お試しください。" });
    }
  }, [app, handleToolResult]);

  const reload = useCallback((): void => {
    void fetchProduct();
  }, [fetchProduct]);

  const dismissBanner = useCallback((): void => {
    dispatch({ type: "dismiss-banner" });
  }, []);

  const openPage = useCallback((): void => {
    const url = stateRef.current.meta?.page_url;
    if (app === null || !url) return;
    void (async () => {
      dispatch({ type: "open-start" });
      dispatch({ type: "open-end", message: await openPageInHost(app, url) });
    })();
  }, [app]);

  return {
    state,
    pageUrl: state.meta !== null ? state.meta.page_url : null,
    appElRef,
    reload,
    dismissBanner,
    openPage,
  };
}
