/**
 * ホストが配ってくる文脈（McpUiHostContext）のうち、**SDK が面倒を見てくれない
 * safe area のインセットだけ**を受け持つフック。
 *
 * テーマ（color-scheme）・CSS 変数・フォントは SDK の `useHostStyles(app, ...)` が
 * 適用する。**それらをこちらに書き戻さないこと**——同じ変数を二重に当てることになり、
 * ホストが差分だけ送ってきたときにどちらが最後に書いたかで結果が変わる。
 *
 * **`app.onhostcontextchanged =` （setter）ではなく addEventListener を使う。**
 * setter は単一のハンドラを置き換えるので、SDK の useHostStyles と奪い合いになる
 * （あちらも同じイベントを購読している。あちらは addEventListener 側なので、
 * こちらが setter を使うと共存はするが、View がもう1つ購読したくなった瞬間に
 * 静かに片方が消える）。SDK 自身も on* 系 setter を deprecated にしている。
 */

import { useEffect, type RefObject } from "react";

import type { App } from "@modelcontextprotocol/ext-apps/react";

/**
 * ホストが配ってくる文脈。View が読むのは safeAreaInsets だけで、
 * theme / styles は useHostStyles に任せている。
 */
type HostContext = Parameters<NonNullable<App["onhostcontextchanged"]>>[0];

/**
 * safe area のインセットを **生値のまま** #app のカスタムプロパティへ載せる。
 *
 * 既定の余白との足し算は CSS 側（shared/theme.css の
 * `#app { padding: calc(16px + var(--safe-area-*)) }`）にさせる。JS に既定の余白
 * （16px）を写して足し込む形にすると、同じ数値を CSS と JS で二重に持つことになり、
 * View ごとに余白を変えたくなった日に safe area の計算だけが古い基準のまま残る
 * ——しかもインセットを持つ端末でしか表面化しない。
 *
 * インセットが渡ってこない通知では**何もしない**。onhostcontextchanged は差分だけを
 * 送ってくる可能性があるので、未指定を既定値（0）で上書きすると、ホストが設定済みの
 * インセットをこちらから消してしまう。
 *
 * @param app useApp が返す App。接続前は null で、そのときは何もしない。
 * @param appElRef インセットを載せる要素（各 View の #app）。
 */
export function useSafeAreaInsets(app: App | null, appElRef: RefObject<HTMLElement>): void {
  useEffect(() => {
    const appEl = appElRef.current;
    if (app === null || appEl === null) return;

    const apply = (ctx: HostContext | undefined): void => {
      const insets = ctx?.safeAreaInsets;
      if (!insets) return;
      appEl.style.setProperty("--safe-area-top", `${insets.top}px`);
      appEl.style.setProperty("--safe-area-right", `${insets.right}px`);
      appEl.style.setProperty("--safe-area-bottom", `${insets.bottom}px`);
      appEl.style.setProperty("--safe-area-left", `${insets.left}px`);
    };

    // 接続時点の値は通知として飛んでこない可能性があるので、ここで一度読む
    // （以後の変化は下の購読が拾う）。
    apply(app.getHostContext());
    app.addEventListener("hostcontextchanged", apply);
    return () => app.removeEventListener("hostcontextchanged", apply);
  }, [app, appElRef]);
}
