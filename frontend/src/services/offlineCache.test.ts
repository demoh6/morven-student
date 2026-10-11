import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIdb, type FakeIdb } from '@/test/fakeIdb';
import { setScopeToAccount, setScopeToGuest } from '@/storage/scope';

type KeyRangeLike = { __only: unknown };
(globalThis as unknown as { IDBKeyRange: unknown }).IDBKeyRange = {
  only: (value: unknown): KeyRangeLike => ({ __only: value }),
};

vi.mock('@/services/db', () => ({
  openDB: vi.fn(),
  FILE_STORE: 'files',
  CACHE_STORE: 'cache',
  MUTATION_STORE: 'mutations',
}));

import { openDB } from '@/services/db';
import * as cache from '@/services/offlineCache';

const mockOpenDB = vi.mocked(openDB);
let fake: FakeIdb;

beforeEach(() => {
  localStorage.clear();
  setScopeToGuest();
  vi.clearAllMocks();
  fake = createFakeIdb();
  mockOpenDB.mockImplementation(async () => fake.db);
});

describe('offlineCache — account-scoped read cache', () => {
  it('round-trips a value within the same scope', async () => {
    await cache.cacheSet('k', { hello: 'world' });
    const entry = await cache.cacheGet<{ hello: string }>('k');
    expect(entry?.value).toEqual({ hello: 'world' });
    expect(entry?.expiresAt).toBeNull();
  });

  it('does not leak guest data into an account scope', async () => {
    await cache.cacheSet('notifications', [1, 2, 3]);
    // Switch to an account — the guest cache entry must be invisible.
    setScopeToAccount('u1');
    expect(await cache.cacheGet('notifications')).toBeNull();
    expect(fake.all('cache')).toHaveLength(1);
  });

  it('isolates one account from another account', async () => {
    setScopeToAccount('u1');
    await cache.cacheSet('groups', ['a-group']);

    setScopeToAccount('u2');
    expect(await cache.cacheGet('groups')).toBeNull();

    setScopeToAccount('u1');
    expect((await cache.cacheGet<string[]>('groups'))?.value).toEqual(['a-group']);
  });

  it("isolates a cached group's details between accounts", async () => {
    setScopeToAccount('u1');
    await cache.cacheSet('groups:detail:g1', { id: 'g1', name: 'Alpha' });

    setScopeToAccount('u2');
    expect(await cache.cacheGet('groups:detail:g1')).toBeNull();

    setScopeToAccount('u1');
    expect((await cache.cacheGet<{ id: string }>('groups:detail:g1'))?.value).toEqual({
      id: 'g1',
      name: 'Alpha',
    });
  });

  it('expires entries past their TTL but serves them when allowStale is set', async () => {
    const now = Date.now();
    fake.seed('cache', {
      id: 'guest::k',
      scope: 'guest',
      key: 'k',
      value: 'v',
      updatedAt: now - 2000,
      expiresAt: now - 1000,
    });
    expect(await cache.cacheGet('k')).toBeNull();
    expect((await cache.cacheGet('k', { allowStale: true }))?.value).toBe('v');
  });

  it('cacheClearScope only removes the targeted scope', async () => {
    await cache.cacheSet('k', 'guest-value');
    setScopeToAccount('u1');
    await cache.cacheSet('k', 'u1-value');
    setScopeToAccount('u2');
    await cache.cacheSet('k', 'u2-value');

    await cache.cacheClearScope('account:u1');

    setScopeToAccount('u1');
    expect(await cache.cacheGet('k')).toBeNull();
    setScopeToAccount('u2');
    expect((await cache.cacheGet<string>('k'))?.value).toBe('u2-value');
    setScopeToGuest();
    expect((await cache.cacheGet<string>('k'))?.value).toBe('guest-value');
  });

  it('degrades to "no cached value" (never throws) when IndexedDB is unavailable', async () => {
    mockOpenDB.mockRejectedValueOnce(new Error('indexedDB unavailable'));
    await expect(cache.cacheGet('k')).resolves.toBeNull();
    mockOpenDB.mockRejectedValueOnce(new Error('indexedDB unavailable'));
    await expect(cache.cacheSet('k', 'v')).resolves.toBeUndefined();
  });
});
