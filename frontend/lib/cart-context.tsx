'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { api } from './api';
import { useAuth } from './auth-context';
import { guestCartCount, subscribeGuestCart } from './guestCart';
import type { Cart } from './types';

interface CartContextValue {
  /** カート内の数量合計。未ログイン時は端末が持つゲストカートの数量。 */
  count: number;
  /** カートを取り直して count を更新する。カート操作後に呼ぶ。 */
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // 初期値は 0 のまま置く（localStorage は SSR で読めないため、読むのは effect 以降）。
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    // 未ログインのカートは端末（localStorage）にあるので、サーバーには問い合わせない。
    if (!user) {
      setCount(guestCartCount());
      return;
    }
    try {
      const cart = await api.get<Cart>('/cart');
      setCount(cart.items.reduce((sum, item) => sum + item.quantity, 0));
    } catch {
      // 取得に失敗しても直前の count を維持する（バッジをリセットしない）。
    }
  }, [user]);

  // ログイン状態が変わったら自動で取り直す。
  useEffect(() => {
    void refresh();
  }, [user, refresh]);

  // ゲストカートの変更（別タブでの操作を含む）を購読する。未ログイン中はその値でバッジを
  // 更新し、ログイン後は「マージが済んで控えが空になった」合図として使ってサーバーの
  // カートを取り直す（マージは login() を経ない復帰経路でも走るため、ここで拾わないと
  // バッジだけがマージ前の数で残る）。
  useEffect(() => {
    return subscribeGuestCart(() => {
      void refresh();
    });
  }, [refresh]);

  // value を固定する。インラインのオブジェクトリテラルだと、provider が再レンダーする
  // たびに同一性が変わり、useCart() の消費者（一覧なら ProductCard 12枚ぶん）が
  // count も refresh も変わっていないのに全員再レンダーする。
  const value = useMemo(() => ({ count, refresh }), [count, refresh]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
