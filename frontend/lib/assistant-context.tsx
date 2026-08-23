'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import { MQ_XL } from '@/lib/breakpoints';

/**
 * AIアシスタントの開閉と、サイドバーの寸法を持つ context。
 * パネルの描画・FAB・本文の押し出し・背景の inert は AssistantWidget が持つ（ここは状態だけ）。
 *
 * **context は2本に割ってある**。ページ側が引くのは開閉の指令だけ（`useAssistant`）で、
 * こちらの value は滅多に変わらない。寸法（`useAssistantGeometry`）は幅のドラッグ中に毎フレーム
 * 変わるので、混ぜると `openAssistant` しか使っていない画面まで pointermove ごとに再描画される。
 */

/** 幅の永続化キー。接頭辞は lib/ の他のキー（hibino:guest-cart 等）に揃える。 */
const WIDTH_KEY = 'hibino:assistant-width';

/** 幅の下限。これより狭いと商品カード（列幅下限 20rem）が1列も入らない。 */
export const ASSISTANT_MIN_WIDTH = 320;
/** 既定幅。ハンドルのダブルクリックで戻る値でもある。 */
export const ASSISTANT_DEFAULT_WIDTH = 420;
/** 幅の上限（絶対値）。これ以上広げても行長は .assistant-bubble の 40rem で頭打ちになる。 */
const ASSISTANT_MAX_WIDTH_PX = 720;
/** 幅の上限（ビューポート比）。本文側に最低でも6割は残す。 */
const ASSISTANT_MAX_WIDTH_RATIO = 0.4;

/** そのビューポート幅で許される最大幅。1280px なら 512px、1920px なら 720px。 */
function assistantMaxWidth(viewportWidth: number): number {
  return Math.max(
    ASSISTANT_MIN_WIDTH,
    Math.min(ASSISTANT_MAX_WIDTH_PX, Math.round(viewportWidth * ASSISTANT_MAX_WIDTH_RATIO)),
  );
}

/** 幅を許容範囲へ収める。境界の適用はこの1本だけが行う（実効値の導出も setWidth もここを通す）。 */
function clampWidth(value: number, maxWidth: number): number {
  return Math.round(Math.min(Math.max(value, ASSISTANT_MIN_WIDTH), maxWidth));
}

// SSR（window 不在）と、プライベートモード等での例外は握りつぶす——ここで throw させると
// endResize の途中で抜けて、ポインタ操作の後始末ごと落ちる。
function readStoredWidth(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(stored) && stored >= ASSISTANT_MIN_WIDTH ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredWidth(width: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // 保存できなくても今の幅は効いている。次回オープンが既定幅に戻るだけ。
  }
}

export interface OpenAssistantOptions {
  /** 開いた直後に入力欄へ入れておく文言。**自動送信はしない**（送る前に条件を書き足せる）。 */
  prefill?: string;
  /**
   * 閉じたときにフォーカスを戻す先。開いた側が自分のボタンの ref を渡す。
   * document.activeElement を見て自動で拾わないのは、Safari が button のクリックで
   * フォーカスを移さないため（body が activeElement のままになり戻し先を失う）。
   */
  returnFocusTo?: RefObject<HTMLElement>;
}

/** ページ側が引くチャンネル。開閉の指令だけを持ち、value は滅多に変わらない。 */
interface AssistantContextValue {
  open: boolean;
  /** 開いた直後に入力欄へ入れておく文言（空文字なら素のウェルカム表示）。 */
  prefill: string;
  /**
   * `openAssistant()` が呼ばれるたびに増える通し番号。**接岸中は既に開いているパネルへ向けて
   * 呼ばれうる**（非モーダルなので背後のボタンが押せる）が、パネルは prefill を初期値として
   * しか読まない。番号が無いと同じ文言で2回呼ばれたときに何も起きない（ボタンが壊れて見える）。
   */
  prefillNonce: number;
  /**
   * 閉じたときのフォーカスの戻し先（開いた時点で解決済みの要素）。戻す処理そのものは
   * AssistantWidget が行う（消えていたときの退避先＝FAB を持つのがウィジェット側のため）。
   */
  returnFocusRef: MutableRefObject<HTMLElement | null>;
  openAssistant: (options?: OpenAssistantOptions) => void;
  closeAssistant: () => void;
}

/** AssistantWidget と AssistantPanel だけが引くチャンネル。ドラッグ中は毎フレーム変わる。 */
interface AssistantGeometryValue {
  /**
   * サイドバーとして右端へ接岸できる幅か（= Tailwind の xl 以上）。false の間は全画面の
   * オーバーレイとして開く（本文を詰める余地が無いため）。SSR と hydration 直後は false から
   * 入るが、パネルはクリック後にしかマウントされないのでちらつきにはならない。
   */
  docked: boolean;
  /** 接岸中のサイドバー幅（px）。ビューポートに合わせてクランプ済みの実効値。 */
  width: number;
  /** いま許される最大幅（px）。ハンドルの aria-valuemax と Home キーの飛び先。 */
  maxWidth: number;
  /**
   * 幅を変える。`persist` はドラッグを離した時・キー操作の時だけ true にする
   * （pointermove ごとに localStorage へ書くと、同期書き込みがドラッグの追従を鈍らせる）。
   */
  setWidth: (next: number, persist?: boolean) => void;
  /** 幅のハンドルを掴んでいるか。<html> の印（globals.css §6）とハンドルの着色に使う。 */
  resizing: boolean;
  setResizing: (value: boolean) => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);
const AssistantGeometryContext = createContext<AssistantGeometryValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState('');
  const [prefillNonce, setPrefillNonce] = useState(0);
  // 開いた時点で ref を解決して要素そのものを控える。開いている間に呼び出し側が
  // アンマウントされても（検索結果の入れ替わりなど）、参照は残って isConnected で判定できる。
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [docked, setDocked] = useState(false);
  const [resizing, setResizing] = useState(false);
  // 利用者が選んだ幅（＝保存される値）。クランプ後の値を state に持たない——ウィンドウを
  // 一時的に狭めただけで好みの幅が削られて戻らなくなる（広げ直しても記憶は 320px のまま）。
  const [widthPref, setWidthPref] = useState(ASSISTANT_DEFAULT_WIDTH);
  const [maxWidth, setMaxWidth] = useState(ASSISTANT_MAX_WIDTH_PX);

  useEffect(() => {
    const mql = window.matchMedia(MQ_XL);
    const applyDocked = () => setDocked(mql.matches);
    applyDocked();
    mql.addEventListener('change', applyDocked);
    const stored = readStoredWidth();
    if (stored !== null) setWidthPref(stored);
    return () => mql.removeEventListener('change', applyDocked);
  }, []);

  // 上限の測り直しは **開いている間だけ**。maxWidth = min(720, innerWidth * 0.4) は 1800px
  // 未満では約2.5px ごとに値が変わるので、常時購読するとウィンドウを掴んで動かすだけで、
  // 閉じたアシスタントのために数十回の再描画が全ページで起きる。
  useEffect(() => {
    if (!open) return;
    const measure = () => setMaxWidth(assistantMaxWidth(window.innerWidth));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  // 接岸が解けるとハンドルごと消え、pointerup はどこにも届かない。掴んだ状態を
  // ここで降ろさないと、<html> の印が残ってページ全体が col-resize カーソル＋選択不可で固まる。
  useEffect(() => {
    if (!docked) setResizing(false);
  }, [docked]);

  const width = clampWidth(widthPref, maxWidth);

  const setWidth = useCallback(
    (next: number, persist = false) => {
      const clamped = clampWidth(next, maxWidth);
      setWidthPref(clamped);
      if (persist) writeStoredWidth(clamped);
    },
    [maxWidth],
  );

  const openAssistant = useCallback((options?: OpenAssistantOptions) => {
    returnFocusRef.current = options?.returnFocusTo?.current ?? null;
    setPrefill(options?.prefill ?? '');
    setPrefillNonce((n) => n + 1);
    setOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    setOpen(false);
    // 次に開くときへ持ち越さない。prefill が残っていると、FAB から素直に開いたのに前回の
    // 検索語が入力欄に居座る。戻し先の要素も同様に手放す（外れたDOMノードを掴み続けない）。
    setPrefill('');
    returnFocusRef.current = null;
  }, []);

  const command = useMemo(
    () => ({ open, prefill, prefillNonce, returnFocusRef, openAssistant, closeAssistant }),
    [open, prefill, prefillNonce, openAssistant, closeAssistant],
  );

  const geometry = useMemo(
    () => ({ docked, width, maxWidth, setWidth, resizing, setResizing }),
    [docked, width, maxWidth, setWidth, resizing],
  );

  return (
    <AssistantContext.Provider value={command}>
      <AssistantGeometryContext.Provider value={geometry}>
        {children}
      </AssistantGeometryContext.Provider>
    </AssistantContext.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used within AssistantProvider');
  return ctx;
}

export function useAssistantGeometry(): AssistantGeometryValue {
  const ctx = useContext(AssistantGeometryContext);
  if (!ctx) throw new Error('useAssistantGeometry must be used within AssistantProvider');
  return ctx;
}
