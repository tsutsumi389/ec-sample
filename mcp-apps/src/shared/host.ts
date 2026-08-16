/**
 * ホストコンテキスト（テーマ・CSS 変数・フォント・safe area）の適用と、
 * それを含めた App の起動手順。両 View が一字一句同じ処理を持っていたので括った。
 */

import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type App,
} from "@modelcontextprotocol/ext-apps";

/**
 * ホストが配ってくる文脈（= McpUiHostContext）。
 * View が読むのは theme / styles.variables / styles.css.fonts / safeAreaInsets の
 * 4つだけで、他（displayMode / locale / containerDimensions 等）は使っていない。
 */
export type HostContext = Parameters<NonNullable<App["onhostcontextchanged"]>>[0];

/**
 * 渡ってきたフィールドだけをドキュメントへ反映する。
 *
 * **「渡ってきたフィールドだけ」が要点。** onhostcontextchanged は差分だけを
 * 送ってくる可能性がある（SDK は呼び出し前に内部の hostContext へマージ済み）ので、
 * 未指定のフィールドを既定値で上書きすると、ホストが設定済みのテーマや変数を
 * こちらから消してしまう。
 *
 * safe area は **インセットの生値だけ**をカスタムプロパティとして置き、既定の余白との
 * 足し算は CSS 側（shared/theme.css の `#app { padding: calc(16px + var(--safe-area-*)) }`）に
 * させる。JS に既定の余白（16px）を写して足し込む形にすると、同じ数値を CSS と JS で
 * 二重に持つことになり、View ごとに余白を変えたくなった日に safe area の計算だけが
 * 古い基準のまま残る——しかもインセットを持つ端末でしか表面化しない。
 *
 * @param appEl safe area のカスタムプロパティを載せる要素（各 View の #app）。
 */
export function applyHostContext(ctx: HostContext | undefined, appEl: HTMLElement): void {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles && ctx.styles.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles && ctx.styles.css && ctx.styles.css.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.safeAreaInsets) {
    const insets = ctx.safeAreaInsets;
    appEl.style.setProperty("--safe-area-top", `${insets.top}px`);
    appEl.style.setProperty("--safe-area-right", `${insets.right}px`);
    appEl.style.setProperty("--safe-area-bottom", `${insets.bottom}px`);
    appEl.style.setProperty("--safe-area-left", `${insets.left}px`);
  }
}

/**
 * ホストコンテキストの配線と接続。**View のファイルの一番最後に呼ぶこと。**
 *
 * ここより前に ontoolinput / ontoolresult / ontoolcancelled を登録し終えていなければ
 * ならない。あの3つは一度きりの通知で、connect() の解決後に登録すると取りこぼす
 * （SDK 自身が _assertHandlerTiming で「初期化済みなのに後から登録した」と警告・例外を
 * 出す設計になっている）。この関数は connect() を呼ぶので、**呼んだ時点でその締切を
 * 過ぎる**。
 *
 * 接続後に一度だけ getHostContext() を読むのは、初期状態がホストから通知として
 * 飛んでこない可能性があるため（以後の変化は onhostcontextchanged が拾う）。
 *
 * @param viewName console のログに出す View 名（"search-products view" 等）。
 * @param onConnectFailed 接続そのものに失敗したときの表示。まだ何も描けていない
 *   状態なので、各 View の全面エラー（showInitialError）を渡す。
 */
export function connectWithHostContext(
  app: App,
  appEl: HTMLElement,
  viewName: string,
  onConnectFailed: (message: string) => void,
): void {
  app.onhostcontextchanged = (ctx) => {
    // このコールバックが呼ばれる時点で、SDK は変更分を内部の hostContext へ
    // マージ済み（onEventDispatch）。テーマ・変数・フォント・safe area は
    // 「差分だけ」渡ってくる可能性があるため、渡ってきたフィールドだけ適用する
    // （その判断は applyHostContext が持つ）。
    applyHostContext(ctx, appEl);
  };

  app.onerror = (err) => {
    console.error(`[${viewName}] transport error`, err);
  };

  app
    .connect()
    .then(() => {
      applyHostContext(app.getHostContext(), appEl);
    })
    .catch((err: unknown) => {
      console.error(`[${viewName}] connect failed`, err);
      onConnectFailed("ホストとの接続に失敗しました。");
    });
}
