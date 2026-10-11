import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getGroupDetails: vi.fn(),
  getGroupLeaderboard: vi.fn(),
  leaveGroup: vi.fn(),
  deleteGroup: vi.fn(),
  removeMember: vi.fn(),
  updateGroup: vi.fn(),
}));
const cache = vi.hoisted(() => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
const socket = vi.hoisted(() => ({
  connectSocket: vi.fn(),
  joinGroup: vi.fn(),
  leaveGroup: vi.fn(),
  onPresence: vi.fn(),
  onLeaderboard: vi.fn(),
  onFocusing: vi.fn(),
}));
const pomodoro = vi.hoisted(() => ({ setActiveGroupId: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id: 'me', role: 'USER' } }));

vi.mock('@/services/groupApi', () => api);
vi.mock('@/services/offlineCache', () => cache);
vi.mock('@/services/socketService', () => socket);
vi.mock('@/pages/tools/GeneralTools/Pomodoro/connectPomodoro', () => ({
  setActiveGroupId: pomodoro.setActiveGroupId,
}));
vi.mock('@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore', () => ({
  usePomodoroStore: (selector: (s: { isRunning: boolean; mode: string }) => unknown) =>
    selector({ isRunning: false, mode: 'focus' }),
}));
vi.mock('@/pages/auth/useAuthStore', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) =>
    selector ? selector({ user: auth.user }) : { user: auth.user },
}));

import GroupDetailPage from '@/pages/connect/Groups/GroupDetailPage';
import { OFFLINE_GROUP_DETAIL_MESSAGE, NETWORK_ERROR_MESSAGE } from '@/services/apiError';

const group = {
  id: 'g1',
  name: 'Alpha Group',
  description: 'مجموعة الاختبار',
  imageUrl: null,
  joinCode: 'ABC123',
  role: 'OWNER',
  isMember: true,
  members: [{ id: 'me', username: 'me', displayName: 'Me', avatarUrl: null, role: 'OWNER' }],
};

const leaderboard = [{ userId: 'me', totalSeconds: 3600 }];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/connect/groups/g1']}>
      <Routes>
        <Route path="/connect/groups/:groupId" element={<GroupDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cache.cacheSet.mockResolvedValue(undefined);
  cache.cacheGet.mockResolvedValue(null);
  socket.connectSocket.mockReturnValue(undefined);
  socket.joinGroup.mockImplementation(() => {});
  api.getGroupLeaderboard.mockResolvedValue({ leaderboard: [] });
});

describe('GroupDetailPage — offline behavior', () => {
  it('renders the cached group (and leaderboard) when the network request fails', async () => {
    api.getGroupDetails.mockRejectedValue(new TypeError('Failed to fetch'));
    api.getGroupLeaderboard.mockRejectedValue(new TypeError('Failed to fetch'));
    // Offline with no access token: joining the socket room throws.
    socket.joinGroup.mockImplementation(() => {
      throw new Error('No access token');
    });
    cache.cacheGet.mockImplementation(async (key: string) => {
      if (key === 'groups:detail:g1') return { value: group, updatedAt: 1, expiresAt: null };
      if (key === 'groups:detail:g1:leaderboard') {
        return { value: leaderboard, updatedAt: 1, expiresAt: null };
      }
      return null;
    });

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    expect(cache.cacheGet).toHaveBeenCalledWith('groups:detail:g1', { allowStale: true });
    expect(cache.cacheGet).toHaveBeenCalledWith('groups:detail:g1:leaderboard', {
      allowStale: true,
    });
    expect(screen.queryByText(NETWORK_ERROR_MESSAGE)).toBeNull();
    expect(screen.queryByText(OFFLINE_GROUP_DETAIL_MESSAGE)).toBeNull();
  });

  it('shows a clear Arabic offline message for a group that was never cached', async () => {
    api.getGroupDetails.mockRejectedValue(new TypeError('Failed to fetch'));
    socket.joinGroup.mockImplementation(() => {
      throw new Error('No access token');
    });
    cache.cacheGet.mockResolvedValue(null);

    renderPage();

    expect(await screen.findByText(OFFLINE_GROUP_DETAIL_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });

  it('keeps working when the socket cannot connect offline', async () => {
    api.getGroupDetails.mockResolvedValue({ group });
    socket.connectSocket.mockImplementation(() => {
      throw new Error('No access token');
    });
    socket.joinGroup.mockImplementation(() => {
      throw new Error('No access token');
    });

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
  });

  it('caches the group details and leaderboard after a successful load', async () => {
    api.getGroupDetails.mockResolvedValue({ group });
    api.getGroupLeaderboard.mockResolvedValue({ leaderboard });

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    expect(cache.cacheSet).toHaveBeenCalledWith('groups:detail:g1', group);
    await waitFor(() =>
      expect(cache.cacheSet).toHaveBeenCalledWith('groups:detail:g1:leaderboard', leaderboard),
    );
  });
});
