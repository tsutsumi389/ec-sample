'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { ProductQuestion } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { SparklesIcon } from '@/components/Icons';
import Badge from '@/components/Badge';
import SectionHead from '@/components/SectionHead';
import { PlantMotif } from '@/components/BrandMotifs';
import { Skeleton } from '@/components/Skeleton';
import TypingDots from '@/components/TypingDots';
import { btn } from '@/lib/buttonStyles';

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
    // ページ末尾の沈んだ帯。PDP は扉のあと最後まで生成り1色で、後半 2,000px 超に
    // 面の交替がまったく無かった。ここを「沈んだ地＋上下ヘアライン」の帯にして
    // 誌面の終いを1段落とす（.edge-y = line-strong の 1px。border ユーティリティと衝突しない）。
    <section className="edge-y band-lg bg-sunken">
      <div className="wrap">
        {/*
          見出し・説明・「AIが回答」バッジを入力カードと同じ 40rem の柱に乗せる。
          以前は SectionHead だけが wrap(1152) 幅だったため、justify-between で
          バッジが版面の右端（x=1264）へ飛び、40rem の入力カードとは無関係な位置に
          浮いていた（1つの帯に柱が2本立っている状態）。
        */}
        <div className="max-w-[40rem]">
          <SectionHead
            title="この商品について質問する"
            eyebrow="ASK ABOUT THIS"
            subtitle="サイズ感・用途・お手入れなど、気になることをAIが商品情報とレビューをもとにお答えします。"
            right={
              <Badge variant="brand" className="gap-1 whitespace-nowrap">
                <SparklesIcon className="h-3.5 w-3.5" />
                AIが回答
              </Badge>
            }
            className="mb-8"
          />
        </div>

        {/*
          左＝質問する（読み物幅 40rem の柱。版面いっぱいの入力欄は管理画面のフォームに
          見えるため広げない）、右＝これまでの質問。
          以前は右 510px が高さ 900px 以上にわたって空いていた。柱を保ったまま
          余りを「読む側」に使い、帯が約束した面積を埋める。
          パネルは沈んだ帯の上に置くので、地は surface（＋ヘアライン）で浮かせる。
        */}
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] lg:items-start">
          {/* max-w は 1カラムに畳まれる <lg 用（lg では列幅が上限を決める）。 */}
          <div className="min-w-0 max-w-[40rem]">
            {user != null ? (
              <form
                onSubmit={handleSubmit}
                className="rounded-xl border border-line bg-surface p-5 md:p-6"
              >
                <label
                  htmlFor="product-qa-input"
                  className="block text-caption font-medium text-ink-muted"
                >
                  質問を書く
                </label>
                <textarea
                  id="product-qa-input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="例: 食洗機で洗えますか？ / 一人暮らしでも使いやすいサイズですか？"
                  // resize-none: 既定のグラバーは体系外の造形なので出さない（高さは rows で決める）。
                  // 角丸は外側パネル（rounded-xl=12）の1段内側＝rounded-lg(8)。
                  className="mt-2 w-full resize-none rounded-lg border border-line-input bg-surface px-3.5 py-3 text-body text-ink transition-[border-color,box-shadow] duration-fast ease-standard focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
                {formError && (
                  <p role="alert" className="mt-2 text-body text-critical-700">
                    {formError}
                  </p>
                )}
                {/* ボタンは入力欄の右下に置く（左寄せの単独ボタンは管理画面の作法） */}
                <div className="mt-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                  <span className="mr-auto text-caption tnum text-ink-muted">
                    {question.length} / 300
                  </span>
                  <button type="submit" disabled={submitting} className={btn('primary', 'md')}>
                    {submitting ? 'AIが回答を作成中...' : 'AIに質問する'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="rounded-xl border border-line bg-surface p-5 md:p-6">
                <p className="text-body text-ink-soft">
                  質問するには
                  <Link href="/login" className="mx-1 font-medium text-brand-700 hover:underline">
                    ログイン
                  </Link>
                  してください。
                </p>
              </div>
            )}
          </div>

          <div className="min-w-0 max-w-[40rem]">
            {/* 右柱の頭。質問が1件も無いときは空状態の箱が自分で名乗るので出さない。 */}
            {!loading && !listError && questions.length > 0 && (
              <p className="mb-3 text-caption font-medium text-ink-muted">
                これまでの質問 <span className="tnum">{questions.length}</span> 件
              </p>
            )}
            {/* 送信中は生成待ちのタイピングインジケータを先頭に表示する（点の造形は TypingDots）。 */}
            {submitting && (
              <div className="mb-4 flex items-center gap-1.5 rounded-lg bg-surface px-4 py-3 shadow-paper">
                <TypingDots />
                <span className="ml-2 text-caption text-ink-muted">AIが回答を作成しています…</span>
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
              <p role="alert" className="text-body text-critical-700">
                {listError}
              </p>
            ) : questions.length === 0 ? (
              // 空状態は「中央寄せの EmptyState」ではなく、直上の投稿パネルと同じ
              // 左端・同じ幅の箱にする。1セクションの中に「左揃え」と「中央揃え」の
              // 2つの整列規則が同居していたのを1つに畳む。
              <div className="flex items-center gap-5 rounded-xl border border-line bg-surface px-5 py-8 md:px-6">
                <PlantMotif className="h-16 w-auto shrink-0 text-line-strong" aria-hidden />
                <div className="min-w-0">
                  <p className="font-mincho text-h3 text-ink jp-head">まだ質問はありません</p>
                  <p className="mt-1 text-body text-ink-muted">
                    サイズ感・用途・お手入れなど、気になることをどうぞ。
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-5">
                {questions.map((qa) => (
                  <li key={qa.id} className="rounded-xl bg-surface p-5 shadow-paper">
                    {/* 質問 */}
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunken text-caption font-bold text-ink-muted">
                        Q
                      </span>
                      <div className="min-w-0">
                        <p className="whitespace-pre-wrap text-body font-medium text-ink">
                          {qa.question}
                        </p>
                        <p className="mt-0.5 text-caption text-ink-muted">
                          {qa.asker_name}・{new Date(qa.created_at).toLocaleString('ja-JP')}
                        </p>
                      </div>
                    </div>
                    {/* AI回答 */}
                    <div className="mt-3 flex items-start gap-2 border-t border-line pt-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                        <SparklesIcon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="whitespace-pre-wrap text-body text-ink-soft">{qa.answer}</p>
                        {!qa.answerable && (
                          <Badge variant="accent" className="mt-1.5">
                            商品情報からは判断できませんでした
                          </Badge>
                        )}
                        <p className="mt-1.5 text-caption text-ink-muted">
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
        </div>
      </div>
    </section>
  );
}
