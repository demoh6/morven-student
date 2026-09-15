import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import {
  getTriggerHour,
  getTriggerTime,
  isTriggerPassed,
  todayKey,
  isEligibleToShow,
  isDisplayedForDay,
  getNextReminderBoundary,
} from './adhkarReminder';
import { useAdhkarReminderStore } from './adhkarReminderStore';
import { AdhkarReminderHost } from './AdhkarReminderHost';
import { useAdhkarStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarStore';
import { getAdhkarPeriod } from '@/pages/tools/GeneralTools/Adhkar/adhkar';
import GeneralToolPage from '@/pages/tools/GeneralTools/GeneralTools';

vi.mock('@/pages/tools/GeneralTools/Adhkar/adhkarApi', () => ({
  fetchApprovedAdhkar: vi
    .fn()
    .mockResolvedValue({ adhkar: [], officialEdits: [], officialDeletions: [] }),
  submitDhikrSubmission: vi.fn(),
  listDhikrSubmissions: vi.fn(),
  approveDhikrSubmission: vi.fn(),
  rejectDhikrSubmission: vi.fn(),
  deleteDhikrSubmission: vi.fn(),
  updateDhikrSubmission: vi.fn(),
  updateOfficialDhikr: vi.fn(),
  deleteOfficialDhikr: vi.fn(),
}));

// Local-date helpers on a fixed "day 1 / day 2" pair (2026-01-10 / 11).
const at = (hour: number, minute = 0, day = 10) =>
  new Date(2026, 0, day, hour, minute, 0, 0);
const D1 = '2026-01-10';
const D2 = '2026-01-11';

function resetLocalState() {
  localStorage.clear();
  useAdhkarReminderStore.setState({
    shownDate: { morning: null, evening: null },
    dismissedDate: { morning: null, evening: null },
  });
  useAdhkarStore.setState({
    currentCategory: null,
    counts: {},
    day: todayKey(),
  });
}

// framer-motion's animation frame loop is a no-op under jsdom, so exiting/entering
// cards stay mounted at opacity 0. Clean up the whole document between tests and
// unmount explicit renders before re-rendering so stale nodes never leak into
// assertions.
afterEach(() => {
  cleanup();
});

// System time is controlled through vitest fake timers. `resync()` forces the
// scheduler to re-evaluate against the new clock, exactly like a page focus.
function setLocalTime(hour: number, minute = 0, day = 10) {
  vi.setSystemTime(at(hour, minute, day));
}

function resync() {
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
}

const MORNING_REGION = 'تذكير أذكار الصباح';
const EVENING_REGION = 'تذكير أذكار المساء';
const PRIMARY_ACTION = 'قراءة الأذكار';
const SKIP_ACTION = 'تخطي';

function renderHost() {
  return render(
    <MemoryRouter>
      <AdhkarReminderHost />
    </MemoryRouter>,
  );
}

function Harness() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <AdhkarReminderHost />
      <Routes>
        <Route path="/" element={<div>الصفحة الرئيسية</div>} />
        <Route path="/tool/adhkar" element={<GeneralToolPage toolId="adhkar" />} />
        <Route path="*" element={<div>أخرى</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdhkarReminder logic (pure, local time only)', () => {
  it('morning triggers at 10:00 and evening at 17:00 local time', () => {
    expect(getTriggerHour('morning')).toBe(10);
    expect(getTriggerHour('evening')).toBe(17);

    const morning = getTriggerTime('morning', at(0));
    expect(morning.getHours()).toBe(10);
    expect(morning.getMinutes()).toBe(0);
    expect(morning.getFullYear()).toBe(2026);
    expect(morning.getMonth()).toBe(0);
    expect(morning.getDate()).toBe(10);

    const evening = getTriggerTime('evening', at(0));
    expect(evening.getHours()).toBe(17);
  });

  it('isTriggerPassed: false before the trigger, true from the trigger onward', () => {
    expect(isTriggerPassed('morning', at(9, 59))).toBe(false);
    expect(isTriggerPassed('morning', at(10))).toBe(true);
    expect(isTriggerPassed('morning', at(23))).toBe(true);

    expect(isTriggerPassed('evening', at(16, 59))).toBe(false);
    expect(isTriggerPassed('evening', at(17))).toBe(true);
    expect(isTriggerPassed('evening', at(23))).toBe(true);
  });

  it('todayKey is a local YYYY-MM-DD date (never UTC)', () => {
    expect(todayKey(new Date(2026, 4, 23))).toBe('2026-05-23');
    expect(todayKey(at(23, 45, 10))).toBe(D1);
  });

  it('isEligibleToShow: gated by trigger + per-day shown/dismissed state', () => {
    // Before the trigger — never eligible.
    expect(isEligibleToShow('morning', at(9, 0), null, null)).toBe(false);
    // After the trigger, nothing recorded — eligible.
    expect(isEligibleToShow('morning', at(10, 0), null, null)).toBe(true);
    expect(isEligibleToShow('evening', at(17, 0), null, null)).toBe(true);
    // Shown today — not eligible again (at most once per day).
    expect(isEligibleToShow('morning', at(10, 0), D1, null)).toBe(false);
    // Dismissed today — not eligible that day.
    expect(isEligibleToShow('morning', at(10, 0), null, D1)).toBe(false);
    expect(isEligibleToShow('morning', at(10, 0), D1, D1)).toBe(false);
    // The previous day's records never block a new local day.
    expect(isEligibleToShow('morning', at(10, 0, 11), D1, D1)).toBe(true);
    // Evening stays independent from the morning state.
    expect(isEligibleToShow('evening', at(17, 0), D2, null)).toBe(true);
  });

  it('isDisplayedForDay: once shown it stays, dismiss hides it, old day never displays', () => {
    expect(isDisplayedForDay('morning', at(10, 5), D1, null)).toBe(true);
    expect(isDisplayedForDay('morning', at(10, 5), D1, D1)).toBe(false);
    // Yesterday's shown card is never displayed on a later day.
    expect(isDisplayedForDay('morning', at(10, 5, 11), D1, null)).toBe(false);
    // A refreshed-but-not-dismissed card is still "shown today".
    expect(isDisplayedForDay('evening', at(17, 5), D1, null)).toBe(true);
    expect(isDisplayedForDay('evening', at(17, 5), D1, D1)).toBe(false);
  });

  it('getNextReminderBoundary walks 10:00 → 17:00 → next midnight', () => {
    expect(getNextReminderBoundary(at(9, 0))).toEqual(at(10, 0));
    expect(getNextReminderBoundary(at(10, 0))).toEqual(at(17, 0));
    expect(getNextReminderBoundary(at(16, 59))).toEqual(at(17, 0));
    expect(getNextReminderBoundary(at(17, 0)).getDate()).toBe(11);
    const midnight = getNextReminderBoundary(at(17, 0));
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
    // Early in the day the next boundary is retargeted to today's 10:00.
    expect(getNextReminderBoundary(at(0, 30, 11))).toEqual(at(10, 0, 11));
  });
});

describe('useAdhkarReminderStore (persistence + independent slots)', () => {
  beforeEach(() => {
    resetLocalState();
  });

  it('starts clean for both slots', () => {
    const { shownDate, dismissedDate } = useAdhkarReminderStore.getState();
    expect(shownDate).toEqual({ morning: null, evening: null });
    expect(dismissedDate).toEqual({ morning: null, evening: null });
  });

  it('show records only the targeted slot for the current local day', () => {
    useAdhkarReminderStore.getState().show('morning');
    const { shownDate, dismissedDate } = useAdhkarReminderStore.getState();
    expect(shownDate.morning).toBe(todayKey());
    expect(shownDate.evening).toBeNull();
    expect(dismissedDate.morning).toBeNull();
  });

  it('dismiss keeps morning and evening independent', () => {
    useAdhkarReminderStore.getState().dismiss('morning');
    const { dismissedDate } = useAdhkarReminderStore.getState();
    expect(dismissedDate.morning).toBe(todayKey());
    expect(dismissedDate.evening).toBeNull();
  });

  it('persists show/dismiss state to localStorage', () => {
    useAdhkarReminderStore.getState().show('morning');
    useAdhkarReminderStore.getState().dismiss('evening', D1);
    const saved = JSON.parse(localStorage.getItem('morven-adhkar-reminder') as string);
    expect(saved.state.shownDate.morning).toBe(todayKey());
    expect(saved.state.dismissedDate.evening).toBe(D1);
    expect(saved.state.dismissedDate.morning).toBeNull();
  });
});

describe('AdhkarReminderHost daily display', () => {
  beforeEach(() => {
    resetLocalState();
    vi.useFakeTimers();
    setLocalTime(10, 0); // default: day 1 at 10:00
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows nothing before the 10:00 morning trigger', () => {
    setLocalTime(9, 59);
    renderHost();
    expect(screen.queryByRole('region', { name: MORNING_REGION })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: EVENING_REGION })).not.toBeInTheDocument();
  });

  it('keeps the morning reminder visible while the evening trigger has not passed yet', () => {
    setLocalTime(16, 59);
    renderHost();
    expect(screen.queryByRole('region', { name: EVENING_REGION })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: MORNING_REGION })).toBeInTheDocument();
  });

  it('shows the morning reminder from exactly 10:00', () => {
    setLocalTime(10, 0);
    renderHost();
    expect(screen.getByRole('region', { name: MORNING_REGION })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: EVENING_REGION })).not.toBeInTheDocument();
  });

  it('shows the morning reminder when Morven is opened after 10:00', () => {
    setLocalTime(12, 30);
    renderHost();
    expect(screen.getByRole('region', { name: MORNING_REGION })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: EVENING_REGION })).not.toBeInTheDocument();
  });

  it('wakes at the boundary while the app is open: 10:00 turns the morning card on', () => {
    setLocalTime(9, 59);
    renderHost();
    expect(screen.queryByRole('region', { name: MORNING_REGION })).not.toBeInTheDocument();

    setLocalTime(10, 0);
    resync();
    expect(screen.getByRole('region', { name: MORNING_REGION })).toBeInTheDocument();
  });

  it('shows the evening reminder from exactly 17:00', () => {
    setLocalTime(17, 0);
    renderHost();
    expect(screen.getByRole('region', { name: EVENING_REGION })).toBeInTheDocument();
  });

  it('shows both reminders once the evening trigger passed', () => {
    setLocalTime(18, 30);
    renderHost();
    expect(screen.getByRole('region', { name: MORNING_REGION })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: EVENING_REGION })).toBeInTheDocument();
  });
});

describe('AdhkarReminderHost skip behavior', () => {
  beforeEach(() => {
    resetLocalState();
    vi.useFakeTimers();
    setLocalTime(10, 5);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skip dismisses the slot for the day and a refresh does not bring it back', () => {
    const first = renderHost();
    expect(screen.getByRole('region', { name: MORNING_REGION })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: SKIP_ACTION }));
    expect(useAdhkarReminderStore.getState().dismissedDate.morning).toBe(D1);

    // Refresh (fresh mount) on the SAME local day: still dismissed.
    first.unmount();
    setLocalTime(11, 0);
    renderHost();
    expect(screen.queryByRole('region', { name: MORNING_REGION })).not.toBeInTheDocument();
  });

  it('skip of the morning reminder never touches the evening state', () => {
    setLocalTime(18, 30);
    renderHost();
    const morning = screen.getByRole('region', { name: MORNING_REGION });
    const evening = screen.getByRole('region', { name: EVENING_REGION });
    expect(morning).toBeInTheDocument();
    expect(evening).toBeInTheDocument();

    fireEvent.click(within(morning).getByRole('button', { name: SKIP_ACTION }));

    const state = useAdhkarReminderStore.getState();
    expect(state.dismissedDate.morning).toBe(D1);
    expect(state.dismissedDate.evening).toBeNull();
    // The evening reminder remains independently shown.
    expect(screen.getByRole('region', { name: EVENING_REGION })).toBeInTheDocument();
  });

  it('a new local day makes the reminder eligible again after a skip', () => {
    const first = renderHost();
    fireEvent.click(screen.getByRole('button', { name: SKIP_ACTION }));
    expect(useAdhkarReminderStore.getState().dismissedDate.morning).toBe(D1);

    // Next local day at 10:00 — eligible again.
    first.unmount();
    setLocalTime(10, 0, 11);
    renderHost();
    expect(screen.getByRole('region', { name: MORNING_REGION })).toBeInTheDocument();
    expect(useAdhkarReminderStore.getState().shownDate.morning).toBe(D2);
  });

  it('never re-shows an already-shown reminder within the same day after a refresh', () => {
    // First open at 10:00 shows the card once.
    const first = renderHost();
    expect(useAdhkarReminderStore.getState().shownDate.morning).toBe(D1);

    // Refresh later the same day, no action taken: still ONE card, not two,
    // because `shownDate` mirrors the once-per-day display decision.
    first.unmount();
    setLocalTime(12, 0);
    renderHost();
    const regions = screen.getAllByRole('region', { name: MORNING_REGION });
    expect(regions).toHaveLength(1);
  });
});

describe('AdhkarReminderHost «قراءة الأذكار» opens the existing Adhkar tool', () => {
  beforeEach(() => {
    resetLocalState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('morning reminder opens /tool/adhkar morning-evening and lands on the morning view', () => {
    setLocalTime(10, 0);
    const { unmount } = render(<Harness />);
    expect(getAdhkarPeriod(at(10, 0))).toBe('morning');

    const morning = screen.getByRole('region', { name: MORNING_REGION });
    fireEvent.click(within(morning).getByRole('button', { name: PRIMARY_ACTION }));

    expect(useAdhkarStore.getState().currentCategory).toBe('morning-evening');
    expect(useAdhkarReminderStore.getState().dismissedDate.morning).toBe(D1);
    // The Adhkar category view is rendered for the active (morning) period.
    expect(
      screen.getByRole('heading', { level: 2, name: 'أذكار الصباح' }),
    ).toBeInTheDocument();
    unmount();
  });

  it('evening reminder opens /tool/adhkar morning-evening and lands on the evening view', () => {
    setLocalTime(17, 0);
    render(<Harness />);
    expect(getAdhkarPeriod(at(17, 0))).toBe('evening');

    const evening = screen.getByRole('region', { name: EVENING_REGION });
    fireEvent.click(within(evening).getByRole('button', { name: PRIMARY_ACTION }));

    expect(useAdhkarStore.getState().currentCategory).toBe('morning-evening');
    expect(useAdhkarReminderStore.getState().dismissedDate.evening).toBe(D1);
    expect(useAdhkarReminderStore.getState().dismissedDate.morning).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: 'أذكار المساء' }),
    ).toBeInTheDocument();
  });
});

describe('AdhkarReminderHost is never blocking', () => {
  beforeEach(() => {
    resetLocalState();
    vi.useFakeTimers();
    setLocalTime(10, 5);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a non-modal corner card while the page underneath stays usable', () => {
    const onClick = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <AdhkarReminderHost />
        <button type="button" onClick={onClick}>
          عنصر تفاعلي
        </button>
      </MemoryRouter>,
    );

    const card = screen.getByRole('region', { name: MORNING_REGION });
    expect(card).toBeInTheDocument();

    // Not a modal — no dialog semantics, no aria-modal, no full-screen overlay.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-modal="true"]')).toBeNull();
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
    // Scroll is never locked and background interaction is never disabled.
    expect(document.body.style.overflow).not.toBe('hidden');

    const underlying = screen.getByRole('button', { name: 'عنصر تفاعلي' });
    expect(underlying).not.toBeDisabled();
    fireEvent.click(underlying);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});