'use client';

import { FormEvent, MouseEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { AssistantMessage, AssistantProduct, AssistantSource } from '@/lib/types';
import Spinner from '@/components/Spinner';
import TypingDots from '@/components/TypingDots';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from '@/components/Icons';
import { btn, chip, iconBtn } from '@/lib/buttonStyles';
import { trapTab } from '@/lib/focusTrap';
import { fetchCategories } from '@/lib/categories';
import { withWordBreaks } from '@/lib/wordBreak';
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
// 複数タップは追記になる（書きかけを消さない）。
const SUGGESTIONS = [
  'ギフトを探す',
  '予算5,000円で探す',
  '一人暮らし向けの調理道具',
  '来客用の食器',
  '毎日使えるマグカップ',
  '新生活の準備におすすめ',
];

// ウェルカムに並べるカテゴリ chip の数。多すぎると chip の列が挨拶を押し下げる。
const MAX_CATEGORY_SHORTCUTS = 5;

// 丸型 chip の造形は lib/buttonStyles.ts が持つ（提案カードの操作行と同じ源）。
const CHIP_CLASS = chip();

// はじめての方向けの簡単な使い方ガイド。
const USAGE_GUIDE = [
  '用途・ご予算・お相手を教えてください',
  'ぴったりの商品をAIがご提案します',
  '気になった商品はそのままカートへ',
];

/**
 * ウェルカムの「見出し＋ chip の羅列」。サジェストとカテゴリで造形が同じなので器を1つにする
 * （別々に書くと chip の造形を直すとき片方だけ直った状態が生まれる）。
 * 小見出しは和文の太字ゴシックではなく、サイト共通の eyebrow 体系
 * （Footer の columnHeadClass・注文履歴の ledgerHeadClass と同じ語彙）で組む。
 *
 * memo 境界でもある。ウェルカムが出ているのは「最初の相談文を打ち込んでいる最中」そのもので、
 * 文字数カウンタがあるため1打鍵ごとに必ず再描画が走る。中身は withWordBreaks
 * （= Intl.Segmenter の語分割）を chip の数だけ通すので、memo が無いと 30 字打つあいだに
 * 11 語 × 30 回ぶんの語分割をやり直すことになる（AssistantProductCard と同じ判断）。
 * items は定数か state、onPick は useCallback 済みで同一性が保たれる。
 */
const ChipGroup = memo(function ChipGroup({
  label,
  items,
  onPick,
}: {
  label: string;
  items: string[];
  onPick: (item: string) => void;
}) {
  // 取得に失敗したカテゴリなど、粒が無いときは見出しごと出さない。
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-eyebrow uppercase font-num text-ink-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button key={item} type="button" onClick={() => onPick(item)} className={CHIP_CLASS}>
            {withWordBreaks(item)}
          </button>
        ))}
      </div>
    </div>
  );
});

// パネル表示サイズ。normal→wide→full の順に主要作業領域を広げる。
type PanelSize = 'normal' | 'wide' | 'full';
const SIZE_ORDER: PanelSize[] = ['normal', 'wide', 'full'];

// デスクトップ（sm 以上）でのパネル寸法。モバイルは常に全画面（inset-0）。
const SIZE_CLASSES: Record<PanelSize, string> = {
  // normal でも lg/xl/2xl では幅・高さを段階的に広げ、開いた瞬間から大画面を活用する。
  // 商品リストの列数はスクロール領域の実幅から auto-fill が決める（globals.css の
  // .assistant-product-grid）ので、ここで与えるのは幅だけでよい。
  // 高さの上限は sm から一貫して calc(100vh-11rem)。bottom-24(6rem) と合わせ上端に約5rem の
  // 余白を残し、サイトヘッダー（検索/カート/ログイン。--header-h: 4rem）に重ならないようにする。
  // 横向きスマホ（高さ約390px）ではこの上限で 214px の箱になる。狭さ自体はここでは解かず、
  // ヘッダーとの重なりだけを断つ。
  normal:
    'sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[600px] sm:max-h-[calc(100vh-11rem)] sm:w-[400px] md:w-[440px] lg:h-[720px] lg:max-h-[calc(100vh-11rem)] lg:w-[600px] xl:h-[820px] xl:w-[820px] 2xl:w-[900px]',
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
  // エラーの種類。会話上限（limit）のときだけ「新しい会話を始める」を出し分ける。
  errorKind?: 'limit' | 'other';
  // 「もう一度聞く」で再送する文言。失敗した発話は楽観バブルごと取り消すため messages から
  // 導出できない（直前に成功した別の質問を誤って再送してしまう）。エラーバブル自身に持たせる。
  retryText?: string;
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
  /**
   * パネル内のリンクで遷移するときに呼ぶ。閉じないと背景に張った inert が残り、
   * 遷移先のページが一切操作できなくなる（onClose と違いフォーカスは FAB へ戻さない）。
   */
  onNavigate: () => void;
  /**
   * 開いた直後に入力欄へ入れておく文言（検索0件からの相談導線など）。
   * **自動送信はしない**——サジェスト chip と同じ規律で、送る前に予算などを書き足せる
   * 状態にしておく。パネルは開くたびにマウントし直されるので初期値として読むだけでよい。
   */
  prefill?: string;
}

export default function AssistantPanel({ onClose, onNavigate, prefill = '' }: AssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(prefill);
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [size, setSize] = useState<PanelSize>(() => getStoredPanelSize());
  // 入場アニメーション用。マウント直後に true にしてフェード/スライドインさせる。
  const [entered, setEntered] = useState(false);
  // 上へスクロール中に新着が届いたことを示す「新着へ移動」インジケータ。
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  // 「新しい会話」の確認ダイアログ。履歴の消去は破壊的操作なので確認を挟む（サイト内の他4箇所と同じ扱い）。
  const [resetOpen, setResetOpen] = useState(false);
  // 継続中の会話ID。送信先であり、「新しい会話」ボタンの表示条件でもある。
  // ボタンの表示条件は「画面に消すものがあるか」ではなく「消せる会話があるか」——
  // 履歴復元が 404 以外（500・通信断）で失敗すると messages は空のまま会話IDだけが残るので、
  // messages.length だけで判定するとその会話を捨てる手段が画面から消える。
  const [conversationId, setConversationId] = useState<string | null>(null);
  // ウェルカムに出すカテゴリ chip。固定文字列で持っていた頃は、シードの実カテゴリ
  // （キッチン家電・生活家電・日用品・アウトドア・ファッション小物）と1つも一致せず、
  // 押すと店に無い分類名で相談文が組まれてキーワード候補が必ず空振りしていた。
  // カテゴリの唯一の取得口（進行中の Promise を共有して往復を1回に畳む）から引く。
  const [categories, setCategories] = useState<string[]>([]);
  // 会話の世代。「新しい会話」を押すたびに増やし、飛行中の send() の結果を捨てる目印にする。
  // これが無いと、送信中にリセットしても応答が返った時点で会話IDが復活し、
  // 空のスレッドに「問いの無い回答」だけが積まれる。
  const sessionRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 直近の応答をスクリーンリーダーへ通知するための文字列（aria-live 領域に流す）。
  const [liveMessage, setLiveMessage] = useState('');
  // ユーザーが最下部付近を見ているか。自動スクロール要否の判定に使う。
  const atBottomRef = useRef(true);

  // 会話IDの更新点をここ1箇所に集約する。state（送信先・ボタンの表示条件）と
  // localStorage（次回オープンの復元）がずれると、消したはずの会話へ追記される／
  // 会話を捨てる手段が画面から消える、といった食い違いがそのまま表に出る。
  const applyConversationId = useCallback((id: string | null) => {
    setConversationId(id);
    if (id) storeConversationId(id);
    else clearStoredConversationId();
  }, []);

  // 入場アニメーションを開始する（表示サイズは useState の遅延初期化で初回ペイントから確定させる。
  // effect で後から入れると transition-all で 280ms の変形が見える）。
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // マウント（＝パネルオープン）時に入力欄へフォーカスする。
  // prefill 付きで開いたときはキャレットを末尾へ送る。focus() だけだと初期値が全選択される
  // 実装があり、条件を書き足すつもりの1打鍵で渡した文言ごと消えてしまう。
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  // カテゴリ chip の中身を取りに行く。失敗したら chip の行ごと出さない
  // （サジェスト chip と使い方ガイドは残るので行き止まりにはならない）。
  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((list) => {
        if (!cancelled) {
          setCategories(list.slice(0, MAX_CATEGORY_SHORTCUTS).map((c) => c.name));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // マウント（＝パネルオープン）時に履歴を復元する。
  useEffect(() => {
    let cancelled = false;
    const storedId = getStoredConversationId();
    applyConversationId(storedId);

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
          applyConversationId(null);
        }
        // それ以外のエラーは黙ってウェルカム表示にフォールバック（次回送信で継続を試みる）。
        // 会話IDは保持したままなので、conversationId を見ている「新しい会話」で捨てられる。
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyConversationId]);

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
    // ウェルカム表示（履歴が空）のときは追従しない。ウェルカム塊はスクロール域より背が高く、
    // 最下部へ送ると挨拶バブルとサジェスト chip が開いた瞬間に画面外へ流れてしまう。
    if (messages.length === 0) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      atBottomRef.current = true;
      // 履歴が空になる経路（「新しい会話」）では新着インジケータも必ず畳む。押されると
      // ウェルカム塊が最下部まで送られ、この分岐が防いでいる「頭が見えない」状態を作ってしまう。
      setShowJumpToLatest(false);
      return;
    }
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

      // 待っている間に「新しい会話」が押されたら、この送信の結果は捨てる（世代ガード）。
      const session = sessionRef.current;
      // 失敗時に楽観バブルを取り消せるよう、自分が積んだ user 発言のIDを控える。
      const userMsgId = nextMessageId();

      // 入力欄は「いま送る文言がそのまま残っているとき」だけ空にする。無条件に消していた頃は、
      // 「もう一度聞く」（フォームを経由せずここへ来る）が、catch で気を遣って戻した文言や
      // 書きかけの相談文まで巻き添えで捨てていた（サジェスト chip の追記仕様と同じ規律）。
      setInput((cur) => (cur.trim() === trimmed ? '' : cur));
      atBottomRef.current = true;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', content: trimmed, products: [] },
      ]);
      setSending(true);
      // タイピング表示は視覚的な合図でしかないので、送信を受け付けたことを言葉でも伝える。
      setLiveMessage('送信しました。回答を作成しています');

      try {
        // conversationId は state から読む。send は必ずイベントハンドラ経由で呼ばれ、
        // その時点の描画のクロージャが渡るので、ID が古いことはない。
        const res = await api.assistant.chat(conversationId, trimmed);
        if (sessionRef.current !== session) return;
        applyConversationId(res.conversation_id);
        // 型上は必ず配列だが、古いバックエンドでの欠損に備えて防御的に畳んでおく。
        const products = Array.isArray(res.products) ? res.products : [];
        setMessages((prev) => [
          ...prev,
          {
            id: nextMessageId(),
            role: 'assistant',
            content: res.reply,
            source: res.source,
            products,
          },
        ]);
        // 提案商品はカード群としてしか現れないので、何件届いたかを本文と一緒に読み上げさせる。
        setLiveMessage(
          products.length ? `${res.reply} 商品を${products.length}件ご提案しています` : res.reply,
        );
      } catch (err) {
        // 世代が変わっている（待っている間に「新しい会話」が押された）送信は、成功も失敗も
        // 一切の副作用を起こさない。ここより後ろに 404 の後始末を置くと、破棄すべき応答が
        // 現在有効な別の会話IDを localStorage から消してしまう。
        if (sessionRef.current !== session) return;
        // 会話上限・API エラー時もメッセージとして表示し、throw しない。
        const apiErr = err instanceof ApiError ? err : null;
        const message =
          apiErr?.message ??
          '申し訳ありません。通信に失敗しました。しばらくしてから再度お試しください。';
        // 会話上限（400）だけは「新しい会話」への案内を出したいので種別を分ける。
        const errorKind: 'limit' | 'other' = apiErr?.status === 400 ? 'limit' : 'other';
        // 会話が無効（404）なら会話IDを捨てる。次回送信が新規会話に落ち、
        // 無効なIDのまま永久に失敗し続けるループを断つ（履歴復元側と扱いを揃える）。
        if (apiErr?.status === 404) applyConversationId(null);
        // 失敗時はサーバー側に何も保存されていない（chat は成功時にしか commit しない）ので、
        // 楽観表示した user バブルを取り消して表示とサーバー履歴を一致させ、
        // 入力文を戻してそのまま再送できるようにする（書きかけがあれば上書きしない）。
        // 消した発話はエラーバブルに retryText として預け、「もう一度聞く」の再送元にする。
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== userMsgId),
          {
            id: nextMessageId(),
            role: 'assistant',
            content: message,
            products: [],
            isError: true,
            errorKind,
            retryText: trimmed,
          },
        ]);
        setInput((cur) => (cur ? cur : trimmed));
        setLiveMessage(message);
      } finally {
        // 世代が変わっていたら送信状態には触らない。「新しい会話」は sending を落として
        // 即座に入力を受け付けるので、ここで無条件に実行すると破棄されたはずの応答が
        // 最大60秒後（backend の _CHAT_TIMEOUT）にフォーカスを奪いに来る。
        if (sessionRef.current === session) {
          setSending(false);
          // 送信後に入力欄へフォーカスを戻す。
          inputRef.current?.focus();
        }
      }
    },
    [sending, conversationId, applyConversationId],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  // サジェスト chip タップ：入力欄へ**追記**してフォーカス（自動送信はしない）。
  // 上書きにすると、書きかけの相談文が chip を1つ触っただけで消える。追記なら
  // 「ギフトを探す」＋「予算5,000円で探す」のように条件を重ねられる。
  // useCallback は ChipGroup の memo 境界のため（打鍵ごとに作り直すと bail out しない）。
  const handleSuggestion = useCallback((text: string) => {
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
    inputRef.current?.focus();
  }, []);

  // カテゴリ chip タップ：分類名をそのまま入れず、相談文の形にして追記する。
  const handleCategoryPick = useCallback(
    (name: string) => handleSuggestion(`${name}のおすすめを見たい`),
    [handleSuggestion],
  );

  // 「新しい会話を始める」：localStorage の会話IDを破棄して画面をリセットする。
  // 世代を進めることで、飛行中の send() が返ってきても会話IDを書き戻さないようにする。
  // sending も落とす：飛行中のリクエストは世代ガードで捨てられるので待つ理由が無く、
  // 残したままだと真新しい会話が応答（最大60秒）まで readOnly で固まる。
  const handleReset = () => {
    sessionRef.current += 1;
    applyConversationId(null);
    setMessages([]);
    setInput('');
    setLiveMessage('');
    setSending(false);
    setShowJumpToLatest(false);
    inputRef.current?.focus();
  };

  // パネル内のリンクで遷移するときの共通ハンドラ。修飾キー付きクリックと中クリックは
  // ブラウザが新規タブ／ウィンドウで開き、next/link も router.push をスキップする（isModifiedEvent）。
  // ここで畳むと、現在のタブでは何も起きないのに相談中の会話だけが視界から消える。
  // 引数なしでも呼べるようにしてあるのは、ボタンから router.push する経路（カードのログイン導線）で
  // 無条件に閉じたいため。
  const handleNavigate = useCallback(
    (e?: MouseEvent<HTMLElement>) => {
      if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
      onNavigate();
    },
    [onNavigate],
  );

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
    // 確認ダイアログが開いている間はキー操作をそちらへ譲る。ConfirmDialog は body へポータルしても
    // React の合成イベントは JSX ツリーを辿るのでこの onKeyDown まで上がってくる。ダイアログ側の Esc は
    // document リスナなので、譲らないとキャンセルより先にパネルごと閉じてしまう。
    if (resetOpen) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    // 巡回そのものは共有の trapTab に任せる（フォーカス可能要素の定義は lib/focusTrap.ts が唯一の源）。
    // 罫を畳んだ問い合わせ履歴など隠れている要素があるので、visibleOnly で除く。
    trapTab(panelRef.current, e, { visibleOnly: true });
  };

  const showWelcome = !initializing && messages.length === 0;
  const remaining = MAX_INPUT_LENGTH - input.length;
  const nearLimit = remaining <= 50;

  // バブルの行長は .assistant-bubble（globals.css §6）がスクロール領域の実幅から決める。
  // 表示サイズ（normal/wide/full）で分岐させないのは、同じ幅でも size が違えば行長が変わる
  // ような二重の基準を作らないため。

  // ルートの tabIndex={-1} は、本文のドラッグ選択・バブル余白やカードの空き部分のタップで
  // activeElement が body へ落ちて onKeyDown が発火しなくなる（Escape も Tab トラップも死ぬ）
  // 経路を塞ぐためのもの。-1 なので Tab の巡回対象（[tabindex]:not([tabindex="-1"])）には入らない。
  //
  // ルートで補間するのは入場の opacity/transform だけ（transition-[opacity,transform]）。
  // transition-all だと表示サイズの切り替え（normal→wide）で top が auto→80px、
  // height が 820px→auto と補間できない値をまたぐため、幅だけが滑って上端と高さが瞬間移動していた。
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="ショッピングアシスタント"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={`fixed inset-0 z-50 flex flex-col bg-surface shadow-float transition-[opacity,transform] duration-slow ease-standard sm:rounded-2xl ${
        SIZE_CLASSES[size]
      } ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
    >
      {/* ヘッダー。丸アイコンではなく節記号（brand の縦罫）＋ eyebrow ＋ 明朝の見出しで、
          サイトの扉（PageMasthead・ProductFilters の絞り込みドロワー）と同じ組み方に揃える。
          text-h3 の fontWeight:500 は Zen Old Mincho が 700 しか持たないためフォントマッチングで
          700 面が選ばれる（合成ボールドにはならない）。
          下端の罫は line ではなく line-strong。すぐ下がスクロール面（bg-page）で、
          line は対 page 1.28:1 とほぼ見えず、ヘッダーが帯として閉じない。 */}
      <div className="flex items-center gap-3 border-b border-line-strong px-4 py-3">
        <span aria-hidden className="h-5 w-[2px] shrink-0 bg-brand-600" />
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow uppercase font-num text-ink-muted">ASK HIBINO</p>
          <p className="mt-1 font-mincho text-h3 text-ink jp-head">Hibino の店員AI</p>
          <p className="text-caption text-ink-muted">お買い物のご相談を承ります</p>
        </div>
        {/* 捨てられる会話が無い（履歴も会話IDも無い）ときだけ出さない。復元に失敗して画面が空でも
            会話IDが残っていれば出す。送信中も無効化しない（世代ガードで整合が取れる）。
            btn('ghost','sm') は h-9 だが .hit（globals.css §5）が ±6px 広げるので実効48px。 */}
        {(messages.length > 0 || conversationId !== null) && (
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            title="新しい会話を始める"
            aria-label="新しい会話を始める"
            className={btn('ghost', 'sm')}
          >
            <ArrowPathIcon className="h-4 w-4" />
            <span className="hidden sm:inline">新しい会話</span>
          </button>
        )}
        {/* 拡大/縮小トグル。モバイルは常に全画面のため非表示。
            iconBtn('sm') は .hit で実効44pxを作るので、モバイル用の h-11 分岐は要らない。 */}
        <button
          type="button"
          onClick={cycleSize}
          title={SIZE_LABELS[size]}
          aria-label={SIZE_LABELS[size]}
          className={`${iconBtn('sm')} hidden sm:inline-flex`}
        >
          {size === 'full' ? (
            <ArrowsPointingInIcon className="h-5 w-5" />
          ) : (
            <ArrowsPointingOutIcon className="h-5 w-5" />
          )}
        </button>
        <button type="button" onClick={onClose} aria-label="閉じる" className={iconBtn('sm')}>
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* メッセージリスト */}
      <div className="relative flex-1 overflow-hidden">
        {/* テキストだけの応答が続くとスクロール領域に一つもフォーカス対象が無くなり、
            キーボードだけでは履歴を遡れなくなる。tabIndex={0} で領域自体を到達可能にし、
            何の領域かを role/aria-label で名乗る。親が overflow-hidden なのでフォーカスリングは
            ring-inset にしないと切り取られる。 */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          tabIndex={0}
          role="region"
          aria-label="会話履歴"
          className="assistant-scroll h-full space-y-4 overflow-y-auto bg-page px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
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
                // mx-auto は付けない：中央寄せにすると、下に続くメッセージ列（左原点）と
                // ウェルカムの左端が段差する。
                <div className="flex max-w-[40rem] flex-col gap-4">
                  <div className="assistant-bubble rounded-2xl bg-surface px-4 py-3 text-body text-ink-soft shadow-paper">
                    {WELCOME_MESSAGE}
                  </div>

                  <ChipGroup label="SUGGESTED" items={SUGGESTIONS} onPick={handleSuggestion} />
                  {/* カテゴリは取得できたときだけ出る（0件なら ChipGroup が見出しごと畳む）。 */}
                  <ChipGroup label="CATEGORIES" items={categories} onPick={handleCategoryPick} />

                  {/* 地は surface。面の階層は surface > tile > page > sunken の4段しかないので、
                      surface/70 のような5段目の中間色をここだけ作らない。 */}
                  <div className="rounded-2xl bg-surface p-4 shadow-paper">
                    <p className="mb-2 text-eyebrow uppercase font-num text-ink-muted">HOW IT WORKS</p>
                    <ol className="space-y-2">
                      {USAGE_GUIDE.map((step, i) => (
                        <li key={step} className="flex items-start gap-2 text-caption text-ink-soft">
                          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-eyebrow tnum text-brand-700">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {/* 発言の区切りが左右配置と背景色にしか無いと、SR には無名の文章の羅列として届く。
                  list セマンティクスで1発言=1項目にし、話者は sr-only の固定文言で名乗る。
                  role="log" は付けない（list を壊し、下の status 領域と二重に読み上げられる）。
                  0件のときは描画しない：空の ul でも space-y-4 の margin は残り、ウェルカムの下に
                  余白が増えるうえ SR が「リスト 0項目」と読み上げる。 */}
              {messages.length > 0 && (
                <ul className="space-y-4">
                  {messages.map((msg, index) => {
                    const isLast = index === messages.length - 1;
                    // 会話が本当に行き止まりになる末尾の応答にだけ、次の一手を並べる。
                    // 「0件」だけを条件にしない：LLM が「ご予算はいくらでしょうか」と聞き返す応答も
                    // 商品0件で返る（services/assistant.py）。進行中の会話に離脱導線を出すと、
                    // 同じ質問を再送して同じ聞き返しが返るループになる。
                    // fallback も商品付きで返るのが既定（_fallback は人気順に落ちる）なので、
                    // カードが並んでいる限り行き止まりではない。
                    const showActions =
                      isLast &&
                      msg.role === 'assistant' &&
                      (msg.isError || (msg.source === 'fallback' && msg.products.length === 0));
                    // 再送する文言はエラーバブル自身が持つ（messages からは取り消し済みで拾えない）。
                    // ローカルに束ねるのは、プロパティの絞り込みが onClick のクロージャまで
                    // 伝播しないため（そのまま使うと非 null 表明が要る）。
                    const retryText = msg.retryText;
                    return msg.role === 'user' ? (
                      <li key={msg.id}>
                        {/* sr-only は position:absolute なので、直下に置いても flex の配置に響かない。 */}
                        <span className="sr-only">あなた: </span>
                        {/* 自分の発言は右寄せ（この flex）だけで判別できるので、地は brand 塗りにしない。
                            塗りを外して淡い brand の面＋内側リングにし、誌面の面の階層に戻す。 */}
                        <div className="flex justify-end">
                          <div className="assistant-bubble whitespace-pre-wrap break-words rounded-2xl bg-brand-50 px-4 py-2.5 text-body text-brand-900 ring-1 ring-inset ring-brand-200">
                            {msg.content}
                          </div>
                        </div>
                      </li>
                    ) : (
                      <li key={msg.id} className="space-y-2">
                        <div
                          className={`assistant-bubble whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-body shadow-paper ${
                            msg.isError ? 'bg-critical-50 text-critical-700' : 'bg-surface text-ink-soft'
                          }`}
                        >
                          {/* 話者名は li 直下ではなくバブルの中に置く。li の space-y-2 は最初の子以外に
                              margin-top を付けるので、直下に挿すとバブルが 8px 下がってしまう。
                              エラーであることも色でしか示していないため、ここで言葉にする。 */}
                          <span className="sr-only">{msg.isError ? '店員AI（エラー）: ' : '店員AI: '}</span>
                          {msg.content}
                        </div>
                        {msg.products.length > 0 && (
                          // 列数は auto-fill がグリッド実幅から決める（globals.css の
                          // .assistant-product-grid。列幅の下限 20rem は「カートに追加」が
                          // 1行に収まる寸法）。normal でも広ければそのぶん列が増える。
                          <div
                            className="assistant-product-grid"
                            role="group"
                            aria-label={`提案商品 ${msg.products.length}件`}
                          >
                            {msg.products.map((item) => (
                              <AssistantProductCard
                                key={item.product.id}
                                product={item.product}
                                reason={item.reason}
                                onNavigate={handleNavigate}
                              />
                            ))}
                          </div>
                        )}
                        {showActions && (
                          // 行き止まりを作らないための次の一手。会話上限のときだけ「新しい会話」を出す
                          // （もう操作できない履歴なので、ここでは確認ダイアログを挟まない）。
                          // 「もう一度聞く」は失敗した発話があるとき（＝エラー）だけ。0件のフォールバックで
                          // 出すと、同じ質問を投げ直して同じ結果を受け取るだけの chip になる。
                          // 一覧へは検索クエリを付けない：/products の検索は文字列全体の部分一致で、
                          // 相談文をそのまま渡すとほぼ確実に0件の、より悪い行き止まりへ着地する。
                          <div className="flex flex-wrap gap-2 pt-1">
                            {msg.errorKind === 'limit' && (
                              <button type="button" onClick={handleReset} className={CHIP_CLASS}>
                                新しい会話を始める
                              </button>
                            )}
                            {retryText && (
                              <button
                                type="button"
                                onClick={() => void send(retryText)}
                                className={CHIP_CLASS}
                              >
                                もう一度聞く
                              </button>
                            )}
                            <Link href="/products" onClick={handleNavigate} className={CHIP_CLASS}>
                              商品一覧から探す
                            </Link>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* 生成待ちのタイピングインジケータ（点の造形と周期は TypingDots が持つ）。 */}
              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl bg-surface px-4 py-3 shadow-paper">
                    <TypingDots />
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
            className={`${btn('secondary', 'sm')} absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-lift`}
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
        className="border-t border-line px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {/* 送信中も input/button を disabled にしない。disabled にすると activeElement が body へ落ち、
            応答が返るまで（最大60秒）Escape も Tab トラップも効かなくなるうえ、finally の
            inputRef.focus() は再描画前に走るため復帰もしない。readOnly / aria-disabled なら
            フォーカスは入力欄に留まったまま、編集と押下の意味だけを止められる。
            二重送信・空送信は send() 冒頭の `if (!trimmed || sending) return;` が防ぐ。
            入力欄には aria-disabled を **付けない**。readOnly は「フォーカスできるが編集できない」を
            aria-readonly として自動で公開するのに対し、aria-disabled は「操作できない」と名乗る別の状態で、
            両者を併記すると支援技術に矛盾が届く。スクリーンリーダーのフォームモードには
            aria-disabled の要素を読み飛ばす実装があり、それではフォーカスを入力欄へ留めた意味が消える。
            送信中であることは上の status 領域が可聴で伝えている。 */}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            readOnly={sending}
            maxLength={MAX_INPUT_LENGTH}
            aria-describedby="assistant-input-hint"
            placeholder={sending ? 'AIが考えています…' : 'メッセージを入力'}
            // 本文バブルと違い text-sm のまま。text-body は行送り1.85なので、py-2.5＋罫と合わせると
            // 実高が約50pxになり、隣の送信ボタン（h-11=44px）と行内で高さが揃わない。
            className="min-w-0 flex-1 rounded-full border border-line-input bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-600 read-only:bg-sunken"
          />
          <button
            type="submit"
            aria-disabled={sending || !input.trim()}
            aria-label="送信"
            // 止め方は aria-disabled（disabled 属性ではない）。無効の面は chip() の solid が
            // 両方の止め方に効かせているので、ここは造形を選ぶだけでよい。
            className={chip('icon', 'solid')}
          >
            {sending ? (
              // label={null} で aria-hidden にする。中身が空のまま新規挿入される live 領域は
              // 読まれない組み合わせが多いので通知役は持たせない（状態通知は上の status 領域へ
              // 一本化する）。軌道は currentColor なので brand 塗りの中では白になる。
              <Spinner label={null} className="h-5 w-5" />
            ) : (
              <PaperAirplaneIcon className="h-5 w-5" />
            )}
          </button>
        </div>
        {/* 上限は静的な説明として一度だけ伝える。カウンタを aria-live で流すと1打鍵ごとに
            「12/500」が割り込み、かな漢字変換の候補読み上げを潰す。maxLength が上限を物理的に
            保証しているので、逐次通知には情報価値がない。 */}
        <span id="assistant-input-hint" className="sr-only">
          最大{MAX_INPUT_LENGTH}文字
        </span>
        {/* 文字数カウンタ。上限が近づいたら警告色で残数を示す（目で見るための表示）。 */}
        <div className="mt-1 flex justify-end px-1">
          <span
            aria-hidden="true"
            className={`text-caption tnum ${nearLimit ? 'text-accent-700' : 'text-ink-muted'}`}
          >
            {input.length}/{MAX_INPUT_LENGTH}
          </span>
        </div>
      </form>

      {/* 確認ダイアログは body 直下へポータルする。このパネルのルートは入場アニメの translate-y を
          常に持ち、transform を持つ要素は position:fixed の含有ブロックになるため、ツリー内に
          置くと `fixed inset-0` の膜と中央寄せがパネルの箱（400〜900px）に閉じ込められ、
          ページ全体が暗転しない・ボタン行が 320px に潰れる。
          React の合成イベントはポータル越しでも JSX ツリーを辿って伝わるので、handleKeyDown 先頭の
          `if (resetOpen) return;`（Esc をダイアログへ譲るガード）は引き続き必要。
          パネルはクリック後にしかマウントされないが、SSR で document が無い場合に備えて存在を確かめる。 */}
      {typeof document !== 'undefined' &&
        createPortal(
          <ConfirmDialog
            open={resetOpen}
            title="新しい会話を始めますか"
            description="いまの相談内容は表示されなくなります。"
            confirmLabel="新しい会話を始める"
            danger
            onConfirm={() => {
              setResetOpen(false);
              handleReset();
            }}
            onCancel={() => setResetOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
}
