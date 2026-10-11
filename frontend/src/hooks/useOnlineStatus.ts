import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Every offline notice is shown for this long before auto-dismissing. */
export const OFFLINE_NOTICE_DURATION_MS = 5000;

/**
 * Controls a transient offline notice.
 *
 * The notice is shown whenever the browser reports being offline — including
 * when the consumer mounts while already offline — and hides itself after
 * `durationMs`. Each new trigger (a fresh offline transition or mount) restarts
 * the dismissal timer, so a newer notice is never dismissed early by a timer
 * scheduled for an earlier one.
 */
export function useOfflineNotice(
  durationMs: number = OFFLINE_NOTICE_DURATION_MS,
): boolean {
  const isOnline = useOnlineStatus();
  const [visible, setVisible] = useState(() => !isOnline);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (isOnline) {
      clearTimer();
      setVisible(false);
      return clearTimer;
    }

    setVisible(true);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setVisible(false);
    }, durationMs);

    return clearTimer;
  }, [isOnline, durationMs]);

  return visible;
}
