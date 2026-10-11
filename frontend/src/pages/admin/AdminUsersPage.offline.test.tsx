import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ listUsers: vi.fn(), updateUserRole: vi.fn() }));
const cache = vi.hoisted(() => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { value: null as { id: string; role: string } | null } }));

vi.mock('@/pages/admin/adminApi', () => ({
  listUsers: api.listUsers,
  updateUserRole: api.updateUserRole,
}));
vi.mock('@/services/offlineCache', () => cache);
vi.mock('@/pages/auth/useAuthStore', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) => selector({ user: auth.user.value }),
}));

import AdminUsersPage from '@/pages/admin/AdminUsersPage';

const cachedUser = {
  id: 'u1',
  displayName: 'Ali',
  username: 'ali',
  email: 'ali@example.com',
  role: 'USER',
  avatarUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  cache.cacheSet.mockResolvedValue(undefined);
  api.listUsers.mockRejectedValue(new TypeError('Failed to fetch'));
});

describe('AdminUsersPage — role-gated offline cache', () => {
  it('serves cached admin data to a currently-authorized admin', async () => {
    auth.user.value = { id: 'me', role: 'ADMIN' };
    cache.cacheGet.mockResolvedValue({ value: [cachedUser], updatedAt: 1, expiresAt: null });

    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Ali')).toBeTruthy();
    expect(cache.cacheGet).toHaveBeenCalledWith('admin:users', { allowStale: true });
  });

  it('never serves cached admin data to a non-admin role', async () => {
    auth.user.value = { id: 'me', role: 'USER' };

    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Failed to fetch')).toBeTruthy();
    expect(cache.cacheGet).not.toHaveBeenCalled();
  });
});
