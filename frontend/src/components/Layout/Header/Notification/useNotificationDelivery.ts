import { useEffect } from 'react';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { useNotificationStore } from '@/components/Layout/Header/Notification/useNotificationStore';
import { onNotification } from '@/services/socketService';
import { isPreviewMode } from '@/dev/previewMode';

// Lightweight polling fallback so a newly targeted notification (e.g. a
// SUB_ADMIN promotion) reaches the user even when the socket is not connected
// (offline, private window before first page interaction, etc.).
const POLL_INTERVAL_MS = 60_000;

/**
 * Keeps the in-memory notification store in sync with the server so the
 * bell badge lights up and the panel list is fresh WITHOUT requiring the user
 * to manually open the panel first:
 *
 * 1. Hydrate immediately whenever the user is authenticated (badge + list).
 * 2. Push path: react instantly to a real-time "notification:new" socket event.
 * 3. Fallback path: poll every POLL_INTERVAL_MS while authenticated.
 *
 * The panel itself still re-fetches on open; this is purely additive.
 */
export function useNotificationDelivery() {
  const user = useAuthStore((s) => s.user);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);

  useEffect(() => {
    if (!user || isPreviewMode()) return;

    void fetchNotifications();

    const interval = setInterval(() => {
      void fetchNotifications();
    }, POLL_INTERVAL_MS);

    onNotification(() => {
      void fetchNotifications();
    });

    return () => {
      clearInterval(interval);
      onNotification(null);
    };
  }, [user, fetchNotifications]);
}