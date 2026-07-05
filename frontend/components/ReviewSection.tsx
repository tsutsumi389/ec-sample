'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Review } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import RatingStars from '@/components/RatingStars';
import Spinner from '@/components/Spinner';

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
      fetchReviews();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'レビューの投稿に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-12">
      <h2 className="text-lg font-bold text-gray-900">レビュー</h2>
      <div className="mt-2">
        <RatingStars value={avgRating} count={reviewCount} size="md" />
      </div>

      {canShowForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-4 border border-gray-200 bg-gray-50 rounded-lg p-4 md:p-5"
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
          <div className="flex items-center text-gray-600">
            <Spinner className="mr-2" />
            読み込み中...
          </div>
        ) : listError ? (
          <p role="alert" className="text-red-600 text-sm">
            {listError}
          </p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-gray-500">まだレビューはありません。</p>
        ) : (
          <ul className="space-y-4">
            {reviews.map((review) => (
              <li key={review.id} className="border-b border-gray-200 pb-4 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <RatingStars value={review.rating} size="sm" />
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
