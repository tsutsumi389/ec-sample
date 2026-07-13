'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { AssistantMessage, AssistantProduct, AssistantSource } from '@/lib/types';
import Spinner from '@/components/Spinner';
import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  XMarkIcon,
} from '@/components/Icons';
import AssistantProductCard from '@/components/assistant/AssistantProductCard';

// 会話IDの永続化キー。端末単位で会話を継続する（未ログインでも利用可）。
const CONVERSATION_ID_KEY = 'assistant_conversation_id';
// パネル表示サイズの永続化キー。次回オープン時に同じ広さで開く。
const PANEL_SIZE_KEY = 'assistant_panel_size';

// 入力の最大文字数。残数カウンタと入力制限に共有する。
const MAX_INPUT_LENGTH = 500;

// 初回オープン時のウェルカム文言（クライアント固定・API は呼ばない）。
const WELCOME_MESSAGE =
  'こんにちは。生活道具店 Hibino の店員AIです。ご予算やお探しの用途を教えていただければ、ぴったりの商品をご提案します。';

// サジェスト chips。タップで入力欄に文言を挿入する（自動送信はしない）。
const SUGGESTIONS = [
  'ギフトを探す',
  '予算5,000円で探す',
  '一人暮らし向けの調理道具',
  '来客用の食器',
  '毎日使えるマグカップ',
  '新生活の準備におすすめ',
];

// 人気カテゴリのショートカット。タップで「〇〇を見たい」を入力欄へ挿入する。
const CATEGORY_SHORTCUTS = ['キッチン用品', '食器・グラス', '掃除・洗濯', '収納・整理', 'インテリア'];

// はじめての方向けの簡単な使い方ガイド。
const USAGE_GUIDE = [
  '用途・ご予算・お相手を教えてください',
  'ぴったりの商品をAIがご提案します',
  '気になった商品はそのままカートへ',
];

// パネル表示サイズ。normal→wide→full の順に主要作業領域を広げる。
type PanelSize = 'normal' | 'wide' | 'full';
const SIZE_ORDER: PanelSize[] = ['normal', 'wide', 'full'];

// デスクトップ（sm 以上）でのパネル寸法。モバイルは常に全画面（inset-0）。
const SIZE_CLASSES: Record<PanelSize, string> = {
  // normal でも lg/xl/2xl では幅・高さを段階的に広げ、開いた瞬間から大画面を活用する。
  // 幅が広がるとスクロール領域のコンテナクエリが働き、xl(≈820px)以上で商品リストが3列化する。
  // 高さの上限は calc(100vh-11rem)。bottom-24(6rem) と合わせ上端に約5rem の余白を残し、
  // サイトヘッダー（検索/カート/ログイン）に重ならないようにする。
  normal:
    'sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[600px] sm:max-h-[calc(100vh-9rem)] sm:w-[400px] md:w-[440px] lg:h-[720px] lg:max-h-[calc(100vh-11rem)] lg:w-[600px] xl:h-[820px] xl:w-[820px] 2xl:w-[900px]',
  // wide は上端をヘッダー下（top-20）に置き、大画面の縦幅をほぼ占有しつつヘッダーを露出させる。
  wide: 'sm:inset-auto sm:top-20 sm:bottom-6 sm:right-6 sm:h-auto sm:w-[560px] md:w-[680px] lg:w-[820px] xl:w-[960px]',
  full: 'sm:inset-6 sm:h-auto sm:w-auto',
};

const SIZE_LABELS: Record<PanelSize, string> = {
  normal: 'ワイド表示に広げる',
  wide: '全画面表示に広げる',
  full: '通常表示に戻す',
};

function getStoredPanelSize(): PanelSize {
  if (typeof window === 'undefined') return 'normal';
  const stored = window.localStorage.getItem(PANEL_SIZE_KEY);
  if (stored === 'normal' || stored === 'wide' || stored === 'full') return stored;
  // 保存値が無い初回は、超ワイド画面（2xl ≧ 1536px）では既定を wide に昇格させ、
  // 手動トグル無しでも大画面の余白を埋める（狭い画面は従来どおり normal）。
  return window.innerWidth >= 1536 ? 'wide' : 'normal';
}

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
  const [size, setSize] = useState<PanelSize>('normal');
  // 入場アニメーション用。マウント直後に true にしてフェード/スライドインさせる。
  const [entered, setEntered] = useState(false);
  // 上へスクロール中に新着が届いたことを示す「新着へ移動」インジケータ。
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  // 送信時に最新の会話IDを参照するため ref で保持（stale closure 回避）。
  const conversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 直近の応答をスクリーンリーダーへ通知するための文字列（aria-live 領域に流す）。
  const [liveMessage, setLiveMessage] = useState('');
  // ユーザーが最下部付近を見ているか。自動スクロール要否の判定に使う。
  const atBottomRef = useRef(true);

  // 広い表示（wide/full）では商品カードを複数列化し、バブル行長も広げる。
  const expanded = size !== 'normal';

  // 保存済みの表示サイズを復元し、入場アニメーションを開始する。
  useEffect(() => {
    setSize(getStoredPanelSize());
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // マウント（＝パネルオープン）時に入力欄へフォーカスする。
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  // メッセージ追加・タイピング表示のたびにスクロール位置を調整する。
  // 自分の発言、または最下部を見ているときだけ追従し、そうでなければ新着インジケータを出す。
  useEffect(() => {
    if (initializing) return;
    const last = messages[messages.length - 1];
    if (atBottomRef.current || last?.role === 'user' || sending) {
      scrollToBottom();
    } else {
      setShowJumpToLatest(true);
    }
  }, [messages, sending, initializing, scrollToBottom]);

  // スクロール位置を監視し、最下部付近かどうかを記録する。
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = nearBottom;
    if (nearBottom) setShowJumpToLatest(false);
  };

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setInput('');
      atBottomRef.current = true;
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
        setLiveMessage(res.reply);
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
        setLiveMessage(message);
      } finally {
        setSending(false);
        // 送信後に入力欄へフォーカスを戻す。
        inputRef.current?.focus();
      }
    },
    [sending],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  // サジェスト chip タップ：入力欄に挿入してフォーカス（自動送信はしない）。
  const handleSuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  // カテゴリショートカット：該当カテゴリを見たい旨を入力欄へ挿入する。
  const handleCategory = (name: string) => {
    handleSuggestion(`${name}のおすすめを見たい`);
  };

  // 「新しい会話を始める」：localStorage の会話IDを破棄して画面をリセットする。
  const handleReset = () => {
    clearStoredConversationId();
    conversationIdRef.current = null;
    setMessages([]);
    setInput('');
    setLiveMessage('');
    inputRef.current?.focus();
  };

  // 表示サイズを normal→wide→full→normal と循環させ、localStorage に保持する。
  const cycleSize = () => {
    setSize((prev) => {
      const next = SIZE_ORDER[(SIZE_ORDER.indexOf(prev) + 1) % SIZE_ORDER.length];
      if (typeof window !== 'undefined') window.localStorage.setItem(PANEL_SIZE_KEY, next);
      return next;
    });
  };

  // Esc で閉じる／Tab を dialog 内に閉じ込める（フォーカストラップ）。
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const root = panelRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const items = Array.from(focusable).filter((el) => el.offsetParent !== null || el === document.activeElement);
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
  };

  const showWelcome = !initializing && messages.length === 0;
  const remaining = MAX_INPUT_LENGTH - input.length;
  const nearLimit = remaining <= 50;

  // バブルの行長：狭い時は幅いっぱい寄り、広い時は ch 上限で読みやすさを保つ（全角30〜40字目安）。
  const bubbleWidth = expanded
    ? 'max-w-[88%] lg:max-w-[70ch]'
    : 'max-w-[88%] lg:max-w-[42ch] xl:max-w-[48ch]';
  // 商品リストはパネル実幅に追従（コンテナクエリ）。normal でも広ければ複数列化する。
  const productLayout = 'assistant-product-grid';

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="ショッピングアシスタント"
      onKeyDown={handleKeyDown}
      className={`fixed inset-0 z-50 flex flex-col bg-white shadow-2xl transition-all duration-300 ease-out sm:rounded-2xl sm:border sm:border-gray-200 ${
        SIZE_CLASSES[size]
      } ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <SparklesIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-gray-900">Hibino の店員AI</p>
          <p className="text-xs leading-tight text-gray-600">お買い物のご相談を承ります</p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          title="新しい会話を始める"
          aria-label="新しい会話を始める"
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:min-h-0"
        >
          <ArrowPathIcon className="h-4 w-4" />
          <span className="hidden sm:inline">新しい会話</span>
        </button>
        {/* 拡大/縮小トグル。モバイルは常に全画面のため非表示。 */}
        <button
          type="button"
          onClick={cycleSize}
          title={SIZE_LABELS[size]}
          aria-label={SIZE_LABELS[size]}
          className="hidden h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:inline-flex"
        >
          {size === 'full' ? (
            <ArrowsPointingInIcon className="h-5 w-5" />
          ) : (
            <ArrowsPointingOutIcon className="h-5 w-5" />
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:h-9 sm:w-9"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* メッセージリスト */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="assistant-scroll h-full space-y-4 overflow-y-auto bg-gray-50 px-4 py-4"
        >
          {initializing ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <>
              {showWelcome && (
                // ウェルカムは上詰めで各セクションを一定間隔（gap-4）に並べ、
                // chips とガイドの間に大きな空白が残らないようにする。
                <div className="mx-auto flex max-w-[70ch] flex-col gap-4">
                  <div className={`${bubbleWidth} rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-relaxed text-gray-800 shadow-sm`}>
                    {WELCOME_MESSAGE}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-600">こんなご相談から</p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSuggestion(s)}
                          className="inline-flex min-h-[44px] items-center rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-xs text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:min-h-0"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-600">人気のカテゴリから</p>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORY_SHORTCUTS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleCategory(c)}
                          className="inline-flex min-h-[44px] items-center rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs text-gray-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:min-h-0"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white/70 p-4">
                    <p className="mb-2 text-xs font-semibold text-gray-600">かんたん3ステップ</p>
                    <ol className="space-y-2">
                      {USAGE_GUIDE.map((step, i) => (
                        <li key={step} className="flex items-start gap-2 text-xs leading-relaxed text-gray-700">
                          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {messages.map((msg) =>
                msg.role === 'user' ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className={`${bubbleWidth} whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white`}>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="space-y-2">
                    <div
                      className={`${bubbleWidth} whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                        msg.isError ? 'bg-amber-50 text-amber-800' : 'bg-white text-gray-800'
                      }`}
                    >
                      {msg.content}
                    </div>
                    {msg.products.length > 0 && (
                      <div className={productLayout}>
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
                      <p className="text-xs text-gray-600">キーワード検索の結果です</p>
                    )}
                  </div>
                ),
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

        {/* 新着へ移動：上へスクロール中に応答が届いたときだけ表示する。 */}
        {showJumpToLatest && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <ArrowDownIcon className="h-4 w-4" />
            新着メッセージへ移動
          </button>
        )}

        {/* スクリーンリーダー向けの応答通知（視覚的には非表示）。 */}
        <div aria-live="polite" role="status" className="sr-only">
          {liveMessage}
        </div>
      </div>

      {/* 入力欄 */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
            maxLength={MAX_INPUT_LENGTH}
            placeholder={sending ? 'AIが考えています…' : 'メッセージを入力'}
            className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="送信"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
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
        </div>
        {/* 文字数カウンタ。上限が近づいたら警告色で残数を示す。 */}
        <div className="mt-1 flex justify-end px-1">
          <span
            className={`text-[11px] tabular-nums ${nearLimit ? 'text-amber-600' : 'text-gray-500'}`}
            aria-live="polite"
          >
            {input.length}/{MAX_INPUT_LENGTH}
          </span>
        </div>
      </form>
    </div>
  );
}
