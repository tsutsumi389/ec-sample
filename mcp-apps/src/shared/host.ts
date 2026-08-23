/**
 * ホストが配ってくる文脈（McpUiHostContext）のうち、**SDK が面倒を見てくれない
 * safe area のインセットだけ**を受け持つフック。
 *
 * テーマ（color-scheme）・CSS 変数・フォントは SDK の `useHostStyles(app, ...)` が
 * 適用する。**それらをこちらに書き戻さないこと**——同じ変数を二重に当てることになり、
 * ホストが差分だけ送ってきたときにどちらが最後に書いたかで結果が変わる。
 *
 * **`app.onhostcontextchanged =` （setter）ではなく addEventListener を使う。** setter は
 * 単一のハンドラを置き換えるので、同じイベントを購読している SDK の useHostStyles と
 * 奪い合いになる（View がもう1つ購読したくなった瞬間に静かに片方が消える）。
 */

import { useEffect } from "react";

import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps/react";

/**
 * safe area のインセットを **生値のまま** ドキュメントのルートへ載せる。
 *
 * **載せ先が documentElement なのは、これがホスト由来の文書レベルの値だから**（SDK の
 * useHostStyles も CSS 変数をここに当てている）。**View ごとの要素へ ref 越しに載せる形へ
 * 戻さないこと**——どれを落としても余白がずれるだけで何も壊れず、しかもインセットを
 * 報告する端末でしか表面化しない。
 *
 * 既定の余白との足し算は CSS 側（shared/theme.css の calc()）にさせる。JS に既定の
 * 余白（16px）を写して足し込むと、View ごとに余白を変えた日に safe area の計算だけが
 * 古い基準のまま残る。
 *
 * インセットが渡ってこない通知では**何もしない**。hostcontextchanged は差分だけを
 * 送ってくる可能性があるので、未指定を既定値（0）で上書きすると、ホストが設定済みの
 * インセットをこちらから消してしまう。
 *
 * @param app useApp が返す App。接続前は null で、そのときは何もしない。
 */
export function useSafeAreaInsets(app: App | null): void {
  useEffect(() => {
    if (app === null) return;
    const root = document.documentElement;

    const apply = (ctx: McpUiHostContext | undefined): void => {
      const insets = ctx?.safeAreaInsets;
      if (!insets) return;
      root.style.setProperty("--safe-area-top", `${insets.top}px`);
      root.style.setProperty("--safe-area-right", `${insets.right}px`);
      root.style.setProperty("--safe-area-bottom", `${insets.bottom}px`);
      root.style.setProperty("--safe-area-left", `${insets.left}px`);
    };

    // 接続時点の値は通知として飛んでこない可能性があるので、ここで一度読む
    // （以後の変化は下の購読が拾う）。
    apply(app.getHostContext());
    app.addEventListener("hostcontextchanged", apply);
    return () => app.removeEventListener("hostcontextchanged", apply);
  }, [app]);
}
