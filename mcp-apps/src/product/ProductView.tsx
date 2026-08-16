/**
 * 商品詳細パネルの View（backend が ui://hibino/product-detail.html として配る側）。
 *
 * get_product の structuredContent（views.ProductDetail）と _meta.ui
 * （ui_assets.build_product_ui_item）を受け取って商品1件ぶんのパネルを描く。
 * 状態とホストとの配線は useProductView.ts が持ち、ここは形だけを持つ。
 *
 * **判断はここに一切持たない。** 在庫・販売状態から「在庫◯点」「販売終了」のような
 * 文言を組み立て直さないこと（backend の services/cart.py が唯一の源）。View が
 * やってよいのは色分け（data-ok）と、届いた文をそのまま出すことだけ。
 */

import type { ReactElement } from "react";

import { formatRating, formatYen } from "../shared/format.ts";
import { ErrorBanner, InitialError, ProductImage } from "../shared/ui.tsx";
import { useProductView } from "./useProductView.ts";

export function ProductView(): ReactElement {
  const { state, pageUrl, appElRef, reload, dismissBanner, openPage } = useProductView();

  // 全面エラーが出ている間はパネルを無かったことにして描く（search 側と同じ二層の
  // 分け方。全面エラーはパネルと再読み込みを丸ごと置き換え、バナーはそのどちらにも
  // 触らない）。
  const initialError = state.initialError;
  const data = initialError === null ? state.data : null;

  return (
    // ホストから safe area のインセットが届くと shared/host.ts の useSafeAreaInsets が
    // この要素へ --safe-area-* を載せる（足し算は theme.css の calc() 側）。
    <div id="app" ref={appElRef}>
      <header className="header">
        <h1 className="title">{data !== null ? data.name : "商品詳細"}</h1>
        {/* 直近成功時の product_id で get_product を呼び直すボタン。並び替え・
            ページングが無い分、search の View より状態は単純（読み込み中／表示／
            エラーの3状態）。 */}
        {data !== null ? (
          <button className="text-btn" type="button" disabled={state.loading} onClick={reload}>
            再読み込み
          </button>
        ) : null}
      </header>

      {/* 再取得・商品ページを開く操作の失敗はここに出す。直前まで表示していた
          パネルはそのまま残す（= 元の表示に戻せる）。 */}
      <ErrorBanner message={state.banner} onDismiss={dismissBanner} />

      <main className="main">
        {initialError !== null ? (
          // 一度も結果を受け取れていない状態（初回の取得そのものが失敗、または
          // 商品が存在しない）専用の全面エラー。get_product は「0件」を返す概念が
          // 無く、存在しない product_id はここに落ちる（search の View の
          // 空状態に相当するものはこちら1本に集約する）。
          <InitialError message={initialError} loading={state.loading} onRetry={reload} />
        ) : data === null ? (
          <p className="state-message">商品情報を取得しています…</p>
        ) : (
          // 商品 1 件を深く見せるパネル。search の View の .card 相当だが、複数件から
          // 選ぶボタンではないので <article> にし、クリックでの遷移は持たせない
          // （商品ページへ出るのは下の .page-btn 1つだけ）。
          <article className="panel">
            {/* src に入れてよいのは _meta.ui 側の絶対URLだけ。structuredContent.image_url は
                相対パスで、iframe には解決できるオリジンが無いので絶対に使わない。 */}
            <ProductImage
              className="panel-image"
              url={state.meta !== null ? state.meta.image_url : null}
            />
            <div className="panel-body">
              {/* 商品名・カテゴリ名・説明・仕様は未信頼のテキストとして扱い、必ず
                  JSX の子要素として埋める（商品説明にはプロンプトインジェクションの
                  文面が混ざりうる、というのが backend の DESCRIPTION_MAX_CHARS の
                  趣旨でもある）。dangerouslySetInnerHTML を使わないこと。 */}
              {data.category ? <span className="panel-category">{data.category}</span> : null}
              <h2 className="panel-name">{data.name}</h2>
              {data.sku ? <span className="panel-sku">商品コード: {data.sku}</span> : null}

              <div className="panel-price-row">
                <span className="panel-price">{formatYen(data.effective_price)}</span>
                {data.list_price != null ? (
                  <span className="panel-list-price">{formatYen(data.list_price)}</span>
                ) : null}
              </div>

              <span className="panel-rating">
                {formatRating(data.avg_rating, data.review_count)}
              </span>

              {/* availability は「購入できます」/ 買えない理由の完成文がサーバーから来る
                  （backend の services/cart.py の availability_reason_for_status が唯一の源）。 */}
              <span className="panel-availability" data-ok={String(data.purchasable)}>
                {data.availability}
              </span>

              {data.description ? (
                <p className="panel-description">{data.description}</p>
              ) : null}

              {/* specs は "ラベル: 値" に潰した文字列の配列（views.ProductDetail.specs）。
                  label/value に分割しての表形式にはしない——CLAUDE.md の「label/value の
                  2キーを増やさない」規律に、表示側も倣う。Array.isArray を残してあるのは
                  structuredContent が検査されないキャストで届くため（型は約束であって
                  実行時の保証ではない）。 */}
              {Array.isArray(data.specs) && data.specs.length > 0 ? (
                <div>
                  <h3 className="specs-heading">仕様</h3>
                  <ul className="spec-list">
                    {data.specs.map((spec, index) => (
                      <li key={index} className="spec-item">
                        {spec}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="panel-actions">
                {pageUrl !== null ? (
                  <button
                    className="page-btn"
                    type="button"
                    disabled={state.loading || state.opening}
                    onClick={openPage}
                  >
                    商品ページを見る
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
