import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listGroups: vi.fn(),
  createGroup: vi.fn(),
  joinGroup: vi.fn(),
}));
const cache = vi.hoisted(() => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
const socket = vi.hoisted(() => ({
  connectSocket: vi.fn(),
  onGroupUpdate: vi.fn(),
}));

vi.mock('@/services/groupApi', () => ({
  listGroups: api.listGroups,
  createGroup: api.createGroup,
  joinGroup: api.joinGroup,
}));
vi.mock('@/services/offlineCache', () => cache);
vi.mock('@/services/socketService', () => socket);

import GroupsPage from '@/pages/connect/Groups/GroupsPage';

type GroupUpdateCb = (data: { groupId: string; group: { id: string } }) => void;

beforeEach(() => {
  vi.clearAllMocks();
  cache.cacheSet.mockResolvedValue(undefined);
  cache.cacheGet.mockResolvedValue(null);
  socket.connectSocket.mockReturnValue(undefined);
});

describe('GroupsPage — group update synchronization', () => {
  it('reloads the group list when a group-update socket event arrives', async () => {
    let updateCb: GroupUpdateCb | undefined;
    socket.onGroupUpdate.mockImplementation((cb: GroupUpdateCb) => {
      updateCb = cb;
    });

    api.listGroups
      .mockResolvedValueOnce({ groups: [{ id: 'g1', name: 'Alpha Group', memberCount: 1 }] })
      .mockResolvedValue({ groups: [{ id: 'g1', name: 'Alpha Group Renamed', memberCount: 1 }] });

    render(
      <MemoryRouter>
        <GroupsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    await waitFor(() => expect(socket.onGroupUpdate).toHaveBeenCalled());
    expect(api.listGroups).toHaveBeenCalledTimes(1);

    await act(async () => {
      updateCb?.({ groupId: 'g1', group: { id: 'g1' } });
    });

    await waitFor(() => expect(api.listGroups).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Alpha Group Renamed')).toBeTruthy();
  });
});
