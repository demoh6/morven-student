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

const twoMemberGroup = {
  ...group,
  members: [
    { id: 'me', username: 'me', displayName: 'Me', avatarUrl: null, role: 'OWNER' },
    { id: 'peer', username: 'peer', displayName: 'Peer', avatarUrl: null, role: 'MEMBER' },
  ],
};

const WEEK_START = '2026-09-04T21:00:00.000Z';
const WEEK_END = '2026-09-11T20:59:59.000Z';

function weeklyResponse(
  ranking: Array<{ userId: string; weeklySeconds: number; dailySeconds?: number }>,
) {
  return {
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    dayStart: '2026-09-08T21:00:00.000Z',
    nextDayStart: '2026-09-09T21:00:00.000Z',
    ranking: ranking.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      username: r.userId,
      displayName: r.userId === 'me' ? 'Me' : 'Peer',
      avatarUrl: null,
      weeklySeconds: r.weeklySeconds,
      dailySeconds: r.dailySeconds ?? 0,
    })),
  };
}

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
  api.getWeeklyGroupRanking.mockResolvedValue(weeklyResponse([]));
});

describe('GroupDetailPage — offline behavior', () => {
  it('renders the cached group (and weekly ranking) when the network request fails', async () => {
    api.getGroupDetails.mockRejectedValue(new TypeError('Failed to fetch'));
    api.getWeeklyGroupRanking.mockRejectedValue(new TypeError('Failed to fetch'));
    // Offline with no access token: joining the socket room throws.
    socket.joinGroup.mockImplementation(() => {
      throw new Error('No access token');
    });
    cache.cacheGet.mockImplementation(async (key: string) => {
      if (key === 'groups:detail:g1') return { value: group, updatedAt: 1, expiresAt: null };
      if (key === 'groups:detail:g1:weekly') {
        return { value: weeklyResponse([{ userId: 'me', weeklySeconds: 3600 }]).ranking, updatedAt: 1, expiresAt: null };
      }
      return null;
    });

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    expect(cache.cacheGet).toHaveBeenCalledWith('groups:detail:g1', { allowStale: true });
    expect(cache.cacheGet).toHaveBeenCalledWith('groups:detail:g1:weekly', {
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

  it('caches the group details and weekly ranking after a successful load', async () => {
    api.getGroupDetails.mockResolvedValue({ group });
    const response = weeklyResponse([{ userId: 'me', weeklySeconds: 3600 }]);
    api.getWeeklyGroupRanking.mockResolvedValue(response);

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    expect(cache.cacheSet).toHaveBeenCalledWith('groups:detail:g1', group);
    await waitFor(() =>
      expect(cache.cacheSet).toHaveBeenCalledWith('groups:detail:g1:weekly', response.ranking),
    );
  });
});

describe('GroupDetailPage — weekly group study hours', () => {
  it('displays the current week and today hours ranked by weekly totals', async () => {
    api.getGroupDetails.mockResolvedValue({ group: twoMemberGroup });
    api.getWeeklyGroupRanking.mockResolvedValue(
      weeklyResponse([
        { userId: 'peer', weeklySeconds: 7200, dailySeconds: 3600 },
        { userId: 'me', weeklySeconds: 3600, dailySeconds: 1800 },
      ]),
    );

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    expect(api.getWeeklyGroupRanking).toHaveBeenCalledWith('g1');

    // Weekly badges reflect WEEKLY seconds; daily badges reflect DAILY seconds.
    // (Members are ordered by weekly total: peer first, then me.)
    const weeklyBadges = await screen.findAllByTitle('ساعات التركيز هذا الأسبوع');
    expect(weeklyBadges[0]).toHaveTextContent('هذا الأسبوع: 2س');
    expect(weeklyBadges[1]).toHaveTextContent('هذا الأسبوع: 1س');
    const dailyBadges = screen.getAllByTitle('ساعات التركيز هذا اليوم');
    expect(dailyBadges[0]).toHaveTextContent('هذا اليوم: 1س');
    expect(dailyBadges[1]).toHaveTextContent('هذا اليوم: 30د');

    // Highest weekly total is ranked first (appears earlier in the DOM).
    const peer = screen.getByText('Peer');
    const me = screen.getByText('Me');
    expect(peer.compareDocumentPosition(me) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows zero hours for every member at the start of a new week (Saturday reset)', async () => {
    api.getGroupDetails.mockResolvedValue({ group: twoMemberGroup });
    api.getWeeklyGroupRanking.mockResolvedValue(
      weeklyResponse([
        { userId: 'me', weeklySeconds: 0, dailySeconds: 0 },
        { userId: 'peer', weeklySeconds: 0, dailySeconds: 0 },
      ]),
    );

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    const zeroWeekly = await screen.findAllByTitle('ساعات التركيز هذا الأسبوع');
    expect(zeroWeekly).toHaveLength(2);
    zeroWeekly.forEach((badge) => expect(badge).toHaveTextContent('هذا الأسبوع: 0د'));
  });

  it('refreshes the weekly ranking when a leaderboard socket event arrives', async () => {
    let leaderboardCb: ((data: { groupId: string; leaderboard: unknown[] }) => void) | undefined;
    socket.onLeaderboard.mockImplementation((cb: typeof leaderboardCb) => {
      leaderboardCb = cb;
    });
    api.getGroupDetails.mockResolvedValue({ group: twoMemberGroup });
    api.getWeeklyGroupRanking.mockResolvedValueOnce(
      weeklyResponse([
        { userId: 'me', weeklySeconds: 0 },
        { userId: 'peer', weeklySeconds: 0 },
      ]),
    );

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    await waitFor(() => expect(api.getWeeklyGroupRanking).toHaveBeenCalledTimes(1));

    // A session is submitted: the socket broadcast triggers a weekly refetch.
    api.getWeeklyGroupRanking.mockResolvedValueOnce(
      weeklyResponse([
        { userId: 'me', weeklySeconds: 7200, dailySeconds: 7200 },
        { userId: 'peer', weeklySeconds: 0 },
      ]),
    );
    await act(async () => {
      leaderboardCb?.({ groupId: 'g1', leaderboard: [] });
    });

    await waitFor(() => expect(api.getWeeklyGroupRanking).toHaveBeenCalledTimes(2));
    const refreshed = screen.getAllByTitle('ساعات التركيز هذا الأسبوع');
    expect(refreshed[0]).toHaveTextContent('هذا الأسبوع: 2س');
  });
});

describe('GroupDetailPage — automatic daily rollover', () => {
  it('refreshes the today line at local midnight while idle (no socket event, no navigation)', async () => {
    api.getGroupDetails.mockResolvedValue({ group });
    const now = Date.now();
    api.getWeeklyGroupRanking
      .mockResolvedValueOnce({
        ...weeklyResponse([{ userId: 'me', weeklySeconds: 3600, dailySeconds: 3600 }]),
        dayStart: new Date(now - 3600_000).toISOString(),
        // Boundary a moment away: the page must roll over on its own.
        nextDayStart: new Date(now + 500).toISOString(),
      })
      .mockResolvedValueOnce({
        ...weeklyResponse([{ userId: 'me', weeklySeconds: 3600, dailySeconds: 0 }]),
        dayStart: new Date(now + 86_400_000).toISOString(),
        nextDayStart: new Date(now + 86_400_500).toISOString(),
      });

    renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    expect(await screen.findByTitle('ساعات التركيز هذا اليوم')).toHaveTextContent('هذا اليوم: 1س');

    // Only the scheduled timer triggers the second fetch.
    await waitFor(() => expect(api.getWeeklyGroupRanking).toHaveBeenCalledTimes(2), {
      timeout: 6000,
    });
    await waitFor(() =>
      expect(screen.getByTitle('ساعات التركيز هذا اليوم')).toHaveTextContent('هذا اليوم: 0د'),
    );
    // Weekly total is untouched by the daily rollover.
    expect(screen.getByTitle('ساعات التركيز هذا الأسبوع')).toHaveTextContent('هذا الأسبوع: 1س');
  });

  it('clears the rollover timer on unmount', async () => {
    api.getGroupDetails.mockResolvedValue({ group });
    const now = Date.now();
    api.getWeeklyGroupRanking.mockResolvedValue({
      ...weeklyResponse([{ userId: 'me', weeklySeconds: 3600, dailySeconds: 3600 }]),
      dayStart: new Date(now - 3600_000).toISOString(),
      nextDayStart: new Date(now + 500).toISOString(),
    });

    const view = renderPage();

    expect(await screen.findByText('Alpha Group')).toBeTruthy();
    await waitFor(() => expect(api.getWeeklyGroupRanking).toHaveBeenCalledTimes(1));

    view.unmount();
    // Wait past the scheduled fire instant; a cleared timer must not refetch.
    await new Promise((resolve) => setTimeout(resolve, 3200));
    expect(api.getWeeklyGroupRanking).toHaveBeenCalledTimes(1);
  });
});
