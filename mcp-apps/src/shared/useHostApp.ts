/**
 * ホスト（MCP Apps SDK）との接続と、接続に付随する配線。
 *
 * **ここが引き受けるのは「どの View でも同じことをする部分」だけ。** 失敗をどう
 * 見せるか（全面エラーかバナーか）は各 View の判断なので持たない——返すのは文言だけ。
 *
 * この手順は順序と締切に規律があり、**それを1か所に閉じ込めるのがこのフックの主目的**：
 *
 * - `onAppCreated` は **App の生成直後・`connect()` の前**に呼ばれる。toolinput /
 *   toolresult / toolcancelled は一度きりの通知なので、`connect()` が ui/initialize を
 *   終えた後に登録すると取りこぼす（SDK 自身が _assertHandlerTiming で警告・例外を出す）。
 * - `capabilities` は空、**`autoResize` は既定（true）のまま**。明示的に false へ
 *   落とさないこと——ResizeObserver による高さのホストへの通知がこれで付く。
 * - テーマ・CSS 変数・フォントの適用は SDK の `useHostStyles` に任せる。
 *   safe area だけは扱ってくれないので `useSafeAreaInsets` が補う（shared/host.ts）。
 *
 * **SDK は必ず `/react` エントリから import する。** ルートと `/react` はそれぞれが
 * App クラスの実体を持つ別々のバンドルなので、両方から import すると同じクラスが
 * 2つ入る（33KB 増え、`instanceof` が食い違う）。
 */

import { useCallback, useEffect } from "react";

import { useApp, useHostStyles, type App } from "@modelcontextprotocol/ext-apps/react";

import { useSafeAreaInsets } from "./host.ts";

/** 接続そのものに失敗したときの文言。**View に依存しないのでここが持つ。** */
const CONNECT_FAILED_MESSAGE = "ホストとの接続に失敗しました。";

export interface HostApp {
  /** 接続が終わるまでは null。null の間はツールを撃てない。 */
  app: App | null;
  /** 接続に失敗したときの表示用の文言。成功していれば null（状態には持たない派生値）。 */
  connectError: string | null;
}

/**
 * @param name View の識別名。`appInfo.name` と console のログの見出しを**兼ねる**。
 * @param version `appInfo.version`。
 * @param onAppCreated 一度きりの通知の購読を登録する関数。`connect()` の前に
 *   呼ばれる（上記の締切）。
 */
export function useHostApp({
  name,
  version,
  onAppCreated,
}: {
  name: string;
  version: string;
  onAppCreated: (app: App) => void;
}): HostApp {
  const registerHandlers = useCallback(
    (app: App): void => {
      // onerror は addEventListener の対象ではない（AppEventMap に error は無く、
      // SDK もこの setter を deprecated にしていない）ので、ここだけは setter で受ける。
      app.onerror = (err) => {
        console.error(`[${name}] transport error`, err);
      };
      onAppCreated(app);
    },
    [name, onAppCreated],
  );

  const { app, error } = useApp({
    appInfo: { name, version },
    capabilities: {},
    onAppCreated: registerHandlers,
  });

  useHostStyles(app, app?.getHostContext());
  useSafeAreaInsets(app);

  useEffect(() => {
    if (error === null) return;
    console.error(`[${name}] connect failed`, error);
  }, [error, name]);

  return { app, connectError: error !== null ? CONNECT_FAILED_MESSAGE : null };
}
