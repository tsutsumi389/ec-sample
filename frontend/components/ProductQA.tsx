'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { ProductQuestion } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { SparklesIcon } from '@/components/Icons';
import { Skeleton } from '@/components/Skeleton';

interface ProductQAProps {
  productId: number;
}

/**
 * 商品詳細の購入前Q&A欄。
 * - GET /products/{id}/questions を新しい順に表示（公開・未ログインでも閲覧可）。
 * - ログイン中はAIへの質問フォームを表示。送信すると同期でAI回答を生成し、先頭に追加する。
 *   answerable===false は「情報不足」、source==='fallback' は自動回答不可の定型文を表す。
 * - 未ログイン時はログイン誘導のみ表示する。
 */
export default function ProductQA({ productId }: ProductQAProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [questions, setQuestions] = useState<ProductQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchQuestions = useCallback(() => {
    setLoading(true);
    setListError('');
    api
      .productQa.list(productId)
      .then(setQuestions)
      .catch(() => setListError('Q&Aの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) {
      setFormError('質問を入力してください');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const created = await api.productQa.ask(productId, trimmed);
      // 新しい質問を先頭に差し込む（APIも新しい順で返すため整合する）。
      setQuestions((prev) => [created, ...prev]);
      setQuestion('');
      showToast('AIが回答しました', { type: 'success' });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '質問の送信に失敗しました';
      setFormError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold text-gray-900">この商品について質問する</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
          <SparklesIcon className="h-3.5 w-3.5" />
          AIが回答
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        サイズ感・用途・お手入れなど、気になることをAIが商品情報とレビューをもとにお答えします。
      </p>

      {user != null ? (
        <form
          onSubmit={handleSubmit}
          className="mt-5 rounded-lg border border-gray-200 p-4 md:p-5"
        >
          <label htmlFor="product-qa-input" className="text-sm font-medium text-gray-700">
            質問する
          </label>
          <textarea
            id="product-qa-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="例: 食洗機で洗えますか？ / 一人暮らしでも使いやすいサイズですか？"
            className="mt-2 w-full border border-gray-300 rounded-md bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {formError && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-3 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-sm font-medium rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'AIが回答を作成中...' : 'AIに質問する'}
          </button>
        </form>
      ) : (
        <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 md:p-5">
          <p className="text-sm text-gray-700">
            質問するには
            <Link href="/login" className="mx-1 font-medium text-brand-600 hover:underline">
              ログイン
            </Link>
            してください。
          </p>
        </div>
      )}

      <div className="mt-6">
        {/* 送信中は生成待ちのタイピングインジケータを先頭に表示する。 */}
        {submitting && (
          <div className="mb-4 flex items-center gap-1 rounded-lg border border-gray-100 bg-white px-3 py-3">
            <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
            <span className="ml-2 text-xs text-gray-500">AIが回答を作成しています…</span>
          </div>
        )}

        {loading ? (
          <ul className="space-y-4" aria-hidden="true">
            {Array.from({ length: 2 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1.5 h-4 w-2/3" />
              </li>
            ))}
          </ul>
        ) : listError ? (
          <p role="alert" className="text-red-600 text-sm">
            {listError}
          </p>
        ) : questions.length === 0 ? (
          <p className="text-sm text-gray-500">まだ質問はありません。最初の質問をどうぞ。</p>
        ) : (
          <ul className="space-y-5">
            {questions.map((qa) => (
              <li key={qa.id} className="rounded-lg border border-gray-200 p-4">
                {/* 質問 */}
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                    Q
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">{qa.question}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {qa.asker_name}・{new Date(qa.created_at).toLocaleString('ja-JP')}
                    </p>
                  </div>
                </div>
                {/* AI回答 */}
                <div className="mt-3 flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <SparklesIcon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{qa.answer}</p>
                    {!qa.answerable && (
                      <span className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                        商品情報からは判断できませんでした
                      </span>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      {qa.source === 'llm'
                        ? 'AIによる自動回答です。正確な情報は商品説明もあわせてご確認ください。'
                        : 'ただいま自動回答をご用意できませんでした。'}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
