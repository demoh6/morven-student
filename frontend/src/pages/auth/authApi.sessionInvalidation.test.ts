import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/pages/auth/authApi';
import {
  authRequest,
  getAccessToken,
  getValidAccessToken,
  refreshTokenIfNeeded,
  setAccessToken,
  setSessionInvalidationHandler,
} from './authApi';
import { useAuthStore } from './useAuthStore';

/**
 * Definitive refresh-401 invalidation (H1 follow-up).
 *
 * When /api/auth/refresh rejects with an explicit HTTP 401 the frontend must
 * transition to a consistent unauthenticated state instead of leaving a
 * misleading logged-in UI. Network errors, 403 CSRF and 5xx are NOT session
 * failures and must never invalidate. The auth store registers itself at
 * module load (import-time wiring asserted by the first test below).
 */

const USER: AuthUser = {
  id: 'user-a',
  email: 'a@example.com',
  username: 'userA',
  displayName: 'A',
  role: 'USER',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function seedLoggedInState(): void {
  useAuthStore.setState({
    user: USER,
    hasPersistedSession: true,
    loggedOut: false,
    initialized: true,
    loading: false,
    error: null,
  });
}

function refreshCallCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/auth/refresh')).length;
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  setAccessToken(null);
  useAuthStore.setState({
    user: null,
    hasPersistedSession: false,
    loggedOut: false,
    initialized: false,
    loading: false,
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  // Restore the store's import-time wiring after tests that swap in a spy.
  setSessionInvalidationHandler(() => useAuthStore.getState().invalidateSession());
});

describe('definitive refresh 401 -> unauthenticated state', () => {
  it('clears the store when refresh definitively rejects with 401 (import-time wiring)', async () => {
    // No setSessionInvalidationHandler call from this test: the handler in
    // effect is the one registered when useAuthStore was imported.
    seedLoggedInState();
    setAccessToken('old-token');
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(
          jsonResponse({ error: 'رمز التحديث غير صالح أو منتهي الصلاحية', code: 'REFRESH_TOKEN_NOT_FOUND' }, 401),
        );
      }
      return Promise.resolve(jsonResponse({ error: 'غير مصرح' }, 401));
    });

    await authRequest('/api/tasks').catch(() => {});

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().hasPersistedSession).toBe(false);
    // Session expiry is NOT an explicit logout: loggedOut stays false so a
    // recovered cookie can restore on the next boot.
    expect(useAuthStore.getState().loggedOut).toBe(false);
    expect(useAuthStore.getState().initialized).toBe(true);
    expect(getAccessToken()).toBeNull();
  });

  it('does NOT invalidate when the refresh fails with a network error', async () => {
    seedLoggedInState();
    setAccessToken('old-token');
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(jsonResponse({ error: 'غير مصرح' }, 401));
    });

    await authRequest('/api/tasks').catch(() => {});

    expect(useAuthStore.getState().user?.id).toBe('user-a');
    expect(useAuthStore.getState().hasPersistedSession).toBe(true);
    expect(useAuthStore.getState().loggedOut).toBe(false);
  });

  it('does NOT invalidate when the refresh fails with HTTP 403 (CSRF)', async () => {
    seedLoggedInState();
    setAccessToken('old-token');
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(jsonResponse({ error: 'غير مصرح', code: 'CSRF_INVALID' }, 403));
      }
      return Promise.resolve(jsonResponse({ error: 'غير مصرح' }, 401));
    });

    await authRequest('/api/tasks').catch(() => {});

    expect(useAuthStore.getState().user?.id).toBe('user-a');
    expect(useAuthStore.getState().hasPersistedSession).toBe(true);
  });

  it('does NOT invalidate when the refresh fails with HTTP 500', async () => {
    seedLoggedInState();
    setAccessToken('old-token');
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(jsonResponse({ error: 'حدث خطأ في الخادم' }, 500));
      }
      return Promise.resolve(jsonResponse({ error: 'غير مصرح' }, 401));
    });

    await authRequest('/api/tasks').catch(() => {});

    expect(useAuthStore.getState().user?.id).toBe('user-a');
    expect(useAuthStore.getState().hasPersistedSession).toBe(true);
  });
});

describe('cross-tab rotation race (REPLAYED or NOT_FOUND)', () => {
  it('retries once and recovers when another tab already rotated the cookie', async () => {
    seedLoggedInState();
    setAccessToken('stale-token');
    // Wrapper spy: keeps the store's invalidation wired so a spurious
    // handler fire would visibly clear the state this test asserts on.
    const handler = vi.fn(() => useAuthStore.getState().invalidateSession());
    setSessionInvalidationHandler(handler);
    try {
      let refreshCalls = 0;
      fetchMock.mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/api/auth/refresh')) {
          refreshCalls += 1;
          if (refreshCalls === 1) {
            return Promise.resolve(
              jsonResponse({ error: 'رمز التحديث غير صالح أو منتهي الصلاحية', code: 'REFRESH_TOKEN_REPLAYED' }, 401),
            );
          }
          return Promise.resolve(jsonResponse({ user: USER, accessToken: 'recovered-token' }, 200));
        }
        if (getAccessToken() === 'recovered-token') {
          return Promise.resolve(jsonResponse({ ok: true }));
        }
        return Promise.resolve(jsonResponse({ error: 'غير مصرح' }, 401));
      });

      const result = await authRequest<{ ok: boolean }>('/api/tasks');

      expect(result.ok).toBe(true);
      expect(refreshCalls).toBe(2); // exactly one bounded retry
      expect(getAccessToken()).toBe('recovered-token');
      expect(handler).not.toHaveBeenCalled(); // healthy session never invalidated
      expect(useAuthStore.getState().user?.id).toBe('user-a');
    } finally {
      setSessionInvalidationHandler(() => useAuthStore.getState().invalidateSession());
    }
  });

  it('recovers when the race surfaces as REFRESH_TOKEN_NOT_FOUND instead', async () => {
    seedLoggedInState();
    setAccessToken('stale-token');
    const handler = vi.fn(() => useAuthStore.getState().invalidateSession());
    setSessionInvalidationHandler(handler);
    try {
      let refreshCalls = 0;
      fetchMock.mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/api/auth/refresh')) {
          refreshCalls += 1;
          if (refreshCalls === 1) {
            // Our classify lookup ran AFTER the winning tab's commit, so the
            // row was already gone rather than still present-but-consumed.
            return Promise.resolve(
              jsonResponse({ error: 'رمز التحديث غير صالح أو منتهي الصلاحية', code: 'REFRESH_TOKEN_NOT_FOUND' }, 401),
            );
          }
          return Promise.resolve(jsonResponse({ user: USER, accessToken: 'recovered-token' }, 200));
        }
        if (getAccessToken() === 'recovered-token') {
          return Promise.resolve(jsonResponse({ ok: true }));
        }
        return Promise.resolve(jsonResponse({ error: 'غير مصرح' }, 401));
      });

      const result = await authRequest<{ ok: boolean }>('/api/tasks');

      expect(result.ok).toBe(true);
      expect(refreshCalls).toBe(2); // exactly one bounded retry
      expect(getAccessToken()).toBe('recovered-token');
      expect(handler).not.toHaveBeenCalled(); // healthy session never invalidated
      expect(useAuthStore.getState().user?.id).toBe('user-a');
    } finally {
      setSessionInvalidationHandler(() => useAuthStore.getState().invalidateSession());
    }
  });

  it('still invalidates when the bounded retry also fails with 401', async () => {
    seedLoggedInState();
    setAccessToken('stale-token');
    // Spy that preserves the store's invalidation behaviour, so the test can
    // observe the call AND the resulting state transition.
    const handler = vi.fn(() => useAuthStore.getState().invalidateSession());
    setSessionInvalidationHandler(handler);
    try {
      fetchMock.mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/api/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ error: 'رمز التحديث غير صالح أو منتهي الصلاحية', code: 'REFRESH_TOKEN_REPLAYED' }, 401),
          );
        }
        return Promise.resolve(jsonResponse({ error: 'غير مصرح' }, 401));
      });

      await authRequest('/api/tasks').catch(() => {});

      expect(handler).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().hasPersistedSession).toBe(false);
    } finally {
      setSessionInvalidationHandler(() => useAuthStore.getState().invalidateSession());
    }
  });
});

describe('getValidAccessToken', () => {
  it('returns the held token without touching the network', async () => {
    setAccessToken('held-token');
    await expect(getValidAccessToken()).resolves.toBe('held-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('performs a single-flight refresh when no token is held', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(jsonResponse({ user: USER, accessToken: 'bootstrapped-token' }, 200));
      }
      return Promise.resolve(jsonResponse({ error: 'not found' }, 404));
    });

    await expect(getValidAccessToken()).resolves.toBe('bootstrapped-token');
    expect(refreshCallCount(fetchMock)).toBe(1);
  });

  it('resolves null on a definitive refresh 401 and fires the invalidation handler once', async () => {
    const handler = vi.fn();
    setSessionInvalidationHandler(handler);
    try {
      fetchMock.mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/api/auth/refresh')) {
          return Promise.resolve(jsonResponse({ error: 'رمز التحديث غير صالح', code: 'REFRESH_TOKEN_NOT_FOUND' }, 401));
        }
        return Promise.resolve(jsonResponse({ error: 'not found' }, 404));
      });

      await expect(getValidAccessToken()).resolves.toBeNull();
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      setSessionInvalidationHandler(() => useAuthStore.getState().invalidateSession());
    }
  });

  it('resolves null on a network failure WITHOUT firing the invalidation handler', async () => {
    const handler = vi.fn();
    setSessionInvalidationHandler(handler);
    try {
      fetchMock.mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/api/auth/refresh')) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve(jsonResponse({ error: 'not found' }, 404));
      });

      await expect(getValidAccessToken()).resolves.toBeNull();
      expect(handler).not.toHaveBeenCalled();
    } finally {
      setSessionInvalidationHandler(() => useAuthStore.getState().invalidateSession());
    }
  });
});

describe('refreshTokenIfNeeded invalidation contract', () => {
  it('fires the handler exactly once per definitive 401 failure', async () => {
    const handler = vi.fn();
    setSessionInvalidationHandler(handler);
    try {
      fetchMock.mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/api/auth/refresh')) {
          return Promise.resolve(jsonResponse({ error: 'رمز التحديث غير صالح أو منتهي الصلاحية' }, 401));
        }
        return Promise.resolve(jsonResponse({ error: 'not found' }, 404));
      });

      await expect(refreshTokenIfNeeded()).resolves.toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(getAccessToken()).toBeNull();
    } finally {
      setSessionInvalidationHandler(() => useAuthStore.getState().invalidateSession());
    }
  });
});
