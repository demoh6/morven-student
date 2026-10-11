import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/pages/auth/authApi';
import * as api from '@/pages/auth/authApi';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  /** Persisted flag to distinguish explicit logout from offline/boot failures. */
  hasPersistedSession: boolean;

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
  /** For handling explicit logout state - marks session as logged out. */
  markLoggedOut: () => void;
}

export const useAuthStore = create(
  persist<AuthState>(
    (set, get) => {
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
        hasPersistedSession: false,

        initialize: () => {
          if (initializePromise) return initializePromise;
          if (get().initialized) return Promise.resolve();
          const run = (async () => {
            set({ loading: true });
            let state = get();
            // Defensive: check localStorage directly in case rehydration hasn't completed yet
            if ((!state.user || !state.hasPersistedSession) && typeof window !== 'undefined') {
              try {
                const raw = localStorage.getItem('morven-auth');
                if (raw) {
                  const parsed = JSON.parse(raw);
                  if (parsed?.state?.user && parsed?.state?.hasPersistedSession) {
                    state = { ...state, user: parsed.state.user, hasPersistedSession: true };
                  }
                }
              } catch {}
            }
            // If user explicitly logged out, do not attempt to auto-restore session
            if (state.user && !state.hasPersistedSession) {
              // Explicit logout state - don't restore
              api.setAccessToken(null);
              set({ user: null, initialized: true, loading: false });
              return;
            }
            try {
              const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
              if (isOffline && state.hasPersistedSession && state.user) {
                api.setAccessToken(null);
                set({ user: state.user, hasPersistedSession: true, initialized: true, loading: false });
                return;
              }
              const result = await api.refresh();
              set({
                user: result.user,
                hasPersistedSession: true,
                initialized: true,
                loading: false,
              });
            } catch (err) {
              const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
              if (isOffline && state.hasPersistedSession && state.user) {
                api.setAccessToken(null);
                set({ user: state.user, hasPersistedSession: true, initialized: true, loading: false });
                return;
              } else {
                api.setAccessToken(null);
                set({ user: null, hasPersistedSession: false, initialized: true, loading: false });
                return;
              }
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
        set({ user: result.user, hasPersistedSession: true, loading: false });
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
        set({ user: result.user, hasPersistedSession: true, loading: false });
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
        set({ user: result.user, hasPersistedSession: true, loading: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'حدث خطأ';
        set({ loading: false, error: message });
        throw err;
      }
    },

    logout: async () => {
      const wasOnline = typeof navigator !== 'undefined' && navigator.onLine;
      try {
        if (wasOnline) {
          await api.logout();
        }
      } finally {
        set({ user: null, hasPersistedSession: false });
      }
    },

    markLoggedOut: () => {
      set({ user: null, hasPersistedSession: false });
    },

    clearError: () => set({ error: null }),

    setAvatarUrl: (url) =>
      set((state) => ({
        user: state.user ? { ...state.user, avatarUrl: url } : null,
      })),
      };
    },
    {
      name: 'morven-auth',
      partialize: (state) => ({
        user: state.user,
        hasPersistedSession: state.hasPersistedSession,
      } as any),
    },
  ),
);
