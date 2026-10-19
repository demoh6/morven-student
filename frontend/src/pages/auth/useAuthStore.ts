import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/pages/auth/authApi';
import * as api from '@/pages/auth/authApi';

/**
 * A CONFIRMED invalid/revoked refresh session is signalled by the refresh
 * endpoint with an explicit HTTP 401 (the backend returns 401 for a
 * missing/invalid/expired/revoked refresh token). Network failures, timeouts,
 * unreachable servers and HTTP 5xx carry NO `status` (or a non-401 status) and
 * must never be treated as a logout.
 */
function isConfirmedInvalidSession(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { status?: unknown }).status === 401
  );
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  /** Persisted flag to distinguish explicit logout from offline/boot failures. */
  hasPersistedSession: boolean;
  /** Persisted flag: the user explicitly logged out. Authoritative across
   *  reloads and reconnection — an offline logout must never auto-restore. */
  loggedOut: boolean;

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
  /** Called when a refresh definitively fails with HTTP 401: drop the local
   *  identity so the UI never renders a misleading logged-in shell. */
  invalidateSession: () => void;
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
        loggedOut: false,

        initialize: () => {
          if (initializePromise) return initializePromise;
          if (get().initialized) return Promise.resolve();
          const run = (async () => {
            set({ loading: true });
            let state = get();
            // Defensive: check localStorage directly in case rehydration hasn't completed yet
            if (typeof window !== 'undefined') {
              try {
                const raw = localStorage.getItem('morven-auth');
                if (raw) {
                  const parsed = JSON.parse(raw);
                  const persisted = parsed?.state;
                  if (persisted && (persisted.user || persisted.hasPersistedSession || persisted.loggedOut)) {
                    state = {
                      ...state,
                      user: persisted.user ?? state.user,
                      hasPersistedSession: !!persisted.hasPersistedSession,
                      loggedOut: !!persisted.loggedOut,
                    };
                  }
                }
              } catch {}
            }
            // An explicit logout is authoritative across reloads and
            // reconnection: never auto-restore a session for it, even if a
            // (httpOnly) refresh cookie still exists because the logout
            // happened offline.
            if (state.loggedOut) {
              api.setAccessToken(null);
              set({ user: null, initialized: true, loading: false });
              const online = typeof navigator !== 'undefined' && navigator.onLine;
              if (online) {
                // Best-effort: revoke the server-side session left over from an
                // offline logout now that we are online again. Non-blocking.
                void api.logout().catch(() => {});
              }
              return;
            }
            // Legacy explicit-logout shape: identity persisted but flagged as
            // not an active session.
            if (state.user && !state.hasPersistedSession) {
              api.setAccessToken(null);
              set({ user: null, hasPersistedSession: false, initialized: true, loading: false });
              return;
            }
            try {
              const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
              if (isOffline) {
                api.setAccessToken(null);
                if (state.user) {
                  set({ user: state.user, hasPersistedSession: true, initialized: true, loading: false });
                } else {
                  set({ initialized: true, loading: false });
                }
                return;
              }
              const result = await api.refresh();
              set({
                user: result.user,
                hasPersistedSession: true,
                loggedOut: false,
                initialized: true,
                loading: false,
              });
            } catch (err) {
              api.setAccessToken(null);
              if (isConfirmedInvalidSession(err)) {
                // Explicit HTTP 401 from /api/auth/refresh: the refresh session
                // is invalid/revoked — honor the security contract and log out.
                set({ user: null, hasPersistedSession: false, initialized: true, loading: false });
                return;
              }
              // Connectivity / timeout / unreachable server / HTTP 5xx / CSRF:
              // NOT an authentication failure. Preserve the persisted identity.
              if (state.user) {
                set({ user: state.user, hasPersistedSession: true, initialized: true, loading: false });
              } else {
                set({ initialized: true, loading: false });
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
        set({ user: result.user, hasPersistedSession: true, loggedOut: false, loading: false });
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
        set({ user: result.user, hasPersistedSession: true, loggedOut: false, loading: false });
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
        set({ user: result.user, hasPersistedSession: true, loggedOut: false, loading: false });
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
        set({ user: null, hasPersistedSession: false, loggedOut: true });
      }
    },

    markLoggedOut: () => {
      set({ user: null, hasPersistedSession: false, loggedOut: true });
    },

    invalidateSession: () => {
      // A refresh 401 is a server-confirmed dead session: drop the local
      // identity so the UI never renders a misleading logged-in shell.
      // `loggedOut` stays false — this is a session expiry, not an explicit
      // user logout; a later boot still attempts refresh (the httpOnly cookie
      // may have been replaced by another tab's successful rotation).
      api.setAccessToken(null);
      set({ user: null, hasPersistedSession: false, initialized: true, loading: false });
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
        loggedOut: state.loggedOut,
      } as any),
    },
  ),
);

// Wire a definitive refresh 401 (the single-flight path behind authedFetch /
// authRequest / the media transport) into the same unauthenticated state a
// boot-time 401 produces. Deliberately defensive: several test files mock
// authApi with partial export factories, and vitest's mock proxy THROWS on
// accessing an undefined export — even through `?.` — so the lookup must be
// guarded by try/catch to keep those test doubles loading.
try {
  api.setSessionInvalidationHandler?.(() => useAuthStore.getState().invalidateSession());
} catch {
  // Partial authApi test double without this export — skip registration.
}
