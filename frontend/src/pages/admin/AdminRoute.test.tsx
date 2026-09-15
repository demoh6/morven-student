import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminRoute } from '@/pages/admin/AdminRoute';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import type { AuthUser } from '@/pages/auth/authApi';

function makeUser(role: string, id = `u-${role}`): AuthUser {
  return {
    id,
    email: `${id}@example.com`,
    username: id.toLowerCase(),
    displayName: role,
    role,
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderRoute(requireMainAdmin: boolean, role?: string) {
  const user = role ? makeUser(role) : null;
  useAuthStore.setState({ user, initialized: true, loading: false });
  const main = requireMainAdmin;
  return render(
    <MemoryRouter initialEntries={['/admin/guard']}>
      <Routes>
        <Route
          path="/admin/guard"
          element={
            <AdminRoute requireMainAdmin={main}>
              <div>ALLOWED-CONTENT</div>
            </AdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminRoute authorization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAuthStore.setState({ user: null, initialized: true, loading: false });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    useAuthStore.setState({ user: null, initialized: true, loading: false });
  });

  it('lets a SUB_ADMIN enter a normal admin page', () => {
    renderRoute(false, 'SUB_ADMIN');
    expect(screen.getByText('ALLOWED-CONTENT')).toBeInTheDocument();
  });

  it('lets an ADMIN enter a normal admin page', () => {
    renderRoute(false, 'ADMIN');
    expect(screen.getByText('ALLOWED-CONTENT')).toBeInTheDocument();
  });

  it('blocks a regular USER from a normal admin page', () => {
    renderRoute(false, 'USER');
    expect(screen.getByText('غير مصرح')).toBeInTheDocument();
    expect(screen.queryByText('ALLOWED-CONTENT')).not.toBeInTheDocument();
  });

  it('lets an ADMIN enter the user/role-management page', () => {
    renderRoute(true, 'ADMIN');
    expect(screen.getByText('ALLOWED-CONTENT')).toBeInTheDocument();
  });

  it('blocks a SUB_ADMIN from the user/role-management page', () => {
    renderRoute(true, 'SUB_ADMIN');
    expect(screen.getByText('غير مصرح')).toBeInTheDocument();
    expect(screen.queryByText('ALLOWED-CONTENT')).not.toBeInTheDocument();
  });

  it('blocks a regular USER from the user/role-management page', () => {
    renderRoute(true, 'USER');
    expect(screen.getByText('غير مصرح')).toBeInTheDocument();
  });
});