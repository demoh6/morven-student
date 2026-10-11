import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getResources: vi.fn(),
  getResource: vi.fn(),
  createResourceApi: vi.fn(),
  updateResourceApi: vi.fn(),
  deleteResourceApi: vi.fn(),
  accessResourceApi: vi.fn(),
  accessResourceByCodeApi: vi.fn(),
  uploadResourceFiles: vi.fn(),
  deleteResourceFileApi: vi.fn(),
  downloadResourceFile: vi.fn(),
  addResourceNoteApi: vi.fn(),
  deleteResourceNoteApi: vi.fn(),
  addResourceLinkApi: vi.fn(),
  deleteResourceLinkApi: vi.fn(),
}));

const cache = vi.hoisted(() => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));

vi.mock('@/pages/connect/Resources/resourceApi', () => api);
vi.mock('@/services/offlineCache', () => cache);

import { useResourcesStore } from '@/pages/connect/Resources/useResourcesStore';
import type { Resource } from '@/pages/connect/Resources/resources';
import { NETWORK_ERROR_MESSAGE } from '@/services/apiError';

const listResource = { id: 'r1', title: 'Doc', type: 'DOCUMENT' } as unknown as Resource;

beforeEach(() => {
  vi.clearAllMocks();
  cache.cacheSet.mockResolvedValue(undefined);
  useResourcesStore.setState({
    resources: [],
    contentMap: {},
    loading: false,
    error: null,
    lockedResourceId: null,
  });
});

describe('useResourcesStore — offline read fallback', () => {
  it('falls back to the cached list when the network request fails', async () => {
    api.getResources.mockRejectedValue(new TypeError('Failed to fetch'));
    cache.cacheGet.mockResolvedValue({ value: [listResource], updatedAt: 1, expiresAt: null });

    await useResourcesStore.getState().fetchResources();

    expect(useResourcesStore.getState().resources).toEqual([listResource]);
    expect(useResourcesStore.getState().error).toBeNull();
    expect(cache.cacheGet).toHaveBeenCalledWith('resources:list', { allowStale: true });
  });

  it('surfaces the error when there is no cached list', async () => {
    api.getResources.mockRejectedValue(new TypeError('Failed to fetch'));
    cache.cacheGet.mockResolvedValue(null);

    await useResourcesStore.getState().fetchResources();

    expect(useResourcesStore.getState().resources).toEqual([]);
    expect(useResourcesStore.getState().error).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('caches the list after a successful fetch', async () => {
    api.getResources.mockResolvedValue([listResource]);

    await useResourcesStore.getState().fetchResources();

    expect(cache.cacheSet).toHaveBeenCalledWith('resources:list', [listResource]);
  });

  it('falls back to the cached detail when the network request fails', async () => {
    const detail = {
      id: 'r1',
      title: 'Doc',
      type: 'DOCUMENT',
      files: [],
      notes: [],
      links: [],
    };
    api.getResource.mockRejectedValue(new TypeError('Failed to fetch'));
    cache.cacheGet.mockResolvedValue({ value: detail, updatedAt: 1, expiresAt: null });

    const result = await useResourcesStore.getState().fetchResourceDetail('r1');

    expect(result).toMatchObject({ id: 'r1' });
    expect(useResourcesStore.getState().contentMap.r1).toEqual({ files: [], notes: [], links: [] });
    expect(cache.cacheGet).toHaveBeenCalledWith('resources:detail:r1', { allowStale: true });
  });
});
