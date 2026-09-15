import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Header } from '@/components/Layout/Header/Header';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import type { AuthUser } from '@/pages/auth/authApi';

vi.mock('@/pages/tools/GeneralTools/Quran/HeaderQuranPlayer', () => ({
  HeaderQuranPlayer: () => null,
}));
vi.mock('@/components/Layout/OfflineIndicator', () => ({
  OfflineIndicator: () => null,
}));
vi.mock('@/components/Layout/Header/Notification/NotificationsPanel', () => ({
  NotificationsPanel: () => null,
}));
vi.mock('@/pages/connect/Avatar', () => ({
  Avatar: () => null,
}));

const adminUser: AuthUser = {
  id: 'u-admin',
  email: 'admin@example.com',
  username: 'admin_m',
  displayName: 'مدير النظام',
  role: 'ADMIN',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const regularUser: AuthUser = {
  id: 'u-user',
  email: 'user@example.com',
  username: 'user_m',
  displayName: 'مستخدم عادي',
  role: 'USER',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const subAdminUser: AuthUser = {
  id: 'u-subadmin',
  email: 'subadmin@example.com',
  username: 'subadmin_m',
  displayName: 'مشرف فرعي',
  role: 'SUB_ADMIN',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Header />} />
        <Route path="/admin/suggestions" element={<div>ADMIN-SUGGESTIONS-PAGE</div>} />
        <Route path="/connect/suggestions" element={<div>CONNECT-SUGGESTIONS-PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function openMenu(displayName: string) {
  fireEvent.click(screen.getByTitle(displayName));
}

describe('Header account menu suggestions entries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAuthStore.setState({ user: null, initialized: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({ user: null, initialized: true });
  });

  it('shows both the user and admin suggestions entries for an admin', () => {
    useAuthStore.setState({ user: adminUser });
    renderHeader();
    openMenu(adminUser.displayName);

    expect(screen.getByText('إدارة المستخدمين')).toBeInTheDocument();
    expect(screen.getAllByText('الاقتراحات')).toHaveLength(2);
  });

  it('navigates to /admin/suggestions when an admin clicks the admin suggestions entry', () => {
    useAuthStore.setState({ user: adminUser });
    renderHeader();
    openMenu(adminUser.displayName);

    const entries = screen.getAllByText('الاقتراحات');
    fireEvent.click(entries[entries.length - 1]);

    expect(screen.getByText('ADMIN-SUGGESTIONS-PAGE')).toBeInTheDocument();
  });

  it('does not show admin management entries for a regular user', () => {
    useAuthStore.setState({ user: regularUser });
    renderHeader();
    openMenu(regularUser.displayName);

    expect(screen.queryByText('إدارة المستخدمين')).not.toBeInTheDocument();
    const entries = screen.getAllByText('الاقتراحات');
    expect(entries).toHaveLength(1);
  });

  it('lets a regular user click the user suggestions entry', () => {
    useAuthStore.setState({ user: regularUser });
    renderHeader();
    openMenu(regularUser.displayName);

    fireEvent.click(screen.getByText('الاقتراحات'));

    expect(screen.getByText('CONNECT-SUGGESTIONS-PAGE')).toBeInTheDocument();
  });

  it('does not show any user menu entries when logged out', () => {
    renderHeader();

    expect(screen.queryByText('إدارة المستخدمين')).not.toBeInTheDocument();
    expect(screen.queryAllByText('الاقتراحات')).toHaveLength(0);
    expect(within(document.body).queryByText('مدير النظام')).not.toBeInTheDocument();
  });

  it('shows normal admin entries but not user-management for a SUB_ADMIN', () => {
    useAuthStore.setState({ user: subAdminUser });
    renderHeader();
    openMenu(subAdminUser.displayName);

    expect(screen.queryByText('إدارة المستخدمين')).not.toBeInTheDocument();
    expect(screen.getAllByText('الاقتراحات')).toHaveLength(2);
    expect(screen.getByText('مراجعة الأذكار')).toBeInTheDocument();
  });
});
