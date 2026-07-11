'use client';

import { useState } from 'react';
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

  // 管理画面ではアシスタントを出さない。
  if (pathname?.startsWith('/admin')) return null;

  return (
    <>
      {open && <AssistantPanel onClose={() => setOpen(false)} />}

      {/* フローティングボタン。パネル全画面表示のモバイルでは開いている間は隠す。 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
