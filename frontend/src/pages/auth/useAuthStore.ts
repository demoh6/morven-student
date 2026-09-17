import { create } from 'zustand';
import type { AuthUser } from '@/pages/auth/authApi';
import * as api from '@/pages/auth/authApi';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;

  initialize: () => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setAvatarUrl: (url: string | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Single-flight + idempotent boot: App's mount effect can run more than once
  // (React.StrictMode double-mounts in dev). Each `initialize()` performs a
  // POST /api/auth/refresh, and refresh tokens are ROATED single-use
  // server-side — so two concurrent refreshes with the same cookie would have
  // the second rejected, making boot misread a valid session as logged out and
  // (via bootstrapSession) wipe account-scoped data. Concurrent callers share
  // one in-flight refresh; an already-initialized store is a no-op.
  let initializePromise: Promise<void> | null = null;

  return {
    user: null,
    loading: false,
    error: null,
    initialized: false,

    initialize: () => {
      if (initializePromise) return initializePromise;
      if (get().initialized) return Promise.resolve();
      const run = (async () => {
        set({ loading: true });
        try {
          // Try to refresh — the browser sends the httpOnly cookie automatically.
          const result = await api.refresh();
          set({ user: result.user, initialized: true, loading: false });
        } catch {
          // No valid refresh cookie — user is not logged in.
          api.setAccessToken(null);
          set({ user: null, initialized: true, loading: false });
        }
      })();
      initializePromise = run.finally(() => {
        initializePromise = null;
      });
      return initializePromise;
    },

    register: async (email, username, password, displayName) => {
      set({ loading: true, error: null });
      try {
        const result = await api.register(email, username, password, displayName);
        set({ user: result.user, loading: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'حدث خطأ';
        set({ loading: false, error: message });
        throw err;
      }
    },

    login: async (email, password) => {
      set({ loading: true, error: null });
      try {
        const result = await api.login(email, password);
        set({ user: result.user, loading: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'حدث خطأ';
        set({ loading: false, error: message });
        throw err;
      }
    },

    googleLogin: async (credential) => {
      set({ loading: true, error: null });
      try {
        const result = await api.googleLogin(credential);
        set({ user: result.user, loading: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'حدث خطأ';
        set({ loading: false, error: message });
        throw err;
      }
    },

    logout: async () => {
      try {
        await api.logout();
      } finally {
        set({ user: null });
      }
    },

    clearError: () => set({ error: null }),

    setAvatarUrl: (url) =>
      set((state) => ({
        user: state.user ? { ...state.user, avatarUrl: url } : null,
      })),
  };
});
