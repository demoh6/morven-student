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
import { cacheClearScope } from '@/services/offlineCache';
import * as imageCache from '@/services/imageCache';

const mockOpenDB = vi.mocked(openDB);
let fake: FakeIdb;

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

beforeEach(() => {
  localStorage.clear();
  setScopeToGuest();
  vi.clearAllMocks();
  imageCache.clearImageMemoryCache();
  fake = createFakeIdb();
  mockOpenDB.mockImplementation(async () => fake.db);
});

describe('imageCache — URL normalisation', () => {
  it('prefixes relative API paths with the API base', () => {
    expect(imageCache.normalizeImageUrl('/uploads/a.png')).toBe(
      'http://test-api.local/uploads/a.png',
    );
  });

  it('adds a leading slash to bare relative paths', () => {
    expect(imageCache.normalizeImageUrl('uploads/a.png')).toBe(
      'http://test-api.local/uploads/a.png',
    );
  });

  it('keeps absolute URLs untouched', () => {
    expect(imageCache.normalizeImageUrl('https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png',
    );
    expect(imageCache.normalizeImageUrl('blob:http://x/y')).toBe('blob:http://x/y');
    expect(imageCache.normalizeImageUrl('data:image/png;base64,AAAA')).toBe(
      'data:image/png;base64,AAAA',
    );
  });

  it('returns null for empty references', () => {
    expect(imageCache.normalizeImageUrl(null)).toBeNull();
    expect(imageCache.normalizeImageUrl(undefined)).toBeNull();
    expect(imageCache.normalizeImageUrl('   ')).toBeNull();
  });
});

describe('imageCache — persistent byte storage', () => {
  it('round-trips bytes within the same scope', async () => {
    await imageCache.putImageBytes('http://x/a.png', bytes(1, 2, 3));
    const stored = await imageCache.getImageBytes('http://x/a.png');
    expect(stored).not.toBeNull();
    expect(Array.from(new Uint8Array(stored!))).toEqual([1, 2, 3]);
  });

  it('never leaks an account image into another account scope', async () => {
    setScopeToAccount('u1');
    await imageCache.putImageBytes('http://x/private.png', bytes(9));
    expect(await imageCache.getImageBytes('http://x/private.png')).not.toBeNull();

    setScopeToAccount('u2');
    expect(await imageCache.getImageBytes('http://x/private.png')).toBeNull();
  });

  it('deletes a single cached image', async () => {
    await imageCache.putImageBytes('http://x/a.png', bytes(1));
    await imageCache.deleteImageBytes('http://x/a.png');
    expect(await imageCache.getImageBytes('http://x/a.png')).toBeNull();
  });

  it('clearAccountScope (logout isolation) removes that account’s cached images', async () => {
    setScopeToAccount('u1');
    await imageCache.putImageBytes('http://x/a.png', bytes(1));
    setScopeToAccount('u2');
    await imageCache.putImageBytes('http://x/b.png', bytes(2));

    await cacheClearScope('account:u1');

    setScopeToAccount('u1');
    expect(await imageCache.getImageBytes('http://x/a.png')).toBeNull();
    setScopeToAccount('u2');
    expect(await imageCache.getImageBytes('http://x/b.png')).not.toBeNull();
  });

  it('degrades to "no cached image" when IndexedDB is unavailable', async () => {
    mockOpenDB.mockRejectedValueOnce(new Error('unavailable'));
    await expect(imageCache.getImageBytes('http://x/a.png')).resolves.toBeNull();
    mockOpenDB.mockRejectedValueOnce(new Error('unavailable'));
    await expect(imageCache.putImageBytes('http://x/a.png', bytes(1))).resolves.toBeUndefined();
  });

  it('bounds the cache by evicting the least recently used images', async () => {
    const scope = 'guest';
    for (let i = 0; i < imageCache.MAX_CACHED_IMAGES; i++) {
      const url = `http://x/${i}.png`;
      fake.seed('cache', {
        id: `${scope}::image:${url}`,
        scope,
        key: `image:${url}`,
        url,
        bytes: bytes(i % 255),
        updatedAt: i,
        lastUsedAt: i,
      });
    }

    await imageCache.putImageBytes(`http://x/${imageCache.MAX_CACHED_IMAGES}.png`, bytes(7));

    const records = fake
      .all('cache')
      .filter((r) => typeof r.key === 'string' && (r.key as string).startsWith('image:'));
    expect(records.length).toBe(imageCache.MAX_CACHED_IMAGES);
    // The oldest entry is evicted; the just-added one survives.
    expect(await imageCache.getImageBytes('http://x/0.png')).toBeNull();
    expect(await imageCache.getImageBytes(`http://x/${imageCache.MAX_CACHED_IMAGES}.png`)).not.toBeNull();
  });
});

describe('imageCache — in-memory object URL reuse', () => {
  it('reuses a single object URL for the same image and clears on scope swap', () => {
    const first = imageCache.getOrCreateObjectUrl('http://x/a.png', bytes(1));
    const second = imageCache.getOrCreateObjectUrl('http://x/a.png', bytes(1));
    expect(second).toBe(first);
    expect(imageCache.getMemoryObjectUrl('http://x/a.png')).toBe(first);

    // Switching account scope must not expose the previous account's image.
    setScopeToAccount('u1');
    expect(imageCache.getMemoryObjectUrl('http://x/a.png')).toBeNull();
  });
});
