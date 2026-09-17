import { authRequest } from '@/pages/auth/authApi';

export interface ServerNotification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'announcement' | 'update';
  createdAt: string;
  read: boolean;
}

export async function fetchNotifications(): Promise<{
  notifications: ServerNotification[];
}> {
  return authRequest<{ notifications: ServerNotification[] }>(
    '/api/notifications',
  );
}

export async function createNotification(input: {
  title: string;
  body: string;
  type: 'info' | 'announcement' | 'update';
}): Promise<{ notification: ServerNotification }> {
  return authRequest<{ notification: ServerNotification }>(
    '/api/notifications',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export async function deleteNotification(
  id: string,
): Promise<{ message: string }> {
  return authRequest<{ message: string }>(`/api/notifications/${id}`, {
    method: 'DELETE',
  });
}

export async function markAsRead(
  id: string,
): Promise<{ message: string }> {
  return authRequest<{ message: string }>(`/api/notifications/${id}/read`, {
    method: 'POST',
  });
}

export async function markAllAsRead(): Promise<{ message: string }> {
  return authRequest<{ message: string }>('/api/notifications/read-all', {
    method: 'POST',
  });
}

export async function unmarkAsRead(
  id: string,
): Promise<{ message: string }> {
  return authRequest<{ message: string }>(`/api/notifications/${id}/read`, {
    method: 'DELETE',
  });
}
