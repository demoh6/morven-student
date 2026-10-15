import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GroupDetailMobile } from './GroupDetailMobile';
import type { GroupDetails } from '@/services/groupApi';

const baseGroup: GroupDetails = {
  id: 'g1',
  name: 'Alpha Group',
  description: 'مجموعة الاختبار',
  imageUrl: null,
  joinCode: 'ABC123',
  creatorId: 'me',
  createdAt: '',
  updatedAt: '',
  role: 'OWNER',
  isMember: true,
  members: [
    { id: 'me', username: 'me', displayName: 'Me', avatarUrl: null, role: 'OWNER', joinedAt: '' },
    { id: 'peer', username: 'peer', displayName: 'Peer', avatarUrl: null, role: 'MEMBER', joinedAt: '' },
  ],
};

const noop = () => {};

function renderMobile(props: Partial<Parameters<typeof GroupDetailMobile>[0]> = {}) {
  return render(
    <MemoryRouter>
      <GroupDetailMobile
        group={baseGroup}
        members={baseGroup.members}
        focusMap={new Map()}
        focusingIds={new Set()}
        myId="me"
        isOwner
        isGroupAdmin={false}
        canEdit
        canLeave
        canDelete={false}
        copiedCode={false}
        onCopyCode={noop}
        onEdit={noop}
        onLeave={noop}
        onDelete={noop}
        onRemoveMember={noop}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('GroupDetailMobile', () => {
  it('renders the compact header with name, description, member count and join code', () => {
    renderMobile();
    expect(screen.getByRole('heading', { name: 'Alpha Group' })).toBeInTheDocument();
    expect(screen.getByText('مجموعة الاختبار')).toBeInTheDocument();
    expect(screen.getByText('2 طلاب')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    // The descriptive label is hidden; only the code is shown. The copy control
    // keeps its accessible name via aria-label.
    expect(screen.queryByText('رمز الانضمام')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'نسخ رمز الانضمام' })).toBeInTheDocument();
    // RTL root is preserved.
    expect(screen.getByText('Alpha Group').closest('[dir="rtl"]')).not.toBeNull();
  });

  it('places the management actions as icon-only controls on the name line', () => {
    renderMobile();
    expect(screen.getByRole('button', { name: 'تعديل المجموعة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مغادرة المجموعة' })).toBeInTheDocument();
    // Not an owner-only deletion in this case.
    expect(screen.queryByRole('button', { name: 'حذف المجموعة' })).not.toBeInTheDocument();
  });

  it('only shows actions the current user is allowed to perform', () => {
    renderMobile({ canEdit: false, canLeave: false, canDelete: true });
    expect(screen.queryByRole('button', { name: 'تعديل المجموعة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'مغادرة المجموعة' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف المجموعة' })).toBeInTheDocument();
  });

  it('renders each member row with weekly + daily stats and the active-focus indicator', () => {
    renderMobile({
      // Real callers pass members already sorted by the weekly ranking.
      members: [baseGroup.members[1], baseGroup.members[0]],
      focusMap: new Map([
        ['peer', { weekly: 7200, daily: 3600 }],
        ['me', { weekly: 3600, daily: 1800 }],
      ]),
      focusingIds: new Set(['peer']),
      isGroupAdmin: true,
    });

    const weekly = screen.getAllByTitle('ساعات التركيز هذا الأسبوع');
    expect(weekly).toHaveLength(2);
    expect(weekly[0]).toHaveTextContent('هذا الأسبوع: 2س');
    expect(weekly[1]).toHaveTextContent('هذا الأسبوع: 1س');

    const daily = screen.getAllByTitle('ساعات التركيز هذا اليوم');
    expect(daily[0]).toHaveTextContent('هذا اليوم: 1س');
    expect(daily[1]).toHaveTextContent('هذا اليوم: 30د');

    expect(screen.getByText('جارٍ التركيز...')).toBeInTheDocument();
    // Admin can remove the other member but never themselves.
    expect(screen.getAllByRole('button', { name: 'إزالة العضو' })).toHaveLength(1);
  });

  it('pins the weekly/daily stats to a vertical column on the far-left end of the row', () => {
    renderMobile({
      members: [baseGroup.members[1], baseGroup.members[0]],
      focusMap: new Map([
        ['peer', { weekly: 7200, daily: 3600 }],
        ['me', { weekly: 3600, daily: 1800 }],
      ]),
      focusingIds: new Set(['peer']),
    });

    const name = screen.getByText('Peer');
    const weekly = screen.getAllByTitle('ساعات التركيز هذا الأسبوع')[0];
    const daily = screen.getAllByTitle('ساعات التركيز هذا اليوم')[0];

    // Weekly renders above daily (earlier in the DOM within the same column).
    expect(weekly.compareDocumentPosition(daily) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The stats column renders AFTER the name/avatar, i.e. on the LEFT in RTL.
    expect(name.compareDocumentPosition(weekly) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The active-focus indicator stays under the name on the right, before the stats.
    const focus = screen.getByText('جارٍ التركيز...');
    expect(focus.compareDocumentPosition(weekly) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not render the removed group weekly/today summary above the list', () => {
    renderMobile({
      focusMap: new Map([
        ['peer', { weekly: 7200, daily: 3600 }],
        ['me', { weekly: 3600, daily: 1800 }],
      ]),
    });
    // The summary used standalone labels; per-member chips render "هذا الأسبوع: X".
    expect(screen.queryByText('هذا الأسبوع')).not.toBeInTheDocument();
    expect(screen.queryByText('هذا اليوم')).not.toBeInTheDocument();
    // Per-member statistics are still present and unchanged.
    expect(screen.getAllByTitle('ساعات التركيز هذا الأسبوع')).toHaveLength(2);
    expect(screen.getAllByTitle('ساعات التركيز هذا اليوم')).toHaveLength(2);
  });

  it('does not render a student count next to the "الطلاب" heading', () => {
    renderMobile({ members: [baseGroup.members[0], baseGroup.members[1]] });
    const heading = screen.getByRole('heading', { name: 'الطلاب' });
    expect(heading).toBeInTheDocument();
    // The removed count lived in a flex wrapper beside the heading; the heading
    // is now a direct child of the members section on its own.
    expect(heading.parentElement?.tagName).toBe('SECTION');
    // The group-level member count below the group name is untouched.
    expect(screen.getByText('2 طلاب')).toBeInTheDocument();
  });

  it('shows an empty state when the group has no members', () => {
    renderMobile({ members: [] });
    expect(screen.getByText('لا يوجد طلاب بعد')).toBeInTheDocument();
  });

  it('does not clip long names (wraps within its column)', () => {
    const longName = 'اسم طالب طويل جداً جداً يجب أن يلتف بدون أن يكسر التصميم';
    renderMobile({
      members: [{ ...baseGroup.members[1], displayName: longName }],
    });
    const link = screen.getByText(longName);
    expect(link.className).toContain('break-words');
  });
});

// ---------------------------------------------------------------------------
// Page-level wiring: below 640px the page renders the mobile component.
// ---------------------------------------------------------------------------

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
vi.mock('@/pages/auth/useAuthStore', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) =>
    selector ? selector({ user: auth.user }) : { user: auth.user },
}));

import GroupDetailPage from './GroupDetailPage';

describe('GroupDetailPage — phone-only layout isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.cacheSet.mockResolvedValue(undefined);
    cache.cacheGet.mockResolvedValue(null);
    socket.connectSocket.mockReturnValue(undefined);
    socket.joinGroup.mockImplementation(() => {});
    api.getGroupDetails.mockResolvedValue({ group: baseGroup });
    api.getWeeklyGroupRanking.mockResolvedValue({
      weekStart: '',
      weekEnd: '',
      dayStart: '',
      nextDayStart: '',
      ranking: [
        { rank: 1, userId: 'peer', username: 'peer', displayName: 'Peer', avatarUrl: null, weeklySeconds: 7200, dailySeconds: 3600 },
        { rank: 2, userId: 'me', username: 'me', displayName: 'Me', avatarUrl: null, weeklySeconds: 3600, dailySeconds: 1800 },
      ],
    });
  });

  function stubViewport(isPhone: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: isPhone && query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
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

  it('renders the mobile component on phone viewports', async () => {
    stubViewport(true);
    const { container } = renderPage();
    expect(await screen.findByText('Alpha Group')).toBeInTheDocument();
    // The phone layout uses GroupDetailMobile's root wrapper; the desktop root
    // (max-w-2xl) must not be present.
    expect(container.querySelector('[class*="pb-10"]')).not.toBeNull();
    expect(container.querySelector('[class*="max-w-2xl"]')).toBeNull();
  });

  it('keeps the desktop tree untouched on wider viewports', async () => {
    stubViewport(false);
    const { container } = renderPage();
    expect(await screen.findByText('Alpha Group')).toBeInTheDocument();
    // The desktop root wrapper is present; the phone layout's is not.
    expect(container.querySelector('[class*="max-w-2xl"]')).not.toBeNull();
    expect(container.querySelector('[class*="pb-10"]')).toBeNull();
    // Regression: the hero shows a single set of management actions (the far-left
    // corner), not the accidental duplicate that used to sit in the middle.
    expect(screen.getAllByRole('button', { name: 'تعديل المجموعة' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'مغادرة المجموعة' })).toHaveLength(1);
    // The join code matches the mobile presentation: no "رمز الانضمام" label,
    // just the code with its copy control, sitting beside the student count.
    expect(screen.queryByText('رمز الانضمام')).toBeNull();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    const copyControl = screen.getByRole('button', { name: 'نسخ رمز الانضمام' });
    expect(copyControl).toBeInTheDocument();
    expect(screen.getByText('2 طلاب').closest('div')).toContainElement(copyControl);
  });

  // Regression: the dialogs used to be rendered only in the desktop return, so
  // on phones their state toggled but nothing appeared until the viewport was
  // widened. They must render on the phone layout itself.
  it('opens the Edit dialog on phones when the edit button is clicked', async () => {
    stubViewport(true);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل المجموعة' }));
    expect(await screen.findByRole('dialog', { name: 'تعديل المجموعة' })).toBeInTheDocument();
  });

  it('opens the Leave dialog on phones when the leave button is clicked', async () => {
    stubViewport(true);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'مغادرة المجموعة' }));
    expect(await screen.findByRole('dialog', { name: 'مغادرة المجموعة' })).toBeInTheDocument();
  });

  it('opens the Delete dialog on phones when the group is deletable', async () => {
    // A sole-owner group is deletable (canDelete = isOwner && members.length === 1).
    api.getGroupDetails.mockResolvedValue({ group: { ...baseGroup, members: [baseGroup.members[0]] } });
    stubViewport(true);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'حذف المجموعة' }));
    expect(await screen.findByRole('dialog', { name: 'حذف المجموعة' })).toBeInTheDocument();
  });
});
