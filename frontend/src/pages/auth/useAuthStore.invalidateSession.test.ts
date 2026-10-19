import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/pages/auth/authApi';
import * as authApi from '@/pages/auth/authApi';
import { useAuthStore } from './useAuthStore';

/**
 * The auth store must register a session-invalidation handler with authApi at
 * module load, so a definitive refresh 401 (any single-flight caller: task
 * requests, socket reconnect, media transport) lands in the same
 * unauthenticated state as a boot-time 401.
 *
 * authApi is mocked with the subset of exports the store touches — a
 * registration call must survive even on partial test doubles (guarded call).
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

vi.mock('@/pages/auth/authApi', () => ({
  refresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  googleLogin: vi.fn(),
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => null),
  setSessionInvalidationHandler: vi.fn(),
  setTokenRotationHandler: vi.fn(),
  refreshTokenIfNeeded: vi.fn(() => Promise.resolve(false)),
  authedFetch: vi.fn(),
  authRequest: vi.fn(),
}));

function registeredHandler(): () => void {
  const calls = vi.mocked(authApi.setSessionInvalidationHandler).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as () => void;
}

describe('useAuthStore session-invalidation wiring', () => {
  it('registers a session-invalidation handler at import time', () => {
    expect(vi.mocked(authApi.setSessionInvalidationHandler)).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it('clears the identity when the registered handler fires', () => {
    useAuthStore.setState({
      user: USER,
      hasPersistedSession: true,
      loggedOut: false,
      initialized: true,
      loading: false,
      error: null,
    });

    registeredHandler()();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().hasPersistedSession).toBe(false);
    expect(useAuthStore.getState().initialized).toBe(true);
    expect(useAuthStore.getState().loading).toBe(false);
    // Session expiry is not an explicit logout — a recovered cookie must be
    // able to restore on the next boot.
    expect(useAuthStore.getState().loggedOut).toBe(false);
    expect(authApi.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('invalidateSession never flips an explicit logout back on', () => {
    useAuthStore.setState({
      user: null,
      hasPersistedSession: false,
      loggedOut: true,
      initialized: true,
      loading: false,
      error: null,
    });

    useAuthStore.getState().invalidateSession();

    expect(useAuthStore.getState().loggedOut).toBe(true);
  });

  it('invalidateSession drops a stale logged-in identity even when loading', () => {
    useAuthStore.setState({
      user: USER,
      hasPersistedSession: true,
      loggedOut: false,
      initialized: true,
      loading: true,
      error: null,
    });

    useAuthStore.getState().invalidateSession();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      hasPersistedSession: false,
      loggedOut: false,
      initialized: true,
      loading: false,
    });
  });
});
