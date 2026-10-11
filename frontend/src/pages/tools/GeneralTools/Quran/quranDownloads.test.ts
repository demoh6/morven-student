import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Reciter, Surah } from '@/pages/tools/GeneralTools/Quran/quran';
import {
  QuotaError,
  downloadSurah,
  downloadsSupported,
  getCachedAudioUrl,
  isDownloaded,
  listDownloadedKeys,
  removeDownload,
} from '@/pages/tools/GeneralTools/Quran/quranDownloads';

class FakeCache {
  store = new Map<string, Response>();

  async keys(): Promise<Array<{ url: string }>> {
    return [...this.store.keys()].map((url) => ({ url }));
  }

  async match(key: string | { url: string }): Promise<Response | undefined> {
    return this.store.get(typeof key === 'string' ? key : key.url);
  }

  async put(key: string | { url: string }, response: Response): Promise<void> {
    this.store.set(typeof key === 'string' ? key : key.url, response);
  }

  async delete(key: string | { url: string }): Promise<boolean> {
    return this.store.delete(typeof key === 'string' ? key : key.url);
  }
}

function streamFrom(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function okResponse(
  bytes: Uint8Array,
  contentLength = bytes.length,
): Response {
  const headers = new Map<string, string>([
    ['content-type', 'audio/mpeg'],
    ['content-length', String(contentLength)],
  ]);
  return {
    ok: true,
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
    body: streamFrom(bytes),
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response;
}

const reciter: Reciter = {
  id: '5',
  name: 'أحمد العجمي',
  style: '',
  server: 'https://cdn.mp3quran.net/audio/ahmad-ajmi/r1/',
};

const surah: Surah = { id: 1, name: 'الفاتحة' };

let cache: FakeCache;

beforeEach(() => {
  cache = new FakeCache();
  vi.stubGlobal('caches', { open: async () => cache });
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('quranDownloads', () => {
  it('reports support when Cache Storage and fetch exist', () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(downloadsSupported()).toBe(true);
  });

  it('downloads a complete file and marks it available offline', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const fetchMock = vi.fn().mockResolvedValue(okResponse(bytes));
    vi.stubGlobal('fetch', fetchMock);

    const ratios: number[] = [];
    await downloadSurah(reciter, surah, (r) => ratios.push(r));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.mp3quran.net/audio/ahmad-ajmi/r1/001.mp3',
      { mode: 'cors' },
    );
    expect(await listDownloadedKeys()).toEqual(['5:1']);
    expect(await isDownloaded('5', 1)).toBe(true);
    expect(ratios[ratios.length - 1]).toBe(1);

    const cachedUrl = await getCachedAudioUrl('5', 1);
    expect(cachedUrl).toMatch(/^blob:/);
  });

  it('does not re-download a file that is already cached', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);

    await downloadSurah(reciter, surah);
    await downloadSurah(reciter, surah);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an incomplete download and never caches it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse(new Uint8Array([1, 2, 3]), 10));
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadSurah(reciter, surah)).rejects.toThrow('incomplete');
    expect(await listDownloadedKeys()).toEqual([]);
    expect(await isDownloaded('5', 1)).toBe(false);
  });

  it('rejects a response that fails with a non-OK status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadSurah(reciter, surah)).rejects.toThrow('http-404');
    expect(await listDownloadedKeys()).toEqual([]);
  });

  it('surfaces a quota error when storage is full', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Uint8Array([1, 2, 3]))));
    vi.spyOn(cache, 'put').mockRejectedValue(
      new DOMException('quota exceeded', 'QuotaExceededError'),
    );

    await expect(downloadSurah(reciter, surah)).rejects.toBeInstanceOf(QuotaError);
    expect(await listDownloadedKeys()).toEqual([]);
  });

  it('removes a downloaded surah', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Uint8Array([1, 2, 3]))));

    await downloadSurah(reciter, surah);
    expect(await isDownloaded('5', 1)).toBe(true);

    await removeDownload('5', 1);
    expect(await isDownloaded('5', 1)).toBe(false);
    expect(await listDownloadedKeys()).toEqual([]);
  });

  it('returns null for a surah that has not been downloaded', async () => {
    expect(await getCachedAudioUrl('5', 1)).toBeNull();
  });
});
