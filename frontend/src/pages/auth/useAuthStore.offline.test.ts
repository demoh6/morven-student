import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/pages/auth/authApi';

const USER: AuthUser = {
  id: 'user-a',
  email: 'a@example.com',
  username: 'userA',
  displayName: 'A',
  role: 'USER',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

vi.mock('@/pages/auth/authApi', () => ({
  refresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  googleLogin: vi.fn(),
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => null),
}));

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

/** Simulate a returning visit with a persisted authenticated identity. */
function seedPersistedSession(): void {
  localStorage.setItem(
    'morven-auth',
    JSON.stringify({ state: { user: USER, hasPersistedSession: true, loggedOut: false }, version: 0 }),
  );
}

/** Fresh module registry per test mirrors "reload the app". */
async function freshStore() {
  vi.resetModules();
  const storeMod = await import('@/pages/auth/useAuthStore');
  const authApi = await import('@/pages/auth/authApi');
  return { store: storeMod.useAuthStore, authApi };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setOnline(true);
});

afterEach(() => {
  setOnline(true);
});

describe('Bug 1 — non-401 refresh failures must NOT log the user out', () => {
  it('navigator.onLine === true + network TypeError: persists the user', async () => {
    seedPersistedSession();
    const { store, authApi } = await freshStore();
    vi.mocked(authApi.refresh).mockRejectedValue(new TypeError('Failed to fetch'));

    await store.getState().initialize();

    expect(store.getState().initialized).toBe(true);
    expect(store.getState().user?.id).toBe('user-a');
    expect(store.getState().hasPersistedSession).toBe(true);
  });

  it('navigator.onLine === true + request timeout (AbortError): persists the user', async () => {
    seedPersistedSession();
    const { store, authApi } = await freshStore();
    vi.mocked(authApi.refresh).mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    );

    await store.getState().initialize();

    expect(store.getState().user?.id).toBe('user-a');
    expect(store.getState().hasPersistedSession).toBe(true);
  });

  it('HTTP 500 during refresh: persists the user', async () => {
    seedPersistedSession();
    const { store, authApi } = await freshStore();
    vi.mocked(authApi.refresh).mockRejectedValue(
      Object.assign(new Error('حدث خطأ في الخادم'), { status: 500 }),
    );

    await store.getState().initialize();

    expect(store.getState().user?.id).toBe('user-a');
    expect(store.getState().hasPersistedSession).toBe(true);
  });

  it('HTTP 403 (CSRF) during refresh: persists the user', async () => {
    seedPersistedSession();
    const { store, authApi } = await freshStore();
    vi.mocked(authApi.refresh).mockRejectedValue(
      Object.assign(new Error('غير مصرح'), { status: 403 }),
    );

    await store.getState().initialize();

    expect(store.getState().user?.id).toBe('user-a');
  });

  it('confirmed HTTP 401 (invalid/revoked session): clears the session', async () => {
    seedPersistedSession();
    const { store, authApi } = await freshStore();
    vi.mocked(authApi.refresh).mockRejectedValue(
      Object.assign(new Error('رمز التحديث غير صالح أو منتهي الصلاحية'), { status: 401 }),
    );

    await store.getState().initialize();

    expect(store.getState().initialized).toBe(true);
    expect(store.getState().user).toBeNull();
    expect(store.getState().hasPersistedSession).toBe(false);
  });

  it('navigator.onLine === false: persists the user and never calls refresh', async () => {
    seedPersistedSession();
    setOnline(false);
    const { store, authApi } = await freshStore();

    await store.getState().initialize();

    expect(store.getState().user?.id).toBe('user-a');
    expect(store.getState().hasPersistedSession).toBe(true);
    expect(vi.mocked(authApi.refresh)).not.toHaveBeenCalled();
  });
});

describe('Bug 1 — successful refresh still rotates the session', () => {
  it('a valid refresh adopts the server user and keeps the session', async () => {
    seedPersistedSession();
    const { store, authApi } = await freshStore();
    vi.mocked(authApi.refresh).mockResolvedValue({ user: USER, accessToken: 'fresh-token' });

    await store.getState().initialize();

    expect(store.getState().user?.id).toBe('user-a');
    expect(store.getState().hasPersistedSession).toBe(true);
    expect(store.getState().loggedOut).toBe(false);
  });
});

describe('explicit offline logout survives reload and reconnection', () => {
  it('never auto-restores after an offline logout, even when back online', async () => {
    seedPersistedSession();
    setOnline(false);
    const first = await freshStore();
    await first.store.getState().initialize();
    expect(first.store.getState().user?.id).toBe('user-a');

    // Explicit logout while offline: server call is skipped, local state marked.
    await first.store.getState().logout();
    expect(first.store.getState().user).toBeNull();
    expect(first.store.getState().loggedOut).toBe(true);

    // Reload the app (fresh module registry rehydrates `morven-auth`) and come
    // back online. Even if the server would still honor the cookie, the
    // explicit logout must win.
    vi.resetModules();
    const store2 = (await import('@/pages/auth/useAuthStore')).useAuthStore;
    const authApi2 = await import('@/pages/auth/authApi');
    vi.mocked(authApi2.refresh).mockResolvedValue({ user: USER, accessToken: 'would-revive' });
    vi.mocked(authApi2.logout).mockResolvedValue(undefined);
    setOnline(true);

    await store2.getState().initialize();

    expect(store2.getState().user).toBeNull();
    expect(store2.getState().loggedOut).toBe(true);
    expect(vi.mocked(authApi2.refresh)).not.toHaveBeenCalled();
  });
});
