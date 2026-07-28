'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';

/**
 * AIアシスタントの開閉をページ側から呼べるようにするための context。
 *
 * 開閉状態は AssistantWidget が useState で抱えていたが、それだと右下の FAB からしか
 * 開けない。検索0件のような「行き止まりの画面」から相談へ送る導線は、その画面の中に
 * 置けないと機能しない（利用者が右下のボタンに気づく前に離脱する）ため、状態を
 * layout の provider へ上げて `openAssistant()` を全ページから呼べる形にする。
 *
 * パネルの描画・FAB・背景の inert は引き続き AssistantWidget が持つ（ここは状態だけ）。
 */

export interface OpenAssistantOptions {
  /**
   * 開いた直後に入力欄へ入れておく文言。**自動送信はしない**
   * （パネル内のサジェスト chip と同じ規律。送る前に条件を書き足せる状態で渡す）。
   */
  prefill?: string;
  /**
   * 閉じたときにフォーカスを戻す先。開いた側が自分のボタンの ref を渡す。
   * document.activeElement を見て自動で拾わないのは、Safari が button のクリックで
   * フォーカスを移さないため（body が activeElement のままになり戻し先を失う）。
   */
  returnFocusTo?: RefObject<HTMLElement>;
}

interface AssistantContextValue {
  /** パネルが開いているか。 */
  open: boolean;
  /** 開いた直後に入力欄へ入れておく文言（空文字なら素のウェルカム表示）。 */
  prefill: string;
  /**
   * 閉じたときのフォーカスの戻し先（開いた時点で解決済みの要素）。
   * 戻す処理そのものは AssistantWidget が行う（消えていたときの退避先＝FAB を持つのが
   * ウィジェット側のため）。
   */
  returnFocusRef: MutableRefObject<HTMLElement | null>;
  openAssistant: (options?: OpenAssistantOptions) => void;
  closeAssistant: () => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState('');
  // 開いた時点で ref を解決して要素そのものを控える。開いている間に呼び出し側が
  // アンマウントされても（検索結果の入れ替わりなど）、参照は残って isConnected で判定できる。
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const openAssistant = useCallback((options?: OpenAssistantOptions) => {
    returnFocusRef.current = options?.returnFocusTo?.current ?? null;
    setPrefill(options?.prefill ?? '');
    setOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    setOpen(false);
    // 次に開くときへ持ち越さない。prefill が残っていると、FAB から素直に開いたのに
    // 前回の検索語が入力欄に居座る。戻し先の要素も同様に手放す（閉じ方によっては
    // 使われないまま残り、外れたDOMノードを掴み続けることになる）。
    setPrefill('');
    returnFocusRef.current = null;
  }, []);

  const value = useMemo(
    () => ({ open, prefill, returnFocusRef, openAssistant, closeAssistant }),
    [open, prefill, openAssistant, closeAssistant]
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used within AssistantProvider');
  return ctx;
}
