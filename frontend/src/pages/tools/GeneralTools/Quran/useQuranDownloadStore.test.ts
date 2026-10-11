import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Reciter, Surah } from '@/pages/tools/GeneralTools/Quran/quran';

const { addNotification } = vi.hoisted(() => ({ addNotification: vi.fn() }));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: { getState: () => ({ addNotification }) },
}));

import { useQuranDownloadStore } from '@/pages/tools/GeneralTools/Quran/useQuranDownloadStore';

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

function okResponse(bytes: Uint8Array): Response {
  const headers = new Map<string, string>([
    ['content-type', 'audio/mpeg'],
    ['content-length', String(bytes.length)],
  ]);
  return {
    ok: true,
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
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
  addNotification.mockClear();
  useQuranDownloadStore.setState({
    ready: false,
    downloaded: {},
    busy: {},
    progress: {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useQuranDownloadStore', () => {
  it('downloads a surah and marks it downloaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Uint8Array([1, 2, 3]))));

    await useQuranDownloadStore.getState().download(reciter, surah);

    const state = useQuranDownloadStore.getState();
    expect(state.downloaded['5:1']).toBe(true);
    expect(state.busy['5:1']).toBe(false);
    expect(addNotification).toHaveBeenCalledWith(
      expect.stringContaining('تم تحميل'),
      'success',
    );
  });

  it('prevents duplicate downloads of the same surah while in progress', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      useQuranDownloadStore.getState().download(reciter, surah),
      useQuranDownloadStore.getState().download(reciter, surah),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not download a surah that is already cached', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    useQuranDownloadStore.setState({ downloaded: { '5:1': true } });
    await useQuranDownloadStore.getState().download(reciter, surah);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports insufficient storage without marking the surah downloaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Uint8Array([1, 2, 3]))));
    vi.spyOn(cache, 'put').mockRejectedValue(
      new DOMException('quota exceeded', 'QuotaExceededError'),
    );

    await useQuranDownloadStore.getState().download(reciter, surah);

    const state = useQuranDownloadStore.getState();
    expect(state.downloaded['5:1']).toBeUndefined();
    expect(addNotification).toHaveBeenCalledWith(
      expect.stringContaining('مساحة'),
      'error',
      expect.any(Number),
    );
  });

  it('reports a failed download for network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await useQuranDownloadStore.getState().download(reciter, surah);

    expect(useQuranDownloadStore.getState().downloaded['5:1']).toBeUndefined();
    expect(addNotification).toHaveBeenCalledWith(
      expect.stringContaining('فشل'),
      'error',
    );
  });

  it('removes a downloaded surah from state and cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Uint8Array([1, 2, 3]))));
    await useQuranDownloadStore.getState().download(reciter, surah);

    await useQuranDownloadStore.getState().remove('5', 1);

    expect(useQuranDownloadStore.getState().downloaded['5:1']).toBeUndefined();
    expect(cache.store.size).toBe(0);
  });
});
