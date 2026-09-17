import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationDelivery } from '@/components/Layout/Header/Notification/useNotificationDelivery';
import { useNotificationStore } from '@/components/Layout/Header/Notification/useNotificationStore';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { onNotification } from '@/services/socketService';

vi.mock('@/services/socketService', () => ({
  onNotification: vi.fn(),
}));

describe('useNotificationDelivery', () => {
  const fetchNotifications = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    useAuthStore.setState({
      user: { id: 'u1', email: 'a@b.c', username: 'u1', displayName: 'User', role: 'USER', avatarUrl: null, createdAt: '2026-01-01T00:00:00.000Z' },
      initialized: true,
    });
    useNotificationStore.setState({ fetchNotifications, notifications: [], unreadCount: 0 });
    vi.mocked(onNotification).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({ user: null, initialized: true });
    vi.mocked(onNotification).mockClear();
    fetchNotifications.mockClear();
  });

  it('hydrates the notification store as soon as a user is authenticated', () => {
    renderHook(() => useNotificationDelivery());
    expect(fetchNotifications).toHaveBeenCalledTimes(1);
  });

  it('polls periodically as a fallback and reacts instantly to socket push', () => {
    renderHook(() => useNotificationDelivery());

    expect(fetchNotifications).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(fetchNotifications).toHaveBeenCalledTimes(2);

    const pushHandler = vi.mocked(onNotification).mock.calls[0][0];
    expect(pushHandler).toBeTypeOf('function');

    act(() => {
      pushHandler!({ notification: { id: 'n-x', title: 'تهانينا', body: 'تم تعيينك كمشرف في مورفن', type: 'info', createdAt: '2026-01-01T00:00:00.000Z', read: false } });
    });
    expect(fetchNotifications).toHaveBeenCalledTimes(3);
  });

  it('does nothing while logged out', () => {
    useAuthStore.setState({ user: null, initialized: true });
    renderHook(() => useNotificationDelivery());
    expect(fetchNotifications).not.toHaveBeenCalled();
    expect(onNotification).not.toHaveBeenCalled();
  });
});