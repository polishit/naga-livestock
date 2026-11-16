import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isReviewerRole, isStaffRole, type Role } from '@livestock/shared';
import { api } from './api';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  /** The owner record of a livestock owner's login */
  ownerId: number | null;
  /** A temporary password is still in use: it must be changed before anything else */
  mustChangePassword: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: (reason?: 'idle') => Promise<void>;
  /** Replace the signed-in user (after a password change) */
  setUser: (u: User) => void;
  /** CVO staff (any staff role) can add and edit records */
  canEdit: boolean;
  /** System Administrator: accounts, settings, targets, audit log */
  isAdmin: boolean;
  /** System Administrator or Veterinarian: verify, validate, close, reopen, void */
  isReviewer: boolean;
  /** A livestock owner's login (owner app) */
  isOwner: boolean;
}

const Ctx = createContext<AuthState | null>(null);
const CACHE_KEY = 'nlm-user';
/** Shown on the sign-in page after an automatic sign-out. */
export const SIGNED_OUT_NOTE = 'nlm-signed-out-note';
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

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
  const [idleMinutes, setIdleMinutes] = useState(0);
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
      .get<{ user: User; idleTimeoutMinutes: number }>('/api/auth/me')
      .then((r) => {
        remember(r.user);
        setIdleMinutes(r.idleTimeoutMinutes);
      })
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
    const r = await api.post<{ user: User; idleTimeoutMinutes: number }>('/api/auth/login', {
      email,
      password,
    });
    remember(r.user);
    setIdleMinutes(r.idleTimeoutMinutes);
  }, []);

  const logout = useCallback(
    async (reason?: 'idle') => {
      await api.post('/api/auth/logout', reason ? { reason } : undefined).catch(() => undefined);
      if (reason === 'idle')
        try {
          sessionStorage.setItem(
            SIGNED_OUT_NOTE,
            'You were signed out because there was no activity for a while. Sign in again to continue.',
          );
        } catch {
          /* storage unavailable */
        }
      remember(null);
      qc.clear();
    },
    [qc],
  );

  // Idle timeout: with no tap, key press or scroll for the set time, the user is signed out.
  // (The server also refuses to renew a session that was idle for that long.)
  useEffect(() => {
    if (!user || !idleMinutes) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Unsent field records stay on the device; do not sign out while offline.
        if (navigator.onLine) void logout('idle');
        else arm();
      }, idleMinutes * 60_000);
    };
    arm();
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, arm, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, arm);
    };
  }, [user, idleMinutes, logout]);

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        login,
        logout,
        setUser: remember,
        canEdit: isStaffRole(user?.role),
        isAdmin: user?.role === 'ADMIN',
        isReviewer: isReviewerRole(user?.role),
        isOwner: user?.role === 'OWNER',
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
