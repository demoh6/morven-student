import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useNotificationStore } from '@/components/Layout/Header/Notification/useNotificationStore';
import { fetchNotifications as fetchNotificationsApi } from '@/components/Layout/Header/Notification/notificationApi';

vi.mock('@/pages/auth/authApi', () => ({
  getAccessToken: () => 'test-token',
}));

vi.mock('@/components/Layout/Header/Notification/notificationApi', () => ({
  fetchNotifications: vi.fn(),
  createNotification: vi.fn(),
  deleteNotification: vi.fn(),
  markAsRead: vi.fn().mockResolvedValue({ message: '' }),
  markAllAsRead: vi.fn().mockResolvedValue({ message: '' }),
}));

beforeEach(() => {
  localStorage.clear();
  useNotificationStore.setState({
    notifications: [],
    unreadCount: 0,
    loading: false,
    dismissedIds: [],
  });
  vi.mocked(fetchNotificationsApi).mockReset();
});

describe('useNotificationStore.fetchNotifications', () => {
  it('hydrates the store and unread badge from the server list', async () => {
    vi.mocked(fetchNotificationsApi).mockResolvedValue({
      notifications: [
        { id: 'n1', title: 'مرحباً', body: 'نص', type: 'info', createdAt: '2026-01-01T00:00:00.000Z', read: false },
        { id: 'n2', title: 'إعلان', body: 'نص', type: 'announcement', createdAt: '2026-01-01T00:00:00.000Z', read: true },
      ],
    });

    await useNotificationStore.getState().fetchNotifications();

    expect(useNotificationStore.getState().notifications).toHaveLength(2);
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it('stays empty when the server returns no notifications', async () => {
    vi.mocked(fetchNotificationsApi).mockResolvedValue({ notifications: [] });

    await useNotificationStore.getState().fetchNotifications();

    expect(useNotificationStore.getState().notifications).toEqual([]);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});

describe('useNotificationStore.dismissNotification', () => {
  it('removes the notification and excludes it from subsequent fetches', async () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n1', title: 'A', body: 'a', type: 'info', createdAt: '2026-01-01T00:00:00.000Z', read: false },
        { id: 'n2', title: 'B', body: 'b', type: 'info', createdAt: '2026-01-01T00:00:00.000Z', read: false },
      ],
      unreadCount: 2,
    });

    useNotificationStore.getState().dismissNotification('n1');

    expect(useNotificationStore.getState().notifications.find((n) => n.id === 'n1')).toBeUndefined();
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    // Simulate a poll returning the same server list
    vi.mocked(fetchNotificationsApi).mockResolvedValue({
      notifications: [
        { id: 'n1', title: 'A', body: 'a', type: 'info', createdAt: '2026-01-01T00:00:00.000Z', read: false },
        { id: 'n2', title: 'B', body: 'b', type: 'info', createdAt: '2026-01-01T00:00:00.000Z', read: false },
      ],
    });

    await useNotificationStore.getState().fetchNotifications();

    expect(useNotificationStore.getState().notifications.find((n) => n.id === 'n1')).toBeUndefined();
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0].id).toBe('n2');
  });

  it('persists dismissed IDs to localStorage', () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n1', title: 'A', body: 'a', type: 'info', createdAt: '2026-01-01T00:00:00.000Z', read: true },
      ],
    });

    useNotificationStore.getState().dismissNotification('n1');

    const stored = JSON.parse(localStorage.getItem('morven:dismissedNotifications')!);
    expect(stored).toContain('n1');
  });
});