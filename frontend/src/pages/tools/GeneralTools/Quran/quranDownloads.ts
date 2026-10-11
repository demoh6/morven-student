import type { Reciter, Surah } from '@/pages/tools/GeneralTools/Quran/quran';

/**
 * Offline audio downloads for the Quran tool.
 *
 * Downloaded surah audio is stored in a dedicated Cache Storage bucket so it
 * survives page refreshes, browser restarts and PWA updates. A synthetic cache
 * key (rather than the remote MP3 URL) is used so the reciter/surah pair can be
 * recovered by simply enumerating the cache.
 *
 * The remote CDN (cdn.mp3quran.net) serves `Access-Control-Allow-Origin: *`
 * and `Content-Range`, so the files can be fetched and streamed from the page.
 */

export const AUDIO_CACHE_NAME = 'morven-quran-audio-v1';

// Synthetic, same-origin-looking key. Never requested over the network; only
// used as a Cache Storage key.
const CACHE_KEY_PREFIX = 'https://morven.local/quran-audio/';

// Small index of sizes/timestamps for UI. Cache Storage remains the source of
// truth; this is best-effort and reconciled against the cache on init.
const INDEX_KEY = 'morven:quran:audio-index';

export class QuotaError extends Error {
  constructor() {
    super('insufficient-storage');
    this.name = 'QuotaError';
  }
}

export function downloadsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'caches' in window &&
    typeof fetch === 'function'
  );
}

function normalizeServer(server: string): string {
  if (!server) return '';
  return server.endsWith('/') ? server : `${server}/`;
}

/** Build the remote MP3 URL for a reciter/surah, using the existing scheme. */
export function audioUrl(server: string, surahId: number): string {
  return `${normalizeServer(server)}${String(surahId).padStart(3, '0')}.mp3`;
}

export function downloadKey(reciterId: string, surahId: number): string {
  return `${reciterId}:${surahId}`;
}

function cacheKey(reciterId: string, surahId: number): string {
  return `${CACHE_KEY_PREFIX}${encodeURIComponent(reciterId)}/${surahId}`;
}

function parseCacheKey(url: string): string | null {
  if (!url.startsWith(CACHE_KEY_PREFIX)) return null;

  const rest = url.slice(CACHE_KEY_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;

  const reciterId = decodeURIComponent(rest.slice(0, slash));
  const surahId = rest.slice(slash + 1);
  if (!reciterId || !surahId) return null;

  return downloadKey(reciterId, Number(surahId));
}

interface AudioIndexEntry {
  size: number;
  at: number;
}

type AudioIndex = Record<string, AudioIndexEntry>;

function readIndex(): AudioIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as AudioIndex) : {};
  } catch {
    return {};
  }
}

function writeIndex(index: AudioIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* index is best-effort */
  }
}

async function openAudioCache(): Promise<Cache> {
  return caches.open(AUDIO_CACHE_NAME);
}

/** All reciter:surah keys present in the download cache. */
export async function listDownloadedKeys(): Promise<string[]> {
  if (!downloadsSupported()) return [];

  try {
    const cache = await openAudioCache();
    const requests = await cache.keys();
    const keys: string[] = [];

    for (const request of requests) {
      const key = parseCacheKey(request.url);
      if (key) keys.push(key);
    }

    return keys;
  } catch {
    return [];
  }
}

export async function isDownloaded(
  reciterId: string,
  surahId: number,
): Promise<boolean> {
  if (!downloadsSupported()) return false;

  try {
    const cache = await openAudioCache();
    const response = await cache.match(cacheKey(reciterId, surahId));
    return Boolean(response);
  } catch {
    return false;
  }
}

/**
 * Return a playable blob URL for a downloaded surah, or null if it is not
 * downloaded. The caller owns the returned URL and must revoke it.
 */
export async function getCachedAudioUrl(
  reciterId: string,
  surahId: number,
): Promise<string | null> {
  if (!downloadsSupported()) return null;

  try {
    const cache = await openAudioCache();
    const response = await cache.match(cacheKey(reciterId, surahId));
    if (!response) return null;

    const blob = await response.blob();
    if (blob.size === 0) return null;

    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function getStoredSize(key: string): number | null {
  return readIndex()[key]?.size ?? null;
}

async function hasEnoughSpace(requiredBytes: number): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.estimate === 'function'
    ) {
      const estimate = await navigator.storage.estimate();
      const quota = estimate.quota ?? 0;
      const usage = estimate.usage ?? 0;
      if (quota > 0) return usage + requiredBytes <= quota * 0.98;
    }
  } catch {
    /* estimate unavailable — fall through and let cache.put enforce quota */
  }
  return true;
}

/**
 * Download a surah's audio and persist it. Resolves only once the complete file
 * is stored; a partial/failed download never leaves a cache entry behind.
 */
export async function downloadSurah(
  reciter: Reciter,
  surah: Surah,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  if (!downloadsSupported()) throw new Error('unsupported');

  const cache = await openAudioCache();
  const key = cacheKey(reciter.id, surah.id);

  // Already stored (e.g. a duplicate click) — nothing to do.
  if (await cache.match(key)) {
    onProgress?.(1);
    return;
  }

  const response = await fetch(audioUrl(reciter.server, surah.id), {
    mode: 'cors',
  });

  if (!response.ok) throw new Error(`http-${response.status}`);

  const contentType = response.headers.get('Content-Type') || 'audio/mpeg';
  const total = Number(response.headers.get('Content-Length')) || 0;

  if (total > 0 && !(await hasEnoughSpace(total))) {
    throw new QuotaError();
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          onProgress?.(Math.min(received / total, 0.99));
        }
      }
    }
  } else {
    const buffer = new Uint8Array(await response.arrayBuffer());
    chunks.push(buffer);
    received = buffer.length;
  }

  // Reject truncated responses before touching the cache.
  if (total > 0 && received !== total) throw new Error('incomplete');
  if (received === 0) throw new Error('incomplete');

  const blob = new Blob(chunks as BlobPart[], { type: contentType });

  try {
    await cache.put(
      key,
      new Response(blob, {
        headers: {
          'Content-Type': contentType,
          'X-Morven-Size': String(blob.size),
        },
      }),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new QuotaError();
    }
    if (
      error instanceof Error &&
      /quota|storage/i.test(error.message) &&
      !/network/i.test(error.message)
    ) {
      throw new QuotaError();
    }
    throw error;
  }

  const index = readIndex();
  index[downloadKey(reciter.id, surah.id)] = {
    size: blob.size,
    at: Date.now(),
  };
  writeIndex(index);

  onProgress?.(1);
}

export async function removeDownload(
  reciterId: string,
  surahId: number,
): Promise<void> {
  if (!downloadsSupported()) return;

  try {
    const cache = await openAudioCache();
    await cache.delete(cacheKey(reciterId, surahId));
  } finally {
    const index = readIndex();
    delete index[downloadKey(reciterId, surahId)];
    writeIndex(index);
  }
}
