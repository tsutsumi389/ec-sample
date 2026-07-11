'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Review } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import RatingStars from '@/components/RatingStars';
import { Skeleton } from '@/components/Skeleton';

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
    <section className="mt-12">
      <h2 className="text-xl font-bold text-gray-900">レビュー</h2>

      {/* サマリーヘッダ: 平均点の大きな表示 + 星 + 件数 */}
      <div className="mt-4 flex items-center gap-4">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold tabular-nums text-gray-900">
            {avgRating != null ? avgRating.toFixed(1) : '—'}
          </span>
          <span className="text-sm text-gray-400">/ 5</span>
        </div>
        <div className="flex flex-col gap-1">
          <RatingStars value={avgRating} size="md" showValue={false} />
          <span className="text-xs text-gray-500">
            {reviewCount > 0 ? `${reviewCount}件のレビュー` : 'まだレビューはありません'}
          </span>
        </div>
      </div>

      {canShowForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-lg border border-gray-200 p-4 md:p-5"
        >
          <p className="text-sm font-medium text-gray-700">レビューを投稿する</p>
          <div className="mt-2">
            <RatingStars value={rating} onChange={setRating} interactive size="lg" />
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="コメント（任意）"
            className="mt-3 w-full border border-gray-300 rounded-md bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
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
            {submitting ? '投稿中...' : '投稿する'}
          </button>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <ul className="divide-y divide-gray-200" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="py-4 first:pt-0">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1.5 h-4 w-2/3" />
              </li>
            ))}
          </ul>
        ) : listError ? (
          <p role="alert" className="text-red-600 text-sm">
            {listError}
          </p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-gray-500">最初のレビューをお寄せください。</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {reviews.map((review) => (
              <li key={review.id} className="py-4 first:pt-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <RatingStars value={review.rating} size="sm" showValue={false} />
                  <span className="text-sm font-medium text-gray-900">{review.user_name}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(review.created_at).toLocaleString('ja-JP')}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-1.5 text-sm text-gray-700 whitespace-pre-wrap">{review.comment}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
