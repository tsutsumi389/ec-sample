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
 *
 * ホストとの接続手順（useApp / useHostStyles / safe area / 接続失敗の検出）は
 * shared/useHostApp.ts が持つ（search 側と共通）。
 */

import { useCallback, useEffect, useReducer } from "react";

import type { App } from "@modelcontextprotocol/ext-apps/react";

import { readNumber } from "../shared/format.ts";
import { openPageInHost } from "../shared/openLink.ts";
import {
  NETWORK_ERROR_MESSAGE,
  extractProductUiMeta,
  parseToolResult,
  type ToolResult,
} from "../shared/toolResult.ts";
import type { GetProductArgs, ProductDetail, ProductUiMeta } from "../shared/types.ts";
import { useHostApp } from "../shared/useHostApp.ts";
import { useLatestRef } from "../shared/useLatestRef.ts";

/**
 * 結果を読めなかったときの文言。
 * **サーバーが返した文言があるならそちらが常に優先される**（extractErrorMessage）。
 * get_product が存在しない product_id に返す "Product not found" は英語のまま
 * 素通しされるが、View 側で日本語に訳し直さない——訳の対応表を持つと backend が
 * 文言を足したときに View だけが古い訳を出し続ける。
 */
const FAILURE_MESSAGES = {
  missing: "商品情報を受け取れませんでした。",
  fallback: "商品情報を取得できませんでした。",
  malformed: "商品情報の形式が不正です。",
};

interface ProductState {
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

interface UseProductViewResult {
  state: ProductState;
  /**
   * 全面エラーが出ている間は null になる商品（search 側の result と同じ扱い）。
   * **画面はこちらだけを読む。** 二層の「触る領域が重ならない」を、描画側の1行では
   * なく失敗の振り分けと同じ層で確定させるため。
   */
  data: ProductDetail | null;
  reload: () => void;
  dismissBanner: () => void;
  openPage: () => void;
}

export function useProductView(): UseProductViewResult {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // ホストの購読と非同期処理から最新の state を読むための写し（理由は useLatestRef）。
  const stateRef = useLatestRef(state);

  /**
   * ツールの結果を受けて画面を作り直す。ホストからの通知（toolresult）と、
   * View から撃った再取得（callServerTool）の戻り値が同じここに集まる。
   */
  const handleToolResult = useCallback((result: ToolResult | undefined): void => {
    const outcome = parseToolResult<ProductDetail>(result, FAILURE_MESSAGES);
    if (!outcome.ok) {
      dispatch({ type: "failure", message: outcome.message });
      return;
    }
    dispatch({ type: "result", data: outcome.data, meta: extractProductUiMeta(outcome.result) });
  }, []);

  /**
   * ホストからの通知の購読。**App を作った直後・connect() を呼ぶ前に**一度だけ
   * 呼ばれる（useHostApp が onAppCreated へ通す）。この締切の理由は useHostApp.ts。
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
    },
    [handleToolResult],
  );

  const { app, connectError } = useHostApp({
    name: "product-detail-view",
    version: "1.0.0",
    onAppCreated: registerHandlers,
  });

  // 接続の失敗をどちらの層に出すかは View の判断なので、useHostApp から文言だけを
  // 受け取ってここで振り分ける（まだ何も描けていないので全面エラー）。
  useEffect(() => {
    if (connectError === null) return;
    dispatch({ type: "initial-error", message: connectError });
  }, [connectError]);

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
      dispatch({ type: "failure", message: NETWORK_ERROR_MESSAGE });
    }
  }, [app, handleToolResult, stateRef]);

  const reload = useCallback((): void => {
    void fetchProduct();
  }, [fetchProduct]);

  const dismissBanner = useCallback((): void => {
    dispatch({ type: "dismiss-banner" });
  }, []);

  const openPage = useCallback((): void => {
    const url = stateRef.current.meta?.page_url;
    if (app === null || !url) return;
    dispatch({ type: "open-start" });
    void openPageInHost(app, url).then((message) => {
      dispatch({ type: "open-end", message });
    });
  }, [app, stateRef]);

  return {
    state,
    data: state.initialError === null ? state.data : null,
    reload,
    dismissBanner,
    openPage,
  };
}
