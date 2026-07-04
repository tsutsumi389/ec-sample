'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken, clearToken } from './api';
import type { AuthResponse, User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
    fetchMe().finally(() => setLoading(false));
  }, [fetchMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<AuthResponse>('/auth/login', { email, password });
      setToken(data.access_token);
      await fetchMe();
    },
    [fetchMe]
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      await api.post('/auth/register', { email, password, name });
      await login(email, password);
    },
    [login]
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
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
