// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refresh } from './authApi';

/**
 * The auth store classifies refresh failures by `status`. These tests pin the
 * contract that `authApi` attaches the HTTP status on an HTTP response while a
 * network failure carries NO status (so it is never read as an invalid session).
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('authApi error classification metadata', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches status 401 on a 401 from refresh()', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'invalid refresh token' }, 401));
    await expect(refresh()).rejects.toMatchObject({ status: 401 });
  });

  it('attaches status 500 on a 500 from refresh()', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'server error' }, 500));
    await expect(refresh()).rejects.toMatchObject({ status: 500 });
  });

  it('attaches status 403 on a 403 (CSRF) from refresh()', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403));
    await expect(refresh()).rejects.toMatchObject({ status: 403 });
  });

  it('a network failure carries no status (connectivity, not auth)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    let caught: unknown;
    try {
      await refresh();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as { status?: unknown }).status).toBeUndefined();
  });
});
