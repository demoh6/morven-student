import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useNotificationStore } from '@/components/Layout/Header/Notification/useNotificationStore';
import { fetchNotifications as fetchNotificationsApi } from '@/components/Layout/Header/Notification/notificationApi';

vi.mock('@/dev/previewMode', () => ({ isPreviewMode: () => false }));

vi.mock('@/pages/auth/authApi', () => ({
  getAccessToken: () => 'test-token',
}));

vi.mock('@/components/Layout/Header/Notification/notificationApi', () => ({
  fetchNotifications: vi.fn(),
  createNotification: vi.fn(),
  deleteNotification: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
}));

describe('useNotificationStore.fetchNotifications', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      loading: false,
    });
    vi.mocked(fetchNotificationsApi).mockReset();
  });

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