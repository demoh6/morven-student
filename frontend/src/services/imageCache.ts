/**
 * Account-scoped offline cache for image BINARY data (profile avatars and group
 * images).
 *
 * Images are different from the JSON responses handled by `offlineCache.ts`:
 * they must remain renderable while offline and after a browser restart, and a
 * transient network failure must never erase the last successfully downloaded
 * copy. The bytes are therefore persisted in the shared `morven-storage`
 * IndexedDB (the same `cache` object store as the read cache) and partitioned
 * by account scope so one account's images can never be served under another.
 *
 * Because the records live in the same store/scope index as the read cache,
 * the existing `cacheClearScope()` isolation used on logout also removes every
 * cached image for that account.
 *
 * A secondary, synchronous in-memory map holds the object URLs created from
 * those bytes so repeated renders / component remounts reuse one URL instead of
 * re-reading IndexedDB or re-downloading the image. The map is keyed by
 * (`scope`, `url`) and is revoked whenever the scope changes or the caller
 * clears it (logout).
 *
 * All operations are best-effort: an unavailable IndexedDB degrades to "no
 * cached image" and never throws to callers.
 */

import { openDB, CACHE_STORE } from '@/services/db';
import { currentScopeString } from '@/storage/scope';
import { API_BASE } from '@/services/apiBase';

/** Bounded so the cache can never grow without limit. */
export const MAX_CACHED_IMAGES = 200;

const IMAGE_KEY_PREFIX = 'image:';

interface ImageRecord {
  id: string;
  scope: string;
  key: string;
  url: string;
  bytes: ArrayBuffer;
  updatedAt: number;
  lastUsedAt: number;
}

function recordId(scope: string, key: string): string {
  return `${scope}::${key}`;
}

function imageKey(url: string): string {
  return `${IMAGE_KEY_PREFIX}${url}`;
}

/**
 * Realm-safe `ArrayBuffer` check. Records that round-trip through a structured
 * clone (and, in tests, the in-memory IDB fake) can carry an `ArrayBuffer` from
 * another realm, for which `instanceof ArrayBuffer` is `false`.
 */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer ||
    Object.prototype.toString.call(value) === '[object ArrayBuffer]'
  );
}

// ---------------------------------------------------------------------------
// URL normalisation
// ---------------------------------------------------------------------------

/**
 * Resolve a stored image reference into the absolute URL that is both fetched
 * and used as the cache key. Relative API paths (e.g. `/uploads/abc.png`) are
 * prefixed with `API_BASE`; absolute (`http(s)`, `blob:`, `data:`) references
 * are used as-is. The backend stores immutable, uniquely-named files, so the
 * URL itself is a stable cache key — a genuinely updated image gets a new URL.
 */
export function normalizeImageUrl(src: string | null | undefined): string | null {
  if (typeof src !== 'string') return null;
  const raw = src.trim();
  if (!raw) return null;
  if (/^(https?:|blob:|data:)/i.test(raw)) return raw;
  return `${API_BASE}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

// ---------------------------------------------------------------------------
// In-memory object URL cache
// ---------------------------------------------------------------------------

const memoryObjectUrls = new Map<string, string>();
const pinnedImages = new Set<string>();
let memoryScope: string | null = null;

function memKey(scope: string, url: string): string {
  return `${scope}::${url}`;
}

/** Revoke every object URL and drop the memory map (used on logout/scope swap). */
export function clearImageMemoryCache(): void {
  for (const objectUrl of memoryObjectUrls.values()) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      /* ignore */
    }
  }
  memoryObjectUrls.clear();
  pinnedImages.clear();
  memoryScope = null;
}

/** Drop the memory cache when the active scope changed. Safe (async contexts). */
function ensureMemoryScope(): string {
  const scope = currentScopeString();
  if (scope !== memoryScope) {
    clearImageMemoryCache();
    memoryScope = scope;
  }
  return scope;
}

/**
 * Synchronous lookup of an already-materialised object URL. Never performs I/O
 * and never mutates state, so it is safe to call while rendering.
 */
export function getMemoryObjectUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return memoryObjectUrls.get(memKey(currentScopeString(), url)) ?? null;
}

/**
 * Create (or reuse) the object URL for a URL + its bytes under the current
 * scope. Callers must only pass bytes they obtained for the same URL.
 */
export function getOrCreateObjectUrl(url: string, bytes: ArrayBuffer): string {
  const scope = ensureMemoryScope();
  const key = memKey(scope, url);
  const existing = memoryObjectUrls.get(key);
  if (existing) return existing;
  const objectUrl = URL.createObjectURL(new Blob([bytes]));
  memoryObjectUrls.set(key, objectUrl);
  return objectUrl;
}

/** Mark a URL as currently rendered so LRU cleanup never evicts its only copy. */
export function pinImage(url: string): void {
  pinnedImages.add(memKey(currentScopeString(), url));
}

/** Release a URL pinned by `pinImage`. */
export function unpinImage(url: string): void {
  pinnedImages.delete(memKey(currentScopeString(), url));
}

// ---------------------------------------------------------------------------
// IndexedDB persistence
// ---------------------------------------------------------------------------

function runRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Read cached bytes for an image under the current scope. */
export async function getImageBytes(url: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    const scope = currentScopeString();
    const tx = db.transaction(CACHE_STORE, 'readonly');
    const record = await runRequest<ImageRecord | undefined>(
      tx.objectStore(CACHE_STORE).get(recordId(scope, imageKey(url))),
    );
    const bytes = record?.bytes;
    return isArrayBuffer(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

/** Persist image bytes for offline use under the current scope. Best-effort. */
export async function putImageBytes(url: string, bytes: ArrayBuffer): Promise<void> {
  if (!isArrayBuffer(bytes) || bytes.byteLength === 0) return;
  try {
    const db = await openDB();
    const scope = currentScopeString();
    const now = Date.now();
    const record: ImageRecord = {
      id: recordId(scope, imageKey(url)),
      scope,
      key: imageKey(url),
      url,
      bytes,
      updatedAt: now,
      lastUsedAt: now,
    };
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    tx.objectStore(CACHE_STORE).put(record);
    await runTransaction(tx);
    await enforceLimit(db, scope);
  } catch {
    /* IndexedDB unavailable — nothing to cache */
  }
}

/** Remove a single cached image under the current scope. Best-effort. */
export async function deleteImageBytes(url: string): Promise<void> {
  try {
    const db = await openDB();
    const scope = currentScopeString();
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    tx.objectStore(CACHE_STORE).delete(recordId(scope, imageKey(url)));
    await runTransaction(tx);
  } catch {
    /* ignore */
  }
}

/**
 * Evict the least-recently-used images once the scope exceeds the cap. Records
 * that are currently pinned (mounted) are never evicted, so cleanup can never
 * remove the only locally available copy of an image that is on screen.
 */
async function enforceLimit(db: IDBDatabase, scope: string): Promise<void> {
  if (typeof IDBKeyRange === 'undefined') return;
  const tx = db.transaction(CACHE_STORE, 'readonly');
  const all = await runRequest<ImageRecord[]>(
    tx.objectStore(CACHE_STORE).index('scope').getAll(IDBKeyRange.only(scope)),
  );
  const images = all.filter((r) => typeof r?.key === 'string' && r.key.startsWith(IMAGE_KEY_PREFIX));
  if (images.length <= MAX_CACHED_IMAGES) return;

  images.sort(
    (a, b) => (a.lastUsedAt ?? a.updatedAt) - (b.lastUsedAt ?? b.updatedAt),
  );
  const victims = images
    .filter((r) => !pinnedImages.has(memKey(scope, r.url)))
    .slice(0, images.length - MAX_CACHED_IMAGES);
  if (victims.length === 0) return;

  const delTx = db.transaction(CACHE_STORE, 'readwrite');
  const store = delTx.objectStore(CACHE_STORE);
  for (const victim of victims) store.delete(victim.id);
  await runTransaction(delTx);
}
