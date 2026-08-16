/**
 * 商品詳細パネルの View（backend が ui://hibino/product-detail.html として配る側）。
 *
 * get_product の structuredContent（views.ProductDetail）と _meta.ui
 * （ui_assets.build_product_ui_item）を受け取って商品1件ぶんのパネルを描く。
 * 並び替えもページングも無いので状態は「読み込み中／表示中／エラー」の3つだけで、
 * 再取得の土台になるのも product_id 1つ（search の View の state.base に相当）。
 *
 * **SDK は npm の依存として import する。** 移植前は backend が vendor した
 * バンドルを HTML のプレースホルダに差し込み、View 側は globalThis.__McpAppSdk から
 * 受け取っていた。そのため「差し込まれていない・壊れている」場合の保険（body に
 * 「この画面の読み込みに失敗しました。」とだけ書いて何もしない分岐）が要った。
 * import になった今は解決できなければビルドが落ちるので、実行時にその状態は
 * 起こりえない。**保険ごと廃止したのは移植で消した唯一の分岐**で、他の分岐は
 * すべて移植元のまま残してある。
 */

import { App } from "@modelcontextprotocol/ext-apps";

import { createBanner, fillImage, requireEl, setOptionalText } from "../shared/dom.ts";
import { formatRating, formatYen, readNumber } from "../shared/format.ts";
import { connectWithHostContext } from "../shared/host.ts";
import { openPageInHost } from "../shared/openLink.ts";
import {
  extractErrorMessage,
  extractProductUiMeta,
  extractStructuredContent,
  type ToolResult,
} from "../shared/toolResult.ts";
import type { GetProductArgs, ProductDetail, ProductUiMeta } from "../shared/types.ts";

// CSS は theme.css（両 View 共通）→ product.css（この View 固有）の順に import する。
// **この順がそのままカスケードの順になる**ので入れ替えないこと。
import "../shared/theme.css";
import "./product.css";

/**
 * content から文言を取れなかったときの汎用文。
 * **サーバーが返した文言があるならそちらが常に優先される**（extractErrorMessage）。
 * get_product が存在しない product_id に返す "Product not found" は英語のまま
 * 素通しされるが、View 側で日本語に訳し直さない——訳の対応表を持つと backend が
 * 文言を足したときに View だけが古い訳を出し続ける。
 */
const FALLBACK_ERROR_MESSAGE = "商品情報を取得できませんでした。";

/** shared/dom.ts の requireEl に、この View のエントリ HTML 名を固定しただけの別名。 */
const el = <T extends HTMLElement = HTMLElement>(id: string): T => requireEl<T>(id, "product.html");

const els = {
  app: el("app"),
  title: el("result-title"),
  reloadBtn: el<HTMLButtonElement>("reload-btn"),
  refreshError: el("refresh-error"),
  refreshErrorText: el("refresh-error-text"),
  refreshErrorDismiss: el<HTMLButtonElement>("refresh-error-dismiss"),
  loadingState: el("loading-state"),
  initialErrorState: el("initial-error-state"),
  initialErrorText: el("initial-error-text"),
  initialErrorRetry: el<HTMLButtonElement>("initial-error-retry"),
  panel: el("panel"),
  panelImage: el("panel-image"),
  panelCategory: el("panel-category"),
  panelName: el("panel-name"),
  panelSku: el("panel-sku"),
  panelPrice: el("panel-price"),
  panelListPrice: el("panel-list-price"),
  panelRating: el("panel-rating"),
  panelAvailability: el("panel-availability"),
  panelDescription: el("panel-description"),
  panelSpecsWrap: el("panel-specs-wrap"),
  panelSpecs: el("panel-specs"),
  openPageBtn: el<HTMLButtonElement>("open-page-btn"),
};

/** 再取得・リンク開放の失敗を重ねて出すバナー（全面エラーとは領域が重ならない）。 */
const refreshError = createBanner(els.refreshError, els.refreshErrorText);

interface ViewState {
  productId: number | null;
  hasResult: boolean;
  loading: boolean;
  pageUrl: string | null;
}

// 再取得では product_id をツールの初回引数（ontoolinput で受け取る）から一切
// 変えない。ontoolresult / callServerTool の戻り値には product_id が含まれない
// ため、ここが「再試行」「再読み込み」双方の唯一の土台になる（search の View の
// state.base と同じ役割）。
//
// hasResult について（**実装をコメントに合わせて直さないこと**）: 実際に true を
// 立てるのは renderPanel、つまり成功して描画できたときだけで、失敗では立てない。
// この非対称が「初回の失敗＝全面エラー / 2回目以降の失敗＝バナー」の分岐そのもの。
// 失敗でも立てるようにすると、最初の取得に失敗した画面が再試行ボタンの無い
// バナーだけになり、利用者は何もできなくなる。
const state: ViewState = {
  productId: null,
  hasResult: false,
  loading: false,
  pageUrl: null, // 直近成功時の _meta.ui.page_url（商品ページを開くボタン用）
};

// App インスタンス。移植元は関数定義より後ろで代入する都合上 let だったが、
// モジュールでは先に作れるので const にしてある。**ハンドラの登録と connect() は
// このファイルの末尾**（理由はそこのコメント）。
const app = new App({ name: "product-detail-view", version: "1.0.0" });

function setLoading(loading: boolean): void {
  state.loading = loading;
  els.initialErrorRetry.disabled = loading;
  els.reloadBtn.disabled = loading;
  els.openPageBtn.disabled = loading;
}

// 再取得・リンク開放が失敗したときに、操作系の見た目を「直近成功時」の状態へ
// 戻す。パネルの中身自体は触らない（触らないことが「元の表示に戻す」の実体。
// search の View の resetControlsToConfirmed と同じ考え方）。
function resetControlsToConfirmed(): void {
  els.initialErrorRetry.disabled = false;
  els.reloadBtn.disabled = false;
  els.openPageBtn.disabled = false;
}

function showInitialError(message: string): void {
  els.loadingState.hidden = true;
  els.panel.hidden = true;
  els.reloadBtn.hidden = true;
  els.initialErrorText.textContent = message;
  els.initialErrorState.hidden = false;
}

/**
 * 失敗の見せ方を二層に振り分ける。
 *
 * - 一度も描画できていない（hasResult=false）→ 全面エラー。まだ残すべき表示が
 *   無いので、画面いっぱいに理由と再試行ボタンを出す。
 * - 既に描画済み（hasResult=true）→ パネルはそのまま残し、バナーだけを足す。
 *   「元の表示に戻せる」ことを優先し、成功していた内容を失敗で消さない。
 *
 * **showInitialError は refresh バナーに触らず、refreshError.show は全面エラーに
 * 触らない。** この非対称は意図的で、片方を出すときにもう片方を掃除しに行くと
 * 「バナーを閉じたら全面エラーまで消えた」のような組み合わせが生まれる。
 */
function showFailure(message: string): void {
  resetControlsToConfirmed();
  if (state.hasResult) {
    refreshError.show(message);
  } else {
    showInitialError(message);
  }
}

function renderPanel(data: ProductDetail, meta: ProductUiMeta | null): void {
  state.hasResult = true;
  state.pageUrl = meta ? meta.page_url : null;

  els.loadingState.hidden = true;
  els.initialErrorState.hidden = true;

  els.title.textContent = data.name;

  // src に入れてよいのは _meta.ui 側の絶対URLだけ。structuredContent.image_url は
  // 相対パスで、iframe には解決できるオリジンが無いので絶対に使わない。
  fillImage(els.panelImage, meta ? meta.image_url : null);

  // 商品名・カテゴリ名・説明・仕様は未信頼のテキストとして扱い、必ず
  // textContent で入れる（商品説明にはプロンプトインジェクションの文面が
  // 混ざりうる、というのが backend の DESCRIPTION_MAX_CHARS の趣旨でもある）。
  setOptionalText(els.panelCategory, data.category);

  els.panelName.textContent = data.name;

  setOptionalText(els.panelSku, data.sku ? `商品コード: ${data.sku}` : null);

  els.panelPrice.textContent = formatYen(data.effective_price);
  setOptionalText(els.panelListPrice, data.list_price != null ? formatYen(data.list_price) : null);

  els.panelRating.textContent = formatRating(data.avg_rating, data.review_count);

  // availability は「購入できます」/ 買えない理由の完成文がサーバーから来る
  // （backend の services/cart.py の availability_reason_for_status が唯一の源）。
  // **View は色分け（data-ok）と、届いた文をそのまま出すことだけを担当する。**
  // stock / status から「在庫◯点」「販売終了」のような文言を組み立て直さない。
  els.panelAvailability.dataset.ok = String(data.purchasable);
  els.panelAvailability.textContent = data.availability;

  setOptionalText(els.panelDescription, data.description);

  els.panelSpecs.textContent = ""; // innerHTML は使わず子要素を作り直す
  if (Array.isArray(data.specs) && data.specs.length > 0) {
    for (const spec of data.specs) {
      const li = document.createElement("li");
      li.className = "spec-item";
      li.textContent = spec;
      els.panelSpecs.appendChild(li);
    }
    els.panelSpecsWrap.hidden = false;
  } else {
    els.panelSpecsWrap.hidden = true;
  }

  if (state.pageUrl) {
    els.openPageBtn.hidden = false;
    els.openPageBtn.disabled = state.loading;
  } else {
    els.openPageBtn.hidden = true;
  }

  els.reloadBtn.hidden = false;
  els.reloadBtn.disabled = state.loading;

  els.panel.hidden = false;
}

/**
 * ツールの結果を受けて画面を作り直す。ホストからの通知（ontoolresult）と、
 * View から撃った再取得（callServerTool）の戻り値が同じここに集まる。
 *
 * 引数を `ToolResult | undefined` で受けているのは、移植元の `!result` ガードを
 * そのまま残すため。型の上では常に値が来ることになっているが、これはホストの
 * 実装を信じた型であって検査ではない。
 */
function handleToolResult(result: ToolResult | undefined): void {
  setLoading(false);

  if (!result || result.isError) {
    showFailure(
      result
        ? extractErrorMessage(result, FALLBACK_ERROR_MESSAGE)
        : "商品情報を受け取れませんでした。",
    );
    return;
  }

  const data = extractStructuredContent<ProductDetail>(result);
  if (!data) {
    showFailure("商品情報の形式が不正です。");
    return;
  }

  refreshError.hide();
  renderPanel(data, extractProductUiMeta(result));
}

async function fetchProduct(): Promise<void> {
  if (state.loading) return; // 多重送信を避ける
  if (state.productId == null) {
    showInitialError("商品IDを受け取れませんでした。");
    return;
  }
  refreshError.hide();
  setLoading(true);
  try {
    // `satisfies`（`:` ではなく）で受けるのは、callServerTool の arguments が
    // `{ [x: string]: unknown }` を求めるため。interface で注釈すると暗黙の
    // インデックスシグネチャが付かず代入できない。satisfies なら backend の
    // 引数契約（shared/types.ts）との照合はそのまま効く。
    const args = { product_id: state.productId } satisfies GetProductArgs;
    const result = await app.callServerTool({ name: "get_product", arguments: args });
    handleToolResult(result);
  } catch {
    // setLoading(false) が3つのボタンを有効に戻すので、ここでの
    // resetControlsToConfirmed() は showFailure の中の1回で足りる。
    setLoading(false);
    showFailure("通信エラーが発生しました。もう一度お試しください。");
  }
}

// ---- イベント配線 -------------------------------------------------------

els.initialErrorRetry.addEventListener("click", () => void fetchProduct());
els.reloadBtn.addEventListener("click", () => void fetchProduct());
els.refreshErrorDismiss.addEventListener("click", () => refreshError.hide());
els.openPageBtn.addEventListener("click", () => {
  const url = state.pageUrl;
  if (!url) return;
  void openPageInHost({
    app,
    url,
    button: els.openPageBtn,
    isLoading: () => state.loading,
    onError: refreshError.show,
  });
});

// ---- App 初期化 ----------------------------------------------------------
// **ハンドラは必ず connect() より前に登録する。** tool-input / tool-result /
// tool-cancelled は一度きりの通知で、connect() の解決後に登録すると取りこぼす
// （SDK 自身が _assertHandlerTiming で「初期化済みなのに後から登録した」と
// 警告・例外を出す設計になっている）。connect() を呼ぶのは末尾の
// connectWithHostContext なので、**この3つはそれより前**。この順序は移植で変えていない。

app.ontoolinput = (params) => {
  const args = params?.arguments ?? {};
  state.productId = readNumber(args["product_id"]) ?? null;
  setLoading(true); // ui/notifications/tool-result が届くまで操作不可にする
};

app.ontoolresult = (result) => {
  handleToolResult(result);
};

app.ontoolcancelled = (params) => {
  setLoading(false);
  showFailure(
    params?.reason ? `取得が中断されました（${params.reason}）。` : "取得が中断されました。",
  );
};

// テーマ・safe area の配線と connect()。**必ず最後に呼ぶ**（上の3ハンドラの登録が
// connect() より前でなければならないため。理由は shared/host.ts のコメント）。
connectWithHostContext(app, els.app, "product-detail view", showInitialError);
