import { create } from 'zustand';
import { getAccessToken } from '@/pages/auth/authApi';
import { scopedKey } from '@/storage/scope';
import { cacheGet, cacheSet } from '@/services/offlineCache';
import { enqueueMutation, isRetryableError } from '@/services/offlineQueue';
import {
  fetchNotifications as fetchNotificationsApi,
  createNotification as createNotificationApi,
  deleteNotification as deleteNotificationApi,
  markAsRead as markAsReadApi,
  markAllAsRead as markAllAsReadApi,
} from '@/components/Layout/Header/Notification/notificationApi';

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'announcement' | 'update';
  createdAt: string;
  read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  dismissedIds: string[];
  addNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (id: string) => void;
  fetchNotifications: () => Promise<void>;
  createNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}

// Dismissals are ACCOUNT-SCOPED (morven:guest:... | morven:acct:<id>:...) so
// one account's hidden notifications never hide another account's notifications
// on the same device. The old global key is read once as a migration fallback.
const DISMISSED_LOGICAL = 'dismissedNotifications';
const LEGACY_DISMISSED_KEY = 'morven:dismissedNotifications';
const CACHE_KEY = 'notifications';
const READ_ALL_KEY = 'read-all';

function loadDismissedIds(): string[] {
  try {
    const scoped = localStorage.getItem(scopedKey(DISMISSED_LOGICAL));
    if (scoped !== null) return JSON.parse(scoped);
    const legacy = localStorage.getItem(LEGACY_DISMISSED_KEY);
    return legacy ? JSON.parse(legacy) : [];
  } catch {
    return [];
  }
}

function persistDismissedIds(ids: string[]) {
  try {
    localStorage.setItem(scopedKey(DISMISSED_LOGICAL), JSON.stringify(ids));
  } catch {
    /* storage full or unavailable — silently ignore */
  }
}

function recompute(state: NotificationState, notifications: Notification[]): Partial<NotificationState> {
  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
  };
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  // Start empty; notifications come from the server (or the offline cache).
  notifications: [],
  unreadCount: 0,
  loading: false,
  dismissedIds: loadDismissedIds(),

  addNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: `n${Date.now()}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    set((state) =>
      recompute(state, [notification, ...state.notifications]),
    );
  },

  markAsRead: (id) => {
    const notif = get().notifications.find((n) => n.id === id);
    if (!notif || notif.read) return;
    set((state) =>
      recompute(
        state,
        state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      ),
    );
    void cacheSet(CACHE_KEY, get().notifications);
    markAsReadApi(id).catch((err) => {
      if (isRetryableError(err)) {
        // Offline / transient — keep the optimistic state and replay later.
        void enqueueMutation({
          type: 'notification.read',
          payload: { id },
          idempotencyKey: `read:${id}`,
        });
        return;
      }
      // Confirmed rejection — revert the optimistic change.
      set((state) =>
        recompute(
          state,
          state.notifications.map((n) =>
            n.id === id ? { ...n, read: false } : n,
          ),
        ),
      );
    });
  },

  markAllAsRead: () => {
    set((state) =>
      recompute(
        state,
        state.notifications.map((n) => ({ ...n, read: true })),
      ),
    );
    void cacheSet(CACHE_KEY, get().notifications);
    markAllAsReadApi().catch((err) => {
      if (isRetryableError(err)) {
        void enqueueMutation({
          type: 'notification.read-all',
          payload: {},
          idempotencyKey: READ_ALL_KEY,
        });
        return;
      }
      fetchNotificationsApi()
        .then(({ notifications }) => {
          set((state) => recompute(state, notifications));
        })
        .catch(() => {
          /* keep optimistic state */
        });
    });
  },

  dismissNotification: (id) => {
    const n = get().notifications.find((x) => x.id === id);
    if (!n) return;
    if (!n.read) get().markAsRead(id);
    const nextDismissed = [...new Set([...get().dismissedIds, id])];
    persistDismissedIds(nextDismissed);
    const nextNotifications = get().notifications.filter((x) => x.id !== id);
    set({
      dismissedIds: nextDismissed,
      notifications: nextNotifications,
      unreadCount: nextNotifications.filter((x) => !x.read).length,
    });
    void cacheSet(CACHE_KEY, nextNotifications);
  },

  fetchNotifications: async () => {
    if (!getAccessToken()) return;
    // Refresh dismissals for the CURRENT scope (they change across accounts).
    set({ loading: true, dismissedIds: loadDismissedIds() });
    try {
      const { notifications: server } = await fetchNotificationsApi();
      const dismissed = new Set(get().dismissedIds);
      const filtered = server.filter((n) => !dismissed.has(n.id));
      set((state) => ({ ...recompute(state, filtered), loading: false }));
      void cacheSet(CACHE_KEY, filtered);
    } catch {
      // Offline / unreachable — serve the last known list (even if stale).
      const cached = await cacheGet<Notification[]>(CACHE_KEY, {
        allowStale: true,
      });
      if (cached) {
        const dismissed = new Set(get().dismissedIds);
        const filtered = cached.value.filter((n) => !dismissed.has(n.id));
        set((state) => ({ ...recompute(state, filtered), loading: false }));
      } else {
        set({ loading: false });
      }
    }
  },

  createNotification: async (n) => {
    const { notification } = await createNotificationApi(n);
    set((state) =>
      recompute(state, [{ ...notification, read: false }, ...state.notifications]),
    );
    void cacheSet(CACHE_KEY, get().notifications);
  },

  deleteNotification: async (id) => {
    await deleteNotificationApi(id);
    set((state) =>
      recompute(state, state.notifications.filter((x) => x.id !== id)),
    );
    void cacheSet(CACHE_KEY, get().notifications);
  },
}));

/**
 * Re-read account-scoped dismissal state and drop in-memory notifications whenever
 * the active scope changes (login / logout). Prevents an account's notifications
 * from lingering after a switch and never leaks cached data across accounts.
 */
export function rehydrateNotificationStore(): void {
  useNotificationStore.setState({
    dismissedIds: loadDismissedIds(),
    notifications: [],
    unreadCount: 0,
    loading: false,
  });
}
