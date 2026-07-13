'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChatBubbleIcon, XMarkIcon } from '@/components/Icons';
import AssistantPanel from '@/components/assistant/AssistantPanel';

/**
 * 全ページ右下に常駐する AIショッピングアシスタントのウィジェット。
 * フローティングボタンでパネルを開閉する。
 * 管理画面（/admin 配下）では表示しない。
 */
export default function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // 開くトリガ（FAB）への参照。閉じたときにフォーカスを戻し、キーボード操作の文脈を保つ。
  const fabRef = useRef<HTMLButtonElement>(null);

  // パネルを閉じたら開く前のトリガ（FAB）へフォーカスを返す。
  // パネルのアンマウント後に確実に当てるため次フレームで実行する。
  const handleClose = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => fabRef.current?.focus());
  }, []);

  // パネル（role="dialog" aria-modal）を開いている間は背景ページ（ヘッダー/本文/フッター）を
  // inert + aria-hidden にして不活性化する。Tab フォーカストラップだけでは塞げない
  // スクリーンリーダーの仮想カーソルやポインタ操作からも背景を隔離し、モーダル性を担保する。
  // FAB（閉じるボタン）とパネル自体は body 直下の別要素のため不活性化の対象外。
  useEffect(() => {
    if (!open) return;
    const backdrop = ['header', 'main', 'footer']
      .map((tag) => document.querySelector(tag))
      .filter((el): el is HTMLElement => el instanceof HTMLElement);
    backdrop.forEach((el) => {
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    });
    return () => {
      backdrop.forEach((el) => {
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
      });
    };
  }, [open]);

  // 管理画面ではアシスタントを出さない。
  if (pathname?.startsWith('/admin')) return null;

  return (
    <>
      {open && <AssistantPanel onClose={handleClose} />}

      {/* フローティングボタン。パネル全画面表示のモバイルでは開いている間は隠す。 */}
      <button
        ref={fabRef}
        type="button"
        onClick={() => (open ? handleClose() : setOpen(true))}
        aria-label={open ? 'アシスタントを閉じる' : 'アシスタントを開く'}
        aria-expanded={open}
        className={`fixed bottom-6 right-6 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
          open ? 'hidden sm:inline-flex' : 'inline-flex'
        }`}
      >
        {open ? <XMarkIcon className="h-6 w-6" /> : <ChatBubbleIcon className="h-6 w-6" />}
      </button>
    </>
  );
}
