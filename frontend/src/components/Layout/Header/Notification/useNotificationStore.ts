import { create } from 'zustand';
import { isPreviewMode } from '@/dev/previewMode';
import { getAccessToken } from '@/pages/auth/authApi';
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

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    title: 'مرحباً بك في الملتقى',
    body: 'تم إطلاق الملتقى ! انضم لمجموعتك الدراسية وابدأ التعاون مع زملائك.',
    type: 'announcement',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: 'n2',
    title: 'تحديث جديد',
    body: 'تم إضافة غرفة الدراسة المباشرة. يمكنك الآن الانضمام لغرف دراسية مع زملائك.',
    type: 'update',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: 'n3',
    title: 'معلومة',
    body: 'يمكنك إنشاء حتى 3 مجموعات دراسية. انضم لمجموعات زملائك باستخدام رمز الانضمام.',
    type: 'info',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
];

const DISMISSED_KEY = 'morven:dismissedNotifications';

function loadDismissedIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistDismissedIds(ids: string[]) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
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
  // M5: no hardcoded mock data in production — start empty. The demo mocks are
  // only seeded for the dev-only preview mode.
  notifications: isPreviewMode() ? MOCK_NOTIFICATIONS : [],
  unreadCount: isPreviewMode() ? MOCK_NOTIFICATIONS.filter((n) => !n.read).length : 0,
  loading: false,
  dismissedIds: isPreviewMode() ? [] : loadDismissedIds(),

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
    markAsReadApi(id).catch(() => {
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
    markAllAsReadApi().catch(() => {
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
    if (!n.read) markAsReadApi(id).catch(() => {});
    const nextDismissed = [...new Set([...get().dismissedIds, id])];
    persistDismissedIds(nextDismissed);
    set((state) => ({
      dismissedIds: nextDismissed,
      notifications: state.notifications.filter((x) => x.id !== id),
    }));
  },

  fetchNotifications: async () => {
    if (isPreviewMode()) return;
    if (!getAccessToken()) return;
    set({ loading: true });
    try {
      const { notifications: server } = await fetchNotificationsApi();
      const dismissed = new Set(get().dismissedIds);
      const filtered = server.filter((n) => !dismissed.has(n.id));
      set((state) => ({ ...recompute(state, filtered), loading: false }));
    } catch {
      set({ loading: false });
    }
  },

  createNotification: async (n) => {
    const { notification } = await createNotificationApi(n);
    set((state) =>
      recompute(state, [{ ...notification, read: false }, ...state.notifications]),
    );
  },

  deleteNotification: async (id) => {
    await deleteNotificationApi(id);
    set((state) =>
      recompute(state, state.notifications.filter((x) => x.id !== id)),
    );
  },
}));
