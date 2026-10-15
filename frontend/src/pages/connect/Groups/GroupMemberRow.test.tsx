import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GroupMemberRow, formatFocusDuration } from './GroupMemberRow';

const baseMember = {
  id: 'u1',
  username: 'ahmed_m',
  displayName: 'محمد',
  avatarUrl: null,
  role: 'MEMBER',
};

function renderRow(props: Partial<Parameters<typeof GroupMemberRow>[0]> = {}) {
  return render(
    <MemoryRouter>
      <GroupMemberRow
        member={baseMember}
        rank={1}
        weeklySeconds={0}
        dailySeconds={0}
        focusing={false}
        isSelf={false}
        canRemove={false}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('formatFocusDuration', () => {
  it('hides the hours portion when hours are zero', () => {
    expect(formatFocusDuration(0)).toBe('0د');
    expect(formatFocusDuration(600)).toBe('10د'); // 0h10m
    expect(formatFocusDuration(2700)).toBe('45د'); // 0h45m
  });

  it('hides the minutes portion when minutes are zero and hours > 0', () => {
    expect(formatFocusDuration(3600)).toBe('1س'); // 1h0m
    expect(formatFocusDuration(36000)).toBe('10س'); // 10h0m
  });

  it('shows both portions when hours and minutes are non-zero', () => {
    expect(formatFocusDuration(4200)).toBe('1س 10د'); // 1h10m
    expect(formatFocusDuration(36600)).toBe('10س 10د'); // 10h10m
    expect(formatFocusDuration(10200)).toBe('2س 50د'); // 2h50m
  });

  it('drops sub-minute seconds and guards invalid values', () => {
    expect(formatFocusDuration(2705)).toBe('45د');
    expect(formatFocusDuration(-100)).toBe('0د');
    expect(formatFocusDuration(Number.NaN)).toBe('0د');
  });
});

describe('GroupMemberRow', () => {
  it('always shows both focus-time lines, including zeros', () => {
    renderRow({ weeklySeconds: 0, dailySeconds: 0 });
    expect(screen.getByTitle('ساعات التركيز هذا الأسبوع')).toHaveTextContent('هذا الأسبوع: 0د');
    expect(screen.getByTitle('ساعات التركيز هذا اليوم')).toHaveTextContent('هذا اليوم: 0د');
  });

  it('shows distinct weekly and daily totals', () => {
    renderRow({ weeklySeconds: 10200, dailySeconds: 4200 }); // 2h50m / 1h10m
    expect(screen.getByTitle('ساعات التركيز هذا الأسبوع')).toHaveTextContent('هذا الأسبوع: 2س 50د');
    expect(screen.getByTitle('ساعات التركيز هذا اليوم')).toHaveTextContent('هذا اليوم: 1س 10د');
  });

  it('shows the focusing status under the name only when the member is focusing', () => {
    const { unmount } = renderRow({ focusing: false });
    expect(screen.queryByText('جارٍ التركيز...')).not.toBeInTheDocument();
    unmount();

    renderRow({ focusing: true });
    expect(screen.getByText('جارٍ التركيز...')).toBeInTheDocument();
  });

  it('renders the focusing status under the name, before the focus-time badges', () => {
    renderRow({ focusing: true, weeklySeconds: 10800 }); // 3h
    const status = screen.getByText('جارٍ التركيز...');
    const name = screen.getByText('محمد');
    const weekly = screen.getByTitle('ساعات التركيز هذا الأسبوع');
    // Status appears after the name but before the focus-time badges.
    expect(name.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(status.compareDocumentPosition(weekly) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('stacks the weekly line above the daily line', () => {
    renderRow({ weeklySeconds: 7200, dailySeconds: 3600 });
    const weekly = screen.getByTitle('ساعات التركيز هذا الأسبوع');
    const daily = screen.getByTitle('ساعات التركيز هذا اليوم');
    expect(weekly.compareDocumentPosition(daily) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('places the Remove action on the right side next to the name (before the badges)', () => {
    renderRow({ focusing: true, weeklySeconds: 10800, canRemove: true, onRemove: () => {} });
    const removeBtn = screen.getByRole('button', { name: 'إزالة العضو' });
    const weekly = screen.getByTitle('ساعات التركيز هذا الأسبوع');
    expect(removeBtn.compareDocumentPosition(weekly) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders NO standalone online/offline indicator for a non-focusing member', () => {
    renderRow({ focusing: false });
    expect(screen.getByTitle('ساعات التركيز هذا الأسبوع')).toHaveTextContent('هذا الأسبوع: 0د');
    expect(screen.queryByText('متصل')).not.toBeInTheDocument();
    expect(screen.queryByText('غير متصل')).not.toBeInTheDocument();
  });

  it('shows the crown only for the OWNER', () => {
    const { unmount } = renderRow({ member: { ...baseMember, role: 'OWNER' } });
    expect(screen.getByLabelText('المنشئ')).toBeInTheDocument();
    unmount();

    renderRow({ member: { ...baseMember, role: 'MEMBER' } });
    expect(screen.queryByLabelText('المنشئ')).not.toBeInTheDocument();
  });

  it('shows the remove action only when authorized', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { unmount } = renderRow({ canRemove: true, onRemove });

    const removeBtn = screen.getByRole('button', { name: 'إزالة العضو' });
    expect(removeBtn).toBeInTheDocument();
    await user.click(removeBtn);
    expect(onRemove).toHaveBeenCalledTimes(1);
    unmount();

    renderRow({ canRemove: false });
    expect(screen.queryByRole('button', { name: 'إزالة العضو' })).not.toBeInTheDocument();
  });

  it('shows a unified GOLD trophy/cup icon (no circular badge) for 1st place', () => {
    renderRow({ rank: 1 });
    const badge = screen.getByLabelText('المركز الأول');
    expect(badge).toBeInTheDocument();
    expect(screen.queryByLabelText('المركز الثاني')).not.toBeInTheDocument();
    expect(badge.className).not.toMatch(/rounded-full/);
    expect(badge.className).not.toMatch(/\bbg-/);
  });

  it('shows a SILVER trophy/cup icon for 2nd place', () => {
    renderRow({ rank: 2 });
    const badge = screen.getByLabelText('المركز الثاني');
    expect(badge).toBeInTheDocument();
    expect(badge.className).not.toMatch(/rounded-full/);
    expect(badge.className).not.toMatch(/\bbg-/);
  });

  it('shows a BRONZE trophy/cup icon for 3rd place', () => {
    renderRow({ rank: 3 });
    const badge = screen.getByLabelText('المركز الثالث');
    expect(badge).toBeInTheDocument();
    expect(badge.className).not.toMatch(/rounded-full/);
    expect(badge.className).not.toMatch(/\bbg-/);
  });

  it('shows a plain number badge from 4th place onward', () => {
    const { unmount } = renderRow({ rank: 4 });
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByLabelText('المركز الأول')).not.toBeInTheDocument();
    unmount();

    renderRow({ rank: 8 });
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('places the rank badge on the RIGHT side of the picture, picture on the RIGHT of the name', () => {
    renderRow({ rank: 3, member: { ...baseMember, avatarUrl: 'avatar.png' } });
    const avatar = screen.getByAltText('محمد');
    const rankBadge = screen.getByLabelText('المركز الثالث');
    const name = screen.getByText('محمد');
    expect(rankBadge.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(avatar.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
