import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getImageBytes,
  getMemoryObjectUrl,
  getOrCreateObjectUrl,
  normalizeImageUrl,
  pinImage,
  putImageBytes,
  unpinImage,
} from '@/services/imageCache';

/** Extra attempts after the initial load before giving up to the fallback. */
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1500;

export interface ImageResource {
  /** The URL the <img> should render, or null when the fallback is shown. */
  src: string | null;
  /** True once the image is considered genuinely unavailable. */
  fallback: boolean;
  /** Changes whenever the <img> must be remounted to force a reload attempt. */
  reloadKey: number;
  onLoad: () => void;
  onError: () => void;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Resolve a (possibly cached) image URL for rendering.
 *
 * Online/offline stability contract:
 *  - The network URL is rendered immediately so a valid image appears with no
 *    forced round-trip through JS (and existing synchronous markup stays).
 *  - Bytes of every successfully loaded image are persisted to the
 *    account-scoped IndexedDB cache so it renders offline and after reloads.
 *  - A transient `onError` never immediately swaps in the fallback: the cached
 *    copy is tried first, then a bounded number of delayed retries are
 *    scheduled, and connectivity recovery triggers a fresh attempt.
 *  - Only a confirmed permanent failure (404/410/403) or exhausted retries
 *    with no cached copy fall back to the initial/letter placeholder.
 *  - Re-renders with the same `src` reuse one object URL, so they never trigger
 *    extra loads or make the image disappear.
 */
export function useImageResource(source: string | null | undefined): ImageResource {
  const normalized = normalizeImageUrl(source);
  const [src, setSrc] = useState<string | null>(
    () => getMemoryObjectUrl(normalized) ?? normalized,
  );
  const [fallback, setFallback] = useState(!normalized);
  const [reloadKey, setReloadKey] = useState(0);

  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(0);
  const cachedLookupDoneRef = useRef(false);
  const mountedRef = useRef(true);
  const currentRef = useRef<string | null>(normalized);
  currentRef.current = normalized;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Track mount state so late async completions never touch a dead component.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // React to the source changing (including the first mount): reset retry
  // bookkeeping, prefer an in-memory object URL, then warm from IndexedDB.
  useEffect(() => {
    const token = ++tokenRef.current;
    attemptsRef.current = 0;
    cachedLookupDoneRef.current = false;
    clearTimer();

    if (!normalized) {
      setFallback(true);
      setSrc(null);
      return;
    }

    pinImage(normalized);
    const memory = getMemoryObjectUrl(normalized);
    setFallback(false);
    if (memory) {
      setSrc(memory);
    } else {
      setSrc(normalized);
    }

    void (async () => {
      const bytes = await getImageBytes(normalized);
      cachedLookupDoneRef.current = true;
      if (!mountedRef.current || token !== tokenRef.current) return;
      if (bytes) setSrc(getOrCreateObjectUrl(normalized, bytes));
    })();

    return () => {
      unpinImage(normalized);
    };
  }, [normalized, clearTimer]);

  // Always clear a pending retry timer on unmount.
  useEffect(() => () => clearTimer(), [clearTimer]);

  const onLoad = useCallback(() => {
    if (!normalized) return;
    attemptsRef.current = 0;
    clearTimer();
    setFallback(false);
    // Persist bytes for offline use. The browser's HTTP cache (the backend
    // serves uploads as immutable, long-lived) makes this effectively free.
    void (async () => {
      try {
        if (typeof fetch !== 'function') return;
        if ((await getImageBytes(normalized)) !== null) return;
        const res = await fetch(normalized);
        if (!res.ok) return;
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength > 0) await putImageBytes(normalized, bytes);
      } catch {
        /* best-effort */
      }
    })();
  }, [normalized, clearTimer]);

  const onError = useCallback(() => {
    if (!normalized) {
      setFallback(true);
      return;
    }
    const url = normalized;
    const stillCurrent = () => mountedRef.current && url === currentRef.current;
    void (async () => {
      // 1. If a cached copy exists, keep showing it instead of failing.
      if (!cachedLookupDoneRef.current) {
        cachedLookupDoneRef.current = true;
        const bytes = await getImageBytes(url);
        if (!stillCurrent()) return;
        if (bytes) {
          setFallback(false);
          setSrc(getOrCreateObjectUrl(url, bytes));
          return;
        }
      }

      // 2. Offline: nothing to probe — fall back and wait for reconnect.
      if (isOffline()) {
        if (!stillCurrent()) return;
        setFallback(true);
        return;
      }

      // 3. Probe the network to tell "missing" from "transient" and to cache
      //    the bytes when the image actually is available.
      let outcome: 'ok' | 'missing' | 'transient' = 'transient';
      try {
        const res = await fetch(url);
        if (res.ok) {
          try {
            const bytes = await res.arrayBuffer();
            if (bytes.byteLength > 0) {
              await putImageBytes(url, bytes);
              getOrCreateObjectUrl(url, bytes);
            }
          } catch {
            /* cache best-effort */
          }
          outcome = 'ok';
        } else if (
          res.status === 404 ||
          res.status === 410 ||
          res.status === 403 ||
          res.status === 401
        ) {
          outcome = 'missing';
        }
      } catch {
        outcome = 'transient';
      }

      if (!stillCurrent()) return;

      if (outcome === 'ok') {
        setFallback(false);
        setSrc(getMemoryObjectUrl(url) ?? url);
        return;
      }
      if (outcome === 'missing') {
        attemptsRef.current = MAX_RETRIES;
        setFallback(true);
        return;
      }

      // Transient: retry a bounded number of times with backoff.
      if (attemptsRef.current < MAX_RETRIES) {
        attemptsRef.current += 1;
        const delay = RETRY_BASE_MS * 2 ** (attemptsRef.current - 1);
        clearTimer();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          if (!stillCurrent()) return;
          setFallback(false);
          setReloadKey((k) => k + 1);
        }, delay);
      } else {
        setFallback(true);
      }
    })();
  }, [normalized, clearTimer]);

  // Connectivity recovery: when the browser comes back online, retry.
  useEffect(() => {
    if (!normalized) return;
    const onOnline = () => {
      attemptsRef.current = 0;
      cachedLookupDoneRef.current = false;
      clearTimer();
      const url = normalized;
      void (async () => {
        const bytes = await getImageBytes(url);
        if (!mountedRef.current || url !== currentRef.current) return;
        if (bytes) setSrc(getOrCreateObjectUrl(url, bytes));
        setFallback(false);
        setReloadKey((k) => k + 1);
      })();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [normalized, clearTimer]);

  return {
    src: fallback ? null : src,
    fallback,
    reloadKey,
    onLoad,
    onError,
  };
}
