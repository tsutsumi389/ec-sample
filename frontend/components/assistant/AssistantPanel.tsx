'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { AssistantMessage, AssistantProduct, AssistantSource } from '@/lib/types';
import Spinner from '@/components/Spinner';
import { ArrowPathIcon, PaperAirplaneIcon, SparklesIcon, XMarkIcon } from '@/components/Icons';
import AssistantProductCard from '@/components/assistant/AssistantProductCard';

// 会話IDの永続化キー。端末単位で会話を継続する（未ログインでも利用可）。
const CONVERSATION_ID_KEY = 'assistant_conversation_id';

// 初回オープン時のウェルカム文言（クライアント固定・API は呼ばない）。
const WELCOME_MESSAGE =
  'こんにちは。生活道具店 Hibino の店員AIです。ご予算やお探しの用途を教えていただければ、ぴったりの商品をご提案します。';

// サジェスト chips。タップで入力欄に文言を挿入する（自動送信はしない）。
const SUGGESTIONS = [
  'ギフトを探す',
  '予算5,000円で探す',
  '一人暮らし向けの調理道具',
  '来客用の食器',
];

// パネル内で保持するメッセージ（React key 用の id を付与）。
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: AssistantSource | null;
  products: AssistantProduct[];
  // API 通信失敗などのクライアント側エラー表示。会話上限・障害時もここで表示する（throw しない）。
  isError?: boolean;
}

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `m${messageCounter}`;
}

function getStoredConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(CONVERSATION_ID_KEY);
}

function storeConversationId(id: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONVERSATION_ID_KEY, id);
}

function clearStoredConversationId(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CONVERSATION_ID_KEY);
}

// 履歴 API のメッセージを内部表現へ整形する。products は防御的に空配列へフォールバック。
function toChatMessage(msg: AssistantMessage): ChatMessage {
  return {
    id: nextMessageId(),
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content ?? '',
    source: msg.source ?? null,
    products: Array.isArray(msg.products) ? msg.products : [],
  };
}

interface AssistantPanelProps {
  onClose: () => void;
}

export default function AssistantPanel({ onClose }: AssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // 送信時に最新の会話IDを参照するため ref で保持（stale closure 回避）。
  const conversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // マウント（＝パネルオープン）時に履歴を復元する。
  useEffect(() => {
    let cancelled = false;
    const storedId = getStoredConversationId();
    conversationIdRef.current = storedId;

    if (!storedId) {
      setInitializing(false);
      return;
    }

    api.assistant
      .messages(storedId)
      .then((history) => {
        if (cancelled) return;
        setMessages(history.map(toChatMessage));
      })
      .catch((err) => {
        if (cancelled) return;
        // 会話が無効（404）なら localStorage を破棄して新規会話扱いにする。
        if (err instanceof ApiError && err.status === 404) {
          clearStoredConversationId();
          conversationIdRef.current = null;
        }
        // それ以外のエラーは黙ってウェルカム表示にフォールバック（次回送信で継続を試みる）。
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // メッセージ追加・タイピング表示のたびに最下部へスクロールする。
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, initializing]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: nextMessageId(), role: 'user', content: trimmed, products: [] },
    ]);
    setSending(true);

    try {
      const res = await api.assistant.chat(conversationIdRef.current, trimmed);
      conversationIdRef.current = res.conversation_id;
      storeConversationId(res.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'assistant',
          content: res.reply,
          source: res.source,
          products: Array.isArray(res.products) ? res.products : [],
        },
      ]);
    } catch (err) {
      // 会話上限・API エラー時もメッセージとして表示し、throw しない。
      const message =
        err instanceof ApiError
          ? err.message
          : '申し訳ありません。通信に失敗しました。しばらくしてから再度お試しください。';
      setMessages((prev) => [
        ...prev,
        { id: nextMessageId(), role: 'assistant', content: message, products: [], isError: true },
      ]);
    } finally {
      setSending(false);
      // 送信後に入力欄へフォーカスを戻す。
      inputRef.current?.focus();
    }
  }, [sending]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  // サジェスト chip タップ：入力欄に挿入してフォーカス（自動送信はしない）。
  const handleSuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  // 「新しい会話を始める」：localStorage の会話IDを破棄して画面をリセットする。
  const handleReset = () => {
    clearStoredConversationId();
    conversationIdRef.current = null;
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  };

  const showWelcome = !initializing && messages.length === 0;

  return (
    <div
      role="dialog"
      aria-label="ショッピングアシスタント"
      className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[600px] sm:max-h-[calc(100vh-8rem)] sm:w-[380px] sm:rounded-2xl sm:border sm:border-gray-200"
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <SparklesIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 leading-tight">Hibino の店員AI</p>
          <p className="text-xs text-gray-500 leading-tight">お買い物のご相談を承ります</p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          title="新しい会話を始める"
          aria-label="新しい会話を始める"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          <ArrowPathIcon className="h-4 w-4" />
          <span className="hidden sm:inline">新しい会話</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* メッセージリスト */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-gray-50 px-4 py-4">
        {initializing ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            {showWelcome && (
              <div className="space-y-3">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm leading-relaxed text-gray-800 shadow-sm">
                  {WELCOME_MESSAGE}
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSuggestion(s)}
                      className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-brand-600 px-3 py-2 text-sm leading-relaxed text-white">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="space-y-2">
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-relaxed shadow-sm ${
                      msg.isError ? 'bg-amber-50 text-amber-800' : 'bg-white text-gray-800'
                    }`}
                  >
                    {msg.content}
                  </div>
                  {msg.products.length > 0 && (
                    <div className="space-y-2">
                      {msg.products.map((item) => (
                        <AssistantProductCard
                          key={item.product.id}
                          product={item.product}
                          reason={item.reason}
                        />
                      ))}
                    </div>
                  )}
                  {msg.source === 'fallback' && !msg.isError && (
                    <p className="text-xs text-gray-400">キーワード検索の結果です</p>
                  )}
                </div>
              )
            )}

            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white px-3 py-3 shadow-sm">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 入力欄 */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-gray-200 px-3 py-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          maxLength={500}
          placeholder={sending ? 'AIが考えています…' : 'メッセージを入力'}
          className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="送信"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          {sending ? (
            <span
              role="status"
              aria-label="送信中"
              className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          ) : (
            <PaperAirplaneIcon className="h-5 w-5" />
          )}
        </button>
      </form>
    </div>
  );
}
