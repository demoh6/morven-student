import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listGroups: vi.fn(),
  createGroup: vi.fn(),
  joinGroup: vi.fn(),
}));
const cache = vi.hoisted(() => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));

vi.mock('@/services/groupApi', () => ({
  listGroups: api.listGroups,
  createGroup: api.createGroup,
  joinGroup: api.joinGroup,
}));
vi.mock('@/services/offlineCache', () => cache);

import GroupsPage from '@/pages/connect/Groups/GroupsPage';

beforeEach(() => {
  vi.clearAllMocks();
  cache.cacheSet.mockResolvedValue(undefined);
});

describe('GroupsPage — offline read fallback', () => {
  it('renders the cached groups when the network request fails', async () => {
    api.listGroups.mockRejectedValue(new TypeError('Failed to fetch'));
    cache.cacheGet.mockResolvedValue({
      value: [{ id: 'g1', name: 'Alpha Group', memberCount: 3 }],
      updatedAt: 1,
      expiresAt: null,
    });

    render(
      <MemoryRouter>
        <GroupsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    expect(cache.cacheGet).toHaveBeenCalledWith('groups:list', { allowStale: true });
  });

  it('caches the list after a successful load', async () => {
    api.listGroups.mockResolvedValue({ groups: [{ id: 'g1', name: 'Alpha Group', memberCount: 3 }] });

    render(
      <MemoryRouter>
        <GroupsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    expect(cache.cacheSet).toHaveBeenCalledWith('groups:list', [
      { id: 'g1', name: 'Alpha Group', memberCount: 3 },
    ]);
  });
});
