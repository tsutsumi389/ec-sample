/**
 * ホストコンテキスト（テーマ・CSS 変数・フォント・safe area）の適用。
 * 両 View が一字一句同じ処理を持っていたので1か所に括った。
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
 * #app の既定の内側余白。
 *
 * **shared/theme.css の `#app { padding: 16px }` と同じ値を二重に持っている。**
 * safe area が届いたときに「既定の余白 + インセット」を計算する必要があり、CSS の
 * 値を JS から読むより素直だからこうしてある。**片方だけ変えないこと。**
 */
export const BASE_PADDING_PX = 16;

/**
 * 渡ってきたフィールドだけをドキュメントへ反映する。
 *
 * **「渡ってきたフィールドだけ」が要点。** onhostcontextchanged は差分だけを
 * 送ってくる可能性がある（SDK は呼び出し前に内部の hostContext へマージ済み）ので、
 * 未指定のフィールドを既定値で上書きすると、ホストが設定済みのテーマや変数を
 * こちらから消してしまう。
 *
 * 初期状態はホストから通知が飛んでこない可能性があるため、View 側は connect() の
 * 解決後に一度だけ getHostContext() を読んでここへ渡すこと（以後の変化は
 * onhostcontextchanged が拾う）。
 *
 * @param appEl safe area のぶんだけ padding を足す要素（各 View の #app）。
 */
export function applyHostContext(ctx: HostContext | undefined, appEl: HTMLElement): void {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles && ctx.styles.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles && ctx.styles.css && ctx.styles.css.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.safeAreaInsets) {
    const insets = ctx.safeAreaInsets;
    appEl.style.paddingTop = `${BASE_PADDING_PX + insets.top}px`;
    appEl.style.paddingRight = `${BASE_PADDING_PX + insets.right}px`;
    appEl.style.paddingBottom = `${BASE_PADDING_PX + insets.bottom}px`;
    appEl.style.paddingLeft = `${BASE_PADDING_PX + insets.left}px`;
  }
}
