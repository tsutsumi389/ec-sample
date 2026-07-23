/**
 * 行動イベントの記録。
 *
 * イベントは都度送らずキューに溜め、一定件数・一定間隔・ページ離脱時にまとめて送る。
 * 1 クリックごとにリクエストを飛ばすと通信が増えて描画を邪魔するため。
 *
 * 記録した内容は A/Bテストの成果集計にそのまま使われる（サーバー側で曝露と JOIN する）。
 * ただし購入・カート投入のような重要な指標はサーバー側でも記録しているので、ここでの
 * 取りこぼしが結論を左右することはない。
 */

import { API_BASE_URL, VISITOR_ID_HEADER, getToken } from './api';
import { getSessionId, getVisitorId } from './visitor';

/** 予約イベント名。バックエンドの services/analytics.py と一致させること。 */
export const EVENT_PAGE_VIEW = 'page_view';
export const EVENT_CLICK = 'click';
export const EVENT_IMPRESSION = 'impression';
export const EVENT_BEGIN_CHECKOUT = 'begin_checkout';

export interface TrackOptions {
  /** どのUI要素か。レイアウト実験ではこれを軸にクリック分布の変化を見る。 */
  elementKey?: string;
  /** 金額やスクロール率などの数値指標。 */
  value?: number;
  /** 商品IDなど分析用の付随情報。 */
  props?: Record<string, unknown>;
  /** 明示しない場合は現在のパスを使う。 */
  path?: string;
}

interface QueuedEvent {
  name: string;
  path: string | null;
  element_key: string | null;
  value: number | null;
  props: Record<string, unknown> | null;
  session_id: string | null;
  occurred_at: string;
}

// この件数に達したら即送信する。サーバー側の受信上限（50件）より小さくしておく。
const MAX_BATCH = 20;
// 溜まりきらないイベントを送るまでの待ち時間。
const FLUSH_INTERVAL_MS = 5000;

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersReady = false;

function currentPath(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.pathname + window.location.search;
}

async function send(events: QueuedEvent[]): Promise<void> {
  const visitorId = getVisitorId();
  if (!visitorId || events.length === 0) return;
  const token = getToken();
  try {
    await fetch(`${API_BASE_URL}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [VISITOR_ID_HEADER]: visitorId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ events }),
      // ページ遷移・タブを閉じる直前でも送信を完了させる。
      keepalive: true,
    });
  } catch {
    // 計測の失敗は無視する。再送すると離脱時に積み上がるので捨てる方を選ぶ。
  }
}

/** 溜まっているイベントを即座に送信する。 */
export function flush(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const pending = queue;
  queue = [];
  void send(pending);
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

function ensureListeners(): void {
  if (listenersReady || typeof window === 'undefined') return;
  listenersReady = true;
  // タブを閉じる・バックグラウンドに回る直前に送り切る。モバイルでは pagehide が
  // 発火しないことがあるため visibilitychange も併せて見る。
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

/** イベントを 1 件記録する（実際の送信はまとめて行われる）。 */
export function track(name: string, options: TrackOptions = {}): void {
  if (typeof window === 'undefined') return;
  ensureListeners();
  queue.push({
    name,
    path: options.path ?? currentPath(),
    element_key: options.elementKey ?? null,
    value: options.value ?? null,
    props: options.props ?? null,
    session_id: getSessionId(),
    occurred_at: new Date().toISOString(),
  });
  if (queue.length >= MAX_BATCH) {
    flush();
  } else {
    scheduleFlush();
  }
}

/** クリックを記録する。element_key は「どのボタンか」を表す安定した識別子にする。 */
export function trackClick(elementKey: string, props?: Record<string, unknown>): void {
  track(EVENT_CLICK, { elementKey, props });
}

/** 要素が実際に画面に入ったことを記録する（表示されただけで押されていない、を測る）。 */
export function trackImpression(elementKey: string, props?: Record<string, unknown>): void {
  track(EVENT_IMPRESSION, { elementKey, props });
}
