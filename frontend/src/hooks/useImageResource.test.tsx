import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIdb, type FakeIdb } from '@/test/fakeIdb';
import { setScopeToGuest } from '@/storage/scope';

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
import * as imageCache from '@/services/imageCache';
import { CachedImage } from '@/components/UI/CachedImage';

const mockOpenDB = vi.mocked(openDB);
let fake: FakeIdb;

function mockNavigatorOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

function renderImage() {
  return render(
    <CachedImage src="/uploads/g.png" alt="Group" fallback={<span>fallback</span>} />,
  );
}

beforeEach(() => {
  localStorage.clear();
  setScopeToGuest();
  vi.clearAllMocks();
  imageCache.clearImageMemoryCache();
  mockNavigatorOnline(true);
  fake = createFakeIdb();
  mockOpenDB.mockImplementation(async () => fake.db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useImageResource — proactive offline persistence', () => {
  it('persists a freshly-seen image without a load event and renders it after an offline reload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const url = imageCache.normalizeImageUrl('/uploads/g.png')!;

    const { unmount } = renderImage();
    // Online the network URL is rendered immediately.
    expect(screen.getByAltText('Group').getAttribute('src')).toContain('/uploads/g.png');

    // Regression: nothing was cached until the browser fired <img onLoad>, so a
    // member who had just joined (and never loaded the image) had no offline
    // copy. The bytes must be persisted proactively on mount.
    await waitFor(async () => {
      expect(await imageCache.getImageBytes(url)).not.toBeNull();
    });

    // Simulate a reload while offline: memory cache gone, no network.
    unmount();
    imageCache.clearImageMemoryCache();
    mockNavigatorOnline(false);

    renderImage();
    await waitFor(() => {
      const img = screen.getByAltText('Group') as HTMLImageElement;
      expect(img.getAttribute('src') || '').toMatch(/^blob:/);
    });
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('does not attempt to fetch while offline', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    mockNavigatorOnline(false);

    renderImage();

    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
