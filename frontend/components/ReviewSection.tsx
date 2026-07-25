'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Review } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import RatingStars from '@/components/RatingStars';
import SectionHead from '@/components/SectionHead';
import { Skeleton } from '@/components/Skeleton';
import { btn } from '@/lib/buttonStyles';

interface ReviewSectionProps {
  productId: number;
  avgRating: number | null;
  reviewCount: number;
}

/**
 * 商品詳細のレビュー欄。
 * - GET /products/{id}/reviews を新しい順に表示。
 * - ログイン中かつ自分のレビューが無い場合は投稿フォームを表示する。
 *   購入資格が無い場合(403)や二重投稿(400)は送信時にAPIエラーメッセージ(日本語化済み)を表示する。
 */
export default function ReviewSection({ productId, avgRating, reviewCount }: ReviewSectionProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchReviews = useCallback(() => {
    setLoading(true);
    setListError('');
    api
      .get<Review[]>(`/products/${productId}/reviews`)
      .then(setReviews)
      .catch(() => setListError('レビューの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const alreadyReviewed = user != null && reviews.some((r) => r.user_id === user.id);
  const canShowForm = user != null && !alreadyReviewed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setFormError('評価を選択してください');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await api.post<Review>(`/products/${productId}/reviews`, {
        rating,
        comment: comment.trim() || undefined,
      });
      setRating(0);
      setComment('');
      showToast('レビューを投稿しました', { type: 'success' });
      fetchReviews();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'レビューの投稿に失敗しました';
      setFormError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <SectionHead
        title="レビュー"
        eyebrow="REVIEWS"
        right={
          reviewCount > 0 ? (
            <p className="text-body text-ink-muted">
              全 <span className="text-num-lg tnum text-ink">{reviewCount}</span> 件
            </p>
          ) : undefined
        }
      />

      {/* サマリーヘッダ: 平均点の大きな表示 + 星 + 件数 */}
      <div className="mt-6 flex items-center gap-4">
        <div className="flex items-baseline gap-1">
          {/* 数値は自前トークン（num-lg）で組む。素の Tailwind 目盛り（text-4xl）に
              逃げると、同じ「大きい数字」がページごとに別の号数になる。 */}
          <span className="tnum text-num-lg text-ink">
            {avgRating != null ? avgRating.toFixed(1) : '—'}
          </span>
          <span className="text-caption text-ink-muted">/ 5</span>
        </div>
        <div className="flex flex-col gap-1">
          <RatingStars value={avgRating} size="md" showValue={false} />
          <span className="text-caption text-ink-muted">
            {reviewCount > 0 ? `${reviewCount}件のレビュー` : 'まだレビューはありません'}
          </span>
        </div>
      </div>

      {/* 投稿フォームの造形は Q&A と1つに揃える（同じ役割の箱が同じページに2種あると
          様式が割れる）。ヘアライン＋surface の面で、下の沈んだ Q&A 帯とも重ならない。 */}
      {canShowForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 max-w-[40rem] rounded-xl border border-line bg-surface p-5 md:p-6"
        >
          <p className="text-caption font-medium text-ink-muted">レビューを投稿する</p>
          <div className="mt-2">
            <RatingStars value={rating} onChange={setRating} interactive size="lg" />
          </div>
          {/* resize-none: 既定のグラバーは体系外の造形。角丸は外側パネルの1段内側。 */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="コメント（任意）"
            className="mt-3 w-full resize-none rounded-lg border border-line-input bg-surface px-3.5 py-3 text-body text-ink transition-[border-color,box-shadow] duration-fast ease-standard focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          {formError && (
            <p role="alert" className="mt-2 text-body text-critical-700">
              {formError}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={submitting} className={btn('primary', 'md')}>
              {submitting ? '投稿中...' : '投稿する'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <ul className="divide-y divide-line" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="py-4 first:pt-0">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1.5 h-4 w-2/3" />
              </li>
            ))}
          </ul>
        ) : listError ? (
          <p role="alert" className="text-body text-critical-700">
            {listError}
          </p>
        ) : reviews.length === 0 ? (
          <p className="text-body text-ink-muted">最初のレビューをお寄せください。</p>
        ) : (
          <ul className="divide-y divide-line">
            {reviews.map((review) => (
              <li key={review.id} className="py-5 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <RatingStars value={review.rating} size="sm" showValue={false} />
                  <span className="text-body font-medium text-ink">{review.user_name}</span>
                  <span className="text-caption tnum text-ink-muted">
                    {new Date(review.created_at).toLocaleString('ja-JP')}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-1.5 whitespace-pre-wrap text-body text-ink-soft">{review.comment}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
