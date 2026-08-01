'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * 焦点を当てられる要素の定義。**サイト内で唯一の源**にすること。
 *
 * 以前はモーダル・ドロワー・アシスタントの8箇所にこのセレクタ文字列がコピーされていて、
 * `details`/`summary` や `contenteditable` を足したいときに触り漏れが出る状態だった
 * （実際に写しの1つは textarea と select の順が入れ替わっていた）。
 */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab の巡回対象。visibleOnly のときは表示されていない要素を除く（今フォーカスがある要素は残す）。 */
function focusableWithin(container: HTMLElement, visibleOnly: boolean): HTMLElement[] {
  const found = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (!visibleOnly) return found;
  return found.filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Tab の巡回を container の内側で閉じる。端にいるときだけ逆端へ送る。
 *
 * ネイティブの KeyboardEvent でも React の合成イベントでも使えるよう、
 * 必要な2つのメンバだけを構造的に受ける（AssistantPanel はポータル越しに拾うため
 * document のリスナではなく JSX の onKeyDown を使っている）。
 */
export function trapTab(
  container: HTMLElement | null,
  e: { shiftKey: boolean; preventDefault: () => void },
  opts: { visibleOnly?: boolean } = {}
): void {
  if (!container) return;
  const items = focusableWithin(container, opts.visibleOnly ?? false);
  if (items.length === 0) return;

  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export interface FocusTrapOptions {
  /** 罠を張るか。open で出し入れするモーダルは開閉状態を渡す（既定は常時 true）。 */
  active?: boolean;
  /** Escape で閉じる先。毎レンダー新しい関数が渡ってよい（内部で ref に退避する）。 */
  onEscape: () => void;
  /** 開いた瞬間にフォーカスする要素。省略すると器のフォーカスは動かさない。 */
  initialFocus?: RefObject<HTMLElement | null>;
  /** 閉じたとき、開く直前にフォーカスしていた要素へ戻すか。 */
  restoreFocus?: boolean;
  /** 開いているあいだ背面のスクロールを止めるか。 */
  lockScroll?: boolean;
}

/**
 * モーダル・ドロワーの簡易フォーカストラップ。
 * 「Escape で閉じる → Tab を器の内側で循環 → 閉じたらトリガーへフォーカスを戻す」を1本にまとめる。
 *
 * onEscape は ref に退避するので、呼び出し側がインラインのアロー関数を渡しても
 * effect が張り直されない（張り直すと開いている最中にフォーカスを奪い直してしまう）。
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active = true, onEscape, initialFocus, restoreFocus = false, lockScroll = false }: FocusTrapOptions
): void {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;

    // 開く直前のフォーカス要素（＝トリガー）を控える。
    const trigger = restoreFocus ? (document.activeElement as HTMLElement | null) : null;
    initialFocus?.current?.focus();

    const prevOverflow = lockScroll ? document.body.style.overflow : null;
    if (lockScroll) document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      trapTab(containerRef.current, e);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (prevOverflow !== null) document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
    // containerRef / initialFocus は ref オブジェクトなので同一性が安定している。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, restoreFocus, lockScroll]);
}
