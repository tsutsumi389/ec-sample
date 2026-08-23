/**
 * 商品詳細パネルの View（backend が ui://hibino/product-detail.html として配る側）。
 *
 * get_product の structuredContent（views.ProductDetail）と _meta.ui
 * （ui_assets.build_product_ui_item）を受け取って商品1件ぶんのパネルを描く。状態と
 * ホストとの配線は useProductView.ts が持ち、**ここは形だけで判断を持たない**——
 * 在庫・販売状態から文言を組み立て直さないこと。View がやってよいのは色分け
 * （data-ok）と、届いた文をそのまま出すことだけ。
 */

import type { ReactElement } from "react";

import { formatRating, formatYen } from "../shared/format.ts";
import { ErrorBanner, InitialError, ProductImage } from "../shared/ui.tsx";
import { useProductView } from "./useProductView.ts";

export function ProductView(): ReactElement {
  // data は「全面エラーが出ている間は null」に揃えたもの（useProductView が確定させる）。
  // 全面エラーはパネルと再読み込みを丸ごと置き換え、バナーはそのどちらにも触らない。
  const { state, data, reload, dismissBanner, openPage } = useProductView();

  const initialError = state.initialError;

  return (
    // id="app" は theme.css が余白を当てるためのフック。safe area のインセットは
    // useSafeAreaInsets がドキュメントのルートへ載せ、足し算は theme.css の calc() が
    // やる（この要素に ref を付ける必要はない）。
    <div id="app">
      <header className="header">
        <h1 className="title">{data !== null ? data.name : "商品詳細"}</h1>
        {/* 直近成功時の product_id で get_product を呼び直すボタン。 */}
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
          // 一度も結果を受け取れていない状態（初回の取得そのものが失敗、または商品が
          // 存在しない）専用の全面エラー。get_product は「0件」を返す概念が無く、
          // 存在しない product_id もここに落ちる（search の空状態に相当）。
          <InitialError message={initialError} loading={state.loading} onRetry={reload} />
        ) : data === null ? (
          <p className="state-message">商品情報を取得しています…</p>
        ) : (
          // search の .card 相当だが、複数件から選ぶボタンではないので <article> にし、
          // クリックでの遷移は持たせない（商品ページへ出るのは下の .page-btn 1つだけ）。
          <article className="panel">
            {/* src に入れてよいのは _meta.ui 側の絶対URLだけ（structuredContent.image_url
                は相対パスで、iframe には解決できるオリジンが無い）。 */}
            <ProductImage
              className="panel-image"
              url={state.meta !== null ? state.meta.image_url : null}
            />
            <div className="panel-body">
              {/* 商品名・カテゴリ名・説明・仕様は未信頼のテキストとして扱い、必ず JSX の
                  子要素として埋める（商品説明にはプロンプトインジェクションの文面が
                  混ざりうる）。 */}
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

              {/* availability は完成文がサーバー（availability_reason_for_status）から来る。 */}
              <span className="panel-availability" data-ok={String(data.purchasable)}>
                {data.availability}
              </span>

              {data.description ? (
                <p className="panel-description">{data.description}</p>
              ) : null}

              {/* specs は "ラベル: 値" に潰した文字列の配列。label/value に分割しての
                  表形式にはしない。**ここだけ Array.isArray で守り直さないこと**——
                  structuredContent を信じるか検査するかは shared/toolResult.ts が
                  「唯一のキャスト地点」と決めており、1フィールドだけ二重に守ると
                  次に足す人が従う規則が無くなる。 */}
              {data.specs.length > 0 ? (
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
                {/* 開ける先は _meta.ui.page_url だけ。画像（上の ProductImage）と
                    同じ state.meta を同じ読み方で見る——片方だけをフック側で
                    派生させると、同じオブジェクトを2通りに読むことになる。 */}
                {state.meta !== null ? (
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
