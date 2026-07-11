'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { api, ApiError } from '@/lib/api';
import type { WishlistItem } from '@/lib/types';

interface WishlistButtonProps {
  productId: number;
  /** 初期状態でお気に入り登録済みかどうか（一覧取得元から渡す）。省略時は未登録扱い。 */
  initialFavorited?: boolean;
  className?: string;
}

/**
 * 商品のお気に入り登録/解除をトグルするハートボタン。
 * - 未ログイン時はクリックで /login へ遷移させる（トグルは行わない）。
 * - 楽観的更新を行い、API失敗時は表示を元に戻す。
 * - Link コンポーネント内（ProductCard 等）に置かれても親へのクリック伝播/遷移を止める。
 */
export default function WishlistButton({ productId, initialFavorited = false, className = '' }: WishlistButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      router.push('/login');
      return;
    }

    if (pending) return;

    const nextFavorited = !favorited;
    setFavorited(nextFavorited);
    setPending(true);

    try {
      if (nextFavorited) {
        await api.post<WishlistItem>('/wishlist/items', { product_id: productId });
        showToast('お気に入りに追加しました', {
          type: 'success',
          action: { label: 'お気に入りを見る', href: '/wishlist' },
        });
      } else {
        await api.delete(`/wishlist/items/${productId}`);
        showToast('お気に入りから削除しました', { type: 'success' });
      }
    } catch (err) {
      setFavorited(!nextFavorited);
      showToast('お気に入りの更新に失敗しました。時間をおいてお試しください。', { type: 'error' });
      if (!(err instanceof ApiError)) {
        throw err;
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={favorited ? 'お気に入りから削除' : 'お気に入りに追加'}
      title={favorited ? 'お気に入りから削除' : 'お気に入りに追加'}
      className={`inline-flex items-center justify-center rounded-full bg-white/90 shadow-sm border border-gray-200 p-1.5 text-gray-400 transition-colors duration-150 hover:text-red-500 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
        favorited ? 'text-red-500' : ''
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4"
        fill={favorited ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 20.25c-.3 0-.6-.088-.856-.264C7.32 17.44 3 14.03 3 9.75 3 6.99 5.11 4.875 7.688 4.875c1.53 0 2.94.735 3.812 1.92.872-1.185 2.282-1.92 3.813-1.92C17.89 4.875 21 6.99 21 9.75c0 4.28-4.32 7.69-8.144 10.236A1.5 1.5 0 0 1 12 20.25Z"
        />
      </svg>
    </button>
  );
}
