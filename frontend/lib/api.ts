import type { AssistantChatResponse, AssistantMessage, ProductQuestion } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const TOKEN_KEY = 'token';

interface ApiErrorDetailItem {
  msg?: string;
}

interface ApiErrorBody {
  detail?: string | ApiErrorDetailItem[] | unknown;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// 会員登録でメールアドレスが重複した場合のメッセージ。フィールドエラーとしての
// 突き合わせにも使うため、定数として公開する（register ページ参照）。
export const EMAIL_ALREADY_REGISTERED_MESSAGE = 'このメールアドレスは既に登録されています。';

// バックエンド（FastAPI）が返す英語の detail をユーザー向けの日本語メッセージへ変換するための対応表。
// 新しいエラー文言をAPI側に追加した場合はここにも追記すること。
const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  'Could not validate credentials': '認証情報を確認できませんでした。再度ログインしてください。',
  'Admin privileges required': 'この操作には管理者権限が必要です。',
  'Product not found': '商品が見つかりませんでした。',
  'Invalid status': '指定されたステータスは無効です。',
  'Order not found': '注文が見つかりませんでした。',
  'Email already registered': EMAIL_ALREADY_REGISTERED_MESSAGE,
  'Incorrect email or password': 'メールアドレスまたはパスワードが正しくありません。',
  'Cart item not found': 'カート内に該当する商品が見つかりませんでした。',
  'Purchase required to review': 'レビューを投稿するには、対象商品の購入が必要です。',
  'Already reviewed': 'この商品には既にレビューを投稿済みです。',
  'Address not found': '指定された住所が見つかりませんでした。',
  'Shipping address is required': 'お届け先住所を指定してください。',
  'Invalid coupon code': '無効なクーポンコードです。',
  'Coupon has expired': 'このクーポンは有効期限が切れています。',
  'Cannot cancel this order': 'この注文はキャンセルできません。',
  'Current password is incorrect': '現在のパスワードが正しくありません。',
  'Slug already exists': 'このスラッグは既に使用されています。',
  'Coupon code already exists': 'このクーポンコードは既に使用されています。',
};

// "Minimum order amount is {n}" のようにサーバー側で埋め込まれる可変値を含む detail に対応する。
// 対応表に完全一致するキーが無い場合、このパターンに一致すればテンプレート化して訳す。
const MIN_ORDER_AMOUNT_PATTERN = /^Minimum order amount is (\d+)$/;

// ステータスコードに応じたフォールバックメッセージ（対応表に無い/未知のdetailの場合に使用）。
function fallbackMessageForStatus(status: number): string {
  if (status === 400) return '入力内容に誤りがあります。内容をご確認のうえ、再度お試しください。';
  if (status === 401) return '認証が必要です。ログインし直してください。';
  if (status === 403) return 'この操作を行う権限がありません。';
  if (status === 404) return '対象のデータが見つかりませんでした。';
  if (status === 422) return '入力内容を確認してください。';
  if (status >= 500) return 'サーバーエラーが発生しました。しばらくしてから再度お試しください。';
  return `リクエストに失敗しました (${status})`;
}

// 英数字のみで構成される文字列は、バックエンドが返す未翻訳の英語メッセージとみなす。
// （日本語の文言は既にAPI側で用意されているものが多く、その場合はそのまま表示する）
const LOOKS_UNTRANSLATED_ENGLISH = /^[\x00-\x7F]*$/;

function translateDetail(status: number, rawDetail: string): string {
  const trimmed = rawDetail.trim();
  if (!trimmed) return fallbackMessageForStatus(status);
  if (KNOWN_ERROR_MESSAGES[trimmed]) return KNOWN_ERROR_MESSAGES[trimmed];
  const minOrderMatch = trimmed.match(MIN_ORDER_AMOUNT_PATTERN);
  if (minOrderMatch) return `このクーポンの利用には ${minOrderMatch[1]} 円以上の注文が必要です。`;
  if (LOOKS_UNTRANSLATED_ENGLISH.test(trimmed)) return fallbackMessageForStatus(status);
  return trimmed;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data: ApiErrorBody = await res.json();
    if (typeof data.detail === 'string') {
      return translateDetail(res.status, data.detail);
    }
    if (Array.isArray(data.detail)) {
      const joined = data.detail
        .map((item) => (typeof item?.msg === 'string' ? item.msg : JSON.stringify(item)))
        .join(', ');
      return translateDetail(res.status, joined);
    }
  } catch {
    // レスポンスボディがJSONでない場合は無視してデフォルトメッセージを使う
  }
  return fallbackMessageForStatus(res.status);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: HeadersInit = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
  }

  if (!res.ok) {
    const message = await parseErrorMessage(res);
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  // signal を渡すと途中キャンセルできる（サジェスト等、古いリクエストを捨てたい用途）。
  get: <T>(path: string, signal?: AbortSignal): Promise<T> =>
    request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),

  // AIショッピングアシスタント。未ログインでも呼べる（会話は端末の localStorage で継続）。
  assistant: {
    // conversation_id が null なら新規会話を作成して返す。
    chat: (conversationId: string | null, message: string): Promise<AssistantChatResponse> =>
      request<AssistantChatResponse>('/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: conversationId, message }),
      }),
    // ウィジェット再オープン時の履歴復元用。会話が無効なら 404。
    messages: (conversationId: string): Promise<AssistantMessage[]> =>
      request<AssistantMessage[]>(`/assistant/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: 'GET',
      }),
  },

  // 商品ページの購入前Q&A。一覧は公開、投稿は要ログイン（AIが同期で回答を生成）。
  productQa: {
    list: (productId: number): Promise<ProductQuestion[]> =>
      request<ProductQuestion[]>(`/products/${productId}/questions`, { method: 'GET' }),
    ask: (productId: number, question: string): Promise<ProductQuestion> =>
      request<ProductQuestion>(`/products/${productId}/questions`, {
        method: 'POST',
        body: JSON.stringify({ question }),
      }),
  },
};
