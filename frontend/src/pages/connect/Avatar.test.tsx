import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { Avatar } from './Avatar';

const mockOpenDB = vi.mocked(openDB);
let fake: FakeIdb;

function mockNavigatorOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
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

describe('Avatar — resilient image lifecycle', () => {
  it('keeps a valid image visible after a transient failure and recovers', () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    render(<Avatar src="/uploads/a.png" name="Ali" />);
    const img = screen.getByAltText('Ali');

    fireEvent.error(img);

    // Regression: the original implementation latched to the letter fallback on
    // the first error and never recovered until a full remount. The fixed one
    // keeps the <img> mounted while it retries.
    expect(screen.queryByAltText('Ali')).toBeInTheDocument();
    expect(screen.queryByText('A')).not.toBeInTheDocument();

    fireEvent.load(screen.getByAltText('Ali'));
    expect(screen.getByAltText('Ali')).toBeInTheDocument();
  });

  it('does not recreate or drop the image across re-renders', () => {
    const { rerender } = render(<Avatar src="/uploads/a.png" name="Ali" />);
    const first = screen.getByAltText('Ali');
    rerender(<Avatar src="/uploads/a.png" name="Ali" />);

    expect(screen.getByAltText('Ali')).toBe(first);
  });

  it('falls back when the image genuinely does not exist (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));

    render(<Avatar src="/uploads/missing.png" name="Ali" />);
    fireEvent.error(screen.getByAltText('Ali'));

    await waitFor(() => expect(screen.queryByAltText('Ali')).not.toBeInTheDocument());
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders previously cached bytes while offline (after reload)', async () => {
    const url = imageCache.normalizeImageUrl('/uploads/a.png')!;
    await imageCache.putImageBytes(url, new Uint8Array([1, 2, 3]).buffer);
    mockNavigatorOnline(false);

    render(<Avatar src="/uploads/a.png" name="Ali" />);

    await waitFor(() => {
      const img = screen.getByAltText('Ali') as HTMLImageElement;
      expect(img.getAttribute('src') || '').toMatch(/^blob:/);
    });
  });

  it('persists bytes for offline use after a successful load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([4, 5, 6]), { status: 200 }),
    );
    const url = imageCache.normalizeImageUrl('/uploads/a.png')!;

    render(<Avatar src="/uploads/a.png" name="Ali" />);
    fireEvent.load(screen.getByAltText('Ali'));

    await waitFor(async () => {
      const stored = await imageCache.getImageBytes(url);
      expect(stored?.byteLength).toBe(3);
    });
  });

  it('shows the normal letter fallback when there is no image source', () => {
    render(<Avatar src={null} name="Mona" />);
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
