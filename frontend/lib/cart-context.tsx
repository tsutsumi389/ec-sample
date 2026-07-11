'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth-context';
import type { Cart } from './types';

interface CartContextValue {
  /** カート内の数量合計。未ログイン時は 0。 */
  count: number;
  /** サーバーからカートを取り直して count を更新する。カート操作後に呼ぶ。 */
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    // 未ログイン時はカートAPIを呼ばず、常に 0 とする。
    if (!user) {
      setCount(0);
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
    if (!user) {
      setCount(0);
      return;
    }
    void refresh();
  }, [user, refresh]);

  return <CartContext.Provider value={{ count, refresh }}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
