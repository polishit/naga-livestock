import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role } from '@livestock/shared';
import { api } from './api';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  canEdit: boolean;
  isAdmin: boolean;
}

const Ctx = createContext<AuthState | null>(null);
const CACHE_KEY = 'nlm-user';

function cachedUser(): User | null {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    return s ? (JSON.parse(s) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const remember = (u: User | null) => {
    setUser(u);
    try {
      if (u) localStorage.setItem(CACHE_KEY, JSON.stringify(u));
      else localStorage.removeItem(CACHE_KEY);
    } catch {
      /* storage unavailable */
    }
  };

  useEffect(() => {
    api
      .get<{ user: User }>('/api/auth/me')
      .then((r) => remember(r.user))
      .catch(() => {
        // Offline: keep the last signed-in user so field staff can keep working.
        if (!navigator.onLine) setUser(cachedUser());
        else remember(null);
      })
      .finally(() => setLoading(false));
    const onExpired = () => remember(null);
    window.addEventListener('auth-expired', onExpired);
    return () => window.removeEventListener('auth-expired', onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ user: User }>('/api/auth/login', { email, password });
    remember(r.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    remember(null);
    qc.clear();
  }, [qc]);

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        login,
        logout,
        canEdit: user?.role === 'ADMIN' || user?.role === 'STAFF',
        isAdmin: user?.role === 'ADMIN',
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
