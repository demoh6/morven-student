import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getGroupDetails: vi.fn(),
  getWeeklyGroupRanking: vi.fn(),
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
  onGroupUpdate: vi.fn(),
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

type GroupUpdateCb = (data: { groupId: string; group: { id: string; name: string; description: string | null; imageUrl?: string | null } }) => void;

const baseGroup = {
  id: 'g1',
  name: 'Alpha Group',
  description: 'desc',
  imageUrl: null,
  joinCode: 'ABC123',
  role: 'OWNER',
  isMember: true,
  members: [{ id: 'me', username: 'me', displayName: 'Me', avatarUrl: null, role: 'OWNER' }],
};

const updatedGroup = { ...baseGroup, name: 'Alpha Group Renamed', imageUrl: '/uploads/new.png' };

const weeklyResponse = { weekStart: '', weekEnd: '', ranking: [] };

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
  api.getWeeklyGroupRanking.mockResolvedValue(weeklyResponse);
});

describe('GroupDetailPage — group update synchronization', () => {
  it('refetches the group when a group-update socket event arrives for this group', async () => {
    let updateCb: GroupUpdateCb | undefined;
    socket.onGroupUpdate.mockImplementation((cb: GroupUpdateCb) => {
      updateCb = cb;
    });

    api.getGroupDetails.mockResolvedValueOnce({ group: baseGroup }).mockResolvedValue({ group: updatedGroup });

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    await waitFor(() => expect(socket.onGroupUpdate).toHaveBeenCalled());
    expect(api.getGroupDetails).toHaveBeenCalledTimes(1);

    api.getGroupDetails.mockResolvedValue({ group: updatedGroup });
    await act(async () => {
      updateCb?.({ groupId: 'g1', group: { id: 'g1', name: 'Alpha Group Renamed', description: 'desc', imageUrl: '/uploads/new.png' } });
    });

    await waitFor(() => expect(api.getGroupDetails).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Alpha Group Renamed')).toBeTruthy();
    expect(cache.cacheSet).toHaveBeenCalledWith('groups:detail:g1', updatedGroup);
  });

  it('ignores a group-update socket event for a different group', async () => {
    let updateCb: GroupUpdateCb | undefined;
    socket.onGroupUpdate.mockImplementation((cb: GroupUpdateCb) => {
      updateCb = cb;
    });

    api.getGroupDetails.mockResolvedValue({ group: baseGroup });

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    await waitFor(() => expect(socket.onGroupUpdate).toHaveBeenCalled());
    expect(api.getGroupDetails).toHaveBeenCalledTimes(1);

    await act(async () => {
      updateCb?.({ groupId: 'other-group', group: { id: 'other-group', name: 'Other', description: null, imageUrl: null } });
    });

    // No refetch for an unrelated group.
    expect(api.getGroupDetails).toHaveBeenCalledTimes(1);
  });
});
