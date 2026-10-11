/**
 * Connectivity glue for the offline queue.
 *
 * Installs browser `online`/`offline` listeners once per SPA session and
 * flushes queued mutations whenever connectivity returns. Kept deliberately
 * thin — the durable queue itself lives in `offlineQueue.ts`; React components
 * read live browser connectivity via `hooks/useOnlineStatus`.
 */

import { flushMutations } from '@/services/offlineQueue';

/**
 * Replay queued mutations for the current account. Safe to call at any time
 * (login completion, window focus, reconnect); it is a no-op when the active
 * scope/account does not match the queue owner.
 */
export async function flushQueue(): Promise<void> {
  try {
    await flushMutations();
  } catch {
    /* best-effort — the queue is durable and will retry */
  }
}

let installed = false;

/** Idempotently install online/offline listeners. Call once from bootstrap. */
export function installConnectivity(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('online', () => {
    void flushQueue();
  });

  // A reconnect can also be signalled by the tab regaining focus without an
  // `online` event (e.g. a sleeping laptop); opportunistically flush too.
  window.addEventListener('focus', () => {
    void flushQueue();
  });
}
