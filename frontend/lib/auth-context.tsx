'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken, clearToken } from './api';
import { clearGuestCart, readGuestCart } from './guestCart';
import type { AuthResponse, CartMergeResult, User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** 認証後、端末が持っていたゲストカートの合算結果を返す（控えが空なら null）。 */
  login: (email: string, password: string) => Promise<CartMergeResult | null>;
  register: (email: string, password: string, name: string) => Promise<CartMergeResult | null>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * 未ログイン中に端末へ溜めたカートを、サーバーのカートへ合算する。
 *
 * 失敗しても認証そのものは成立させる（控えは端末に残すので、次のログインでもう一度
 * 試せる）。買えなくなっていた明細は例外にせず skipped として返るので、呼び出し側が
 * 利用者へ伝える。
 */
async function mergeGuestCart(): Promise<CartMergeResult | null> {
  const items = readGuestCart();
  if (items.length === 0) return null;
  try {
    const result = await api.post<CartMergeResult>('/cart/merge', { items });
    clearGuestCart();
    return result;
  } catch {
    // 控えを消さない（消すと「入れたはずのものが消えた」だけが残る）。
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const me = await api.get<User>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    // セッション復帰時にも未マージの控えがあれば合算する。login() を経ずにログイン状態で
    // 開く経路（別タブでログインした後にこのタブを開く、リロード）があり、それを拾わないと
    // 控えが端末に残り続けて「入れたのに無い」状態になる。
    fetchMe()
      .then(() => mergeGuestCart())
      .finally(() => setLoading(false));
  }, [fetchMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<AuthResponse>('/auth/login', { email, password });
      setToken(data.access_token);
      // user を反映する前にマージする。CartProvider は user の変化でカートを取り直すため、
      // この順序でないとマージ前のカート数がバッジに出て、直後に増える形になる。
      const merged = await mergeGuestCart();
      await fetchMe();
      return merged;
    },
    [fetchMe]
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      await api.post('/auth/register', { email, password, name });
      return login(email, password);
    },
    [login]
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  // ログイン中のユーザー情報を部分的に差し替える（例: アカウント画面での氏名更新後の同期）。
  const updateUser = useCallback((partial: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
