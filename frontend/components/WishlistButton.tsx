'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { api, ApiError } from '@/lib/api';
import type { WishlistItem } from '@/lib/types';

export type WishlistButtonSize = 'sm' | 'md' | 'lg';

/**
 * 円形アイコンボタンの寸法は 44px（iconBtn('md') と同値）が体系の既定。
 * 'sm'（36px）は商品カードの表紙上のように、図版を隠したくない場所だけに使う。
 * 'lg'（52px）は btn(_, 'lg') と対で並べる場所（表紙の操作行）だけに使う
 *   ＝ 隣の CTA と高さが 8px ずれて「サイズを指定し忘れた」ように見えるのを防ぐ。
 * ※ className で h-11 を渡しても Tailwind の出力順で基底の h-9 が勝つため、
 *   寸法の切替は必ずこの prop で行うこと（呼び出し側のユーティリティは効かない）。
 */
const SIZE_CLASSES: Record<WishlistButtonSize, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-13 w-13',
};

interface WishlistButtonProps {
  productId: number;
  /** 初期状態でお気に入り登録済みかどうか（一覧取得元から渡す）。省略時は未登録扱い。 */
  initialFavorited?: boolean;
  /** ボタンの直径。既定は 44px（'md'）。 */
  size?: WishlistButtonSize;
  className?: string;
}

/**
 * 商品のお気に入り登録/解除をトグルするハートボタン。
 * - 未ログイン時はクリックで /login へ遷移させる（トグルは行わない）。
 * - 楽観的更新を行い、API失敗時は表示を元に戻す。
 * - Link コンポーネント内（ProductCard 等）に置かれても親へのクリック伝播/遷移を止める。
 */
export default function WishlistButton({
  productId,
  initialFavorited = false,
  size = 'md',
  className = '',
}: WishlistButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);
  // 追加した瞬間だけハートを弾ませる（登録できたことを色の変化以外でも伝える）。
  const [bump, setBump] = useState(false);

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
    setBump(nextFavorited);
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
      // color と opacity を両方遷移させる。ProductCard は hover で現す使い方をするため、
      // 呼び出し側で transition-opacity を足させない（transition-property が競合する）。
      // 面は不透明の生成り（bg-surface）にする。半透明だと深緑の表紙の上で地と合成されて
      // 冷たい灰緑（#D9DCD7）になり、隣の btn('onDark') と別の白に割れて無効化に見えた。
      className={`hit inline-flex ${SIZE_CLASSES[size]} items-center justify-center rounded-full bg-surface shadow-paper transition-[color,opacity] duration-fast hover:text-critical-600 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
        favorited ? 'text-critical-600' : 'text-ink-muted'
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-5 w-5 ${bump ? 'animate-bump' : ''}`}
        onAnimationEnd={() => setBump(false)}
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
