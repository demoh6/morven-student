import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useAdhkarStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarStore';
import { scopedKey } from '@/storage/scope';
import AdhkarPage from '@/pages/tools/GeneralTools/Adhkar/AdhkarPage';
import GeneralToolPage from '@/pages/tools/GeneralTools/GeneralTools';
import {
  ADHKARS,
  CATEGORIES,
  CATEGORY_META,
  getAdhkarByCategory,
  getAdhkarPeriod,
  getAdhkarHeroText,
  getCategoryProgress,
  filterAdhkarByPeriod,
  searchAdhkar,
  type AdhkarPeriod,
} from '@/pages/tools/GeneralTools/Adhkar/adhkar';

vi.mock('@/pages/tools/GeneralTools/Adhkar/adhkarApi', () => ({
  fetchApprovedAdhkar: vi.fn().mockResolvedValue({
    adhkar: [],
    officialEdits: [],
    officialDeletions: [],
  }),
  submitDhikrSubmission: vi.fn(),
  listDhikrSubmissions: vi.fn(),
  approveDhikrSubmission: vi.fn(),
  rejectDhikrSubmission: vi.fn(),
}));

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resetStore() {
  useAdhkarStore.setState({
    currentCategory: null,
    counts: {},
    day: todayKey(),
  });
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

type U = ReturnType<typeof userEvent.setup>;

async function openCategory(user: U, name: RegExp, headingName?: RegExp) {
  await user.click(screen.getByRole('button', { name }));
  await screen.findByRole('heading', { level: 2, name: headingName ?? name });
}

async function goBackToOverview(user: U) {
  await user.click(screen.getByRole('button', { name: /العودة لقائمة الأذكار/ }));
  await screen.findByRole('button', { name: /أذكار الصباح والمساء/ });
}

describe('Adhkar data integrity (offline, bundled local data)', () => {
  it('contains at least one dhikr in every category with unique ids', () => {
    const ids = new Set<string>();
    for (const category of CATEGORIES) {
      const items = getAdhkarByCategory(category);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);
      }
    }
  });

  it('has valid repetition counts (at least 1) and proper preservation fields', () => {
    for (const dhikr of ADHKARS) {
      expect(dhikr.repeatCount).toBeGreaterThanOrEqual(1);
      expect(dhikr.source.trim()).not.toBe('');
      expect(dhikr.text.trim()).not.toBe('');
    }
  });

  it('respects the established repetition counts of the well-known adhkar', () => {
    const byId = Object.fromEntries(ADHKARS.map((d) => [d.id, d]));
    expect(byId['me-muawwidhat'].repeatCount).toBe(3);
    expect(byId['me-tahlil-100'].repeatCount).toBe(100);
    expect(byId['me-tasbih-100'].repeatCount).toBe(100);
    expect(byId['me-hasbiyallah'].repeatCount).toBe(7);
    expect(byId['me-raditu'].repeatCount).toBe(3);
    expect(byId['me-sayyid-istighfar'].repeatCount).toBe(1);
    expect(byId['me-ashidu-bikalamat-allah'].repeatCount).toBe(3);
    expect(byId['me-ushhiduka-asbahna'].repeatCount).toBe(4);
  });

  it('keeps the morning/evening collection comprehensive and organized', () => {
    const morningEvening = getAdhkarByCategory('morning-evening');
    expect(morningEvening.length).toBeGreaterThanOrEqual(15);
    const groups = new Set(morningEvening.map((d) => d.group));
    expect(groups.has('quran')).toBe(true);
    expect(groups.has('morning')).toBe(true);
    expect(groups.has('evening')).toBe(true);
    expect(groups.has('tasbih')).toBe(true);
    expect(groups.has('protection')).toBe(true);
  });

  it('searches locally without any network dependency', () => {
    const results = searchAdhkar('اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ', ADHKARS);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toContain('اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ');
  });
});

describe('useAdhkarStore counter logic', () => {
  it('increments counts and never exceeds the required repetition count', () => {
    const store = useAdhkarStore;
    store.getState().increment('me-muawwidhat', 3);
    store.getState().increment('me-muawwidhat', 3);
    store.getState().increment('me-muawwidhat', 3);
    store.getState().increment('me-muawwidhat', 3); // extra click
    store.getState().increment('me-muawwidhat', 3); // extra click
    expect(store.getState().counts['me-muawwidhat']).toBe(3);
  });

  it('resets a single dhikr to zero', () => {
    const store = useAdhkarStore;
    store.getState().increment('me-asbahna', 1);
    expect(store.getState().counts['me-asbahna']).toBe(1);
    store.getState().reset('me-asbahna');
    expect(store.getState().counts['me-asbahna']).toBe(0);
  });

  it('resets every dhikr of a category', () => {
    const store = useAdhkarStore;
    store.getState().increment('me-asbahna', 1);
    store.getState().increment('me-muawwidhat', 3);
    store.getState().increment('bs-rabbi-zidni-ilma', 1);
    store.getState().resetCategory('morning-evening');
    expect(store.getState().counts['me-asbahna']).toBe(0);
    expect(store.getState().counts['me-muawwidhat']).toBe(0);
    // The other category was untouched.
    expect(store.getState().counts['bs-rabbi-zidni-ilma']).toBe(1);
  });

  it('computes category progress from counts', () => {
    const store = useAdhkarStore;
    store.getState().increment('me-asbahna', 1);
    store.getState().increment('me-muawwidhat', 3);
    store.getState().increment('me-muawwidhat', 3);
    store.getState().increment('me-muawwidhat', 3);
    const { completed, total } = getCategoryProgress('morning-evening', store.getState().counts);
    expect(total).toBe(getAdhkarByCategory('morning-evening').length);
    expect(completed).toBe(2);
  });

  it('persists counters to localStorage', () => {
    useAdhkarStore.getState().increment('me-asbahna', 1);
    const saved = JSON.parse(localStorage.getItem(scopedKey('adhkar')) as string);
    expect(saved.state.counts['me-asbahna']).toBe(1);
    expect(saved.state.day).toBe(todayKey());
  });

  it('discards counts from a previous day (automatic daily reset)', async () => {
    useAdhkarStore.getState().increment('me-asbahna', 1);
    expect(useAdhkarStore.getState().counts['me-asbahna']).toBe(1);

    // Simulate a new day arriving with persisted state from yesterday.
    localStorage.setItem(
      scopedKey('adhkar'),
      JSON.stringify({
        state: { counts: { 'me-asbahna': 1 }, day: '2000-01-01' },
        version: 0,
      }),
    );

    await useAdhkarStore.persist.rehydrate();

    const s = useAdhkarStore.getState();
    expect(s.day).not.toBe('2000-01-01');
    expect(s.counts['me-asbahna']).toBeUndefined();
  });
});

describe('Adhkar day-period split (local 02:00 / 14:00 rule)', () => {
  it('treats 02:00 inclusive through 13:59 as Morning Azkar', () => {
    const at = (hour: number) => new Date(2026, 0, 10, hour, 0, 0, 0);
    expect(getAdhkarPeriod(at(0))).toBe('evening');
    expect(getAdhkarPeriod(at(1))).toBe('evening');
    expect(getAdhkarPeriod(at(2))).toBe('morning');
    expect(getAdhkarPeriod(at(13))).toBe('morning');
    expect(getAdhkarPeriod(at(14))).toBe('evening');
    expect(getAdhkarPeriod(at(23))).toBe('evening');
  });

  it('shows only the matching time-specific group per period', () => {
    const morning = filterAdhkarByPeriod(
      getAdhkarByCategory('morning-evening'),
      'morning',
    );
    expect(morning.some((d) => d.group === 'evening')).toBe(false);
    expect(morning.some((d) => d.group === 'morning')).toBe(true);

    const evening = filterAdhkarByPeriod(
      getAdhkarByCategory('morning-evening'),
      'evening',
    );
    expect(evening.some((d) => d.group === 'morning')).toBe(false);
    expect(evening.some((d) => d.group === 'evening')).toBe(true);
  });

  it('keeps shared groups and every other category intact in both periods', () => {
    for (const category of CATEGORIES) {
      const all = getAdhkarByCategory(category);
      for (const period of ['morning', 'evening'] as AdhkarPeriod[]) {
        const visible = filterAdhkarByPeriod(all, period);
        if (category === 'morning-evening') {
          // Only the opposite-time group is dropped; the rest stays.
          expect(visible.length).toBeGreaterThan(0);
          expect(visible.length).toBeLessThan(all.length);
        } else {
          expect(visible.length).toBe(all.length);
        }
      }
    }
  });

  it('labels the morning/evening section header only with the active time', () => {
    const morningHero = getAdhkarHeroText('morning');
    expect(morningHero.title).toBe('أذكار الصباح');
    expect(morningHero.description).toContain('صباح');
    expect(morningHero.description).not.toContain('مساء');

    const eveningHero = getAdhkarHeroText('evening');
    expect(eveningHero.title).toBe('أذكار المساء');
    expect(eveningHero.description).toContain('مساء');
    expect(eveningHero.description).not.toContain('صباح');
  });
});

describe('AdhkarPage overview', () => {
  it('renders the four category cards', () => {
    render(<AdhkarPage />);
    expect(screen.getByRole('button', { name: /أذكار الصباح والمساء/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /أذكار قبل الدراسة/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /أذكار بعد الدراسة/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /أذكار قبل الامتحانات/ })).toBeInTheDocument();

    // The introductory card was removed completely.
    expect(screen.queryByText(/تُصفّر العدّادات تلقائياً مع بداية كل يوم/)).not.toBeInTheDocument();
  });

  it('shows the number of adhkar inside each category card', () => {
    render(<AdhkarPage />);
    const visibleMorningEvening = filterAdhkarByPeriod(
      getAdhkarByCategory('morning-evening'),
      getAdhkarPeriod(),
    ).length;
    expect(
      screen.getByText(`${visibleMorningEvening} من الأذكار`),
    ).toBeInTheDocument();
    // Two contextual categories contain 4 items each.
    expect(screen.getAllByText(`${getAdhkarByCategory('before-study').length} من الأذكار`)).toHaveLength(2);
  });

  it('navigates into a category and back to the overview', async () => {
    const user = userEvent.setup();
    render(<AdhkarPage />);

    await openCategory(user, /أذكار قبل الدراسة/);

    // Category view is shown with its header.
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();

    await goBackToOverview(user);

    expect(screen.getByRole('button', { name: /أذكار الصباح والمساء/ })).toBeInTheDocument();
  });

  it('does not show the general-attributes disclaimer card in contextual categories', async () => {
    const user = userEvent.setup();
    render(<AdhkarPage />);
    await openCategory(user, /أذكار قبل الدراسة/);
    expect(
      screen.queryByText(/هذه أدعية وأذكار عامة مأثورة من الكتاب والسنة/),
    ).not.toBeInTheDocument();
  });

  it('filters across categories from the overview search', async () => {
    const user = userEvent.setup();
    render(<AdhkarPage />);

    const search = screen.getByRole('textbox', { name: 'البحث في الأذكار' });
    await user.type(search, 'سورة البقرة');

    expect(await screen.findByTestId('adhkar-me-ayatul-kursi')).toBeInTheDocument();
    // The overview cards are replaced by results while searching.
    expect(screen.queryByRole('button', { name: /أذكار بعد الدراسة/ })).not.toBeInTheDocument();
  });
});

describe('AdhkarPage category view', () => {
  it('renders every dhikr of the open category with its required repetitions', async () => {
    const user = userEvent.setup();
    render(<AdhkarPage />);
    await openCategory(user, /أذكار قبل الدراسة/);

    expect(screen.getByTestId('adhkar-bs-rabbi-zidni-ilma')).toBeInTheDocument();
    expect(screen.getAllByText('0 / 1')).toHaveLength(4);
  });

  it('shows category progress on the overview card', () => {
    render(<AdhkarPage />);

    const total = getAdhkarByCategory('before-study').length;
    expect(
      screen.getAllByText(`تم إنجاز 0 من ${total}`).length,
    ).toBeGreaterThan(0);
  });

  it('increments the counter on click, marks completion and stays visible', async () => {
    const user = userEvent.setup();
    render(<AdhkarPage />);
    await openCategory(user, /أذكار قبل الدراسة/);

    // "دعاء القرآن بطلب العلم" has 1 repetition.
    const card = screen.getByTestId('adhkar-bs-rabbi-zidni-ilma');
    const counter = within(card).getByRole('button', { name: 'الذكر، تم العد 0 من 1' });
    await user.click(counter);

    expect(
      within(card).getByRole('button', { name: 'الذكر، تم العد 1 من 1' }),
    ).toBeInTheDocument();
    // Completion badge appears; the card is not removed.
    expect(screen.getByText('تمّ')).toBeInTheDocument();
    expect(screen.getByTestId('adhkar-bs-rabbi-zidni-ilma')).toBeInTheDocument();
  });

  it('stops the counter at the required count (3) and allows resetting', async () => {
    const user = userEvent.setup();
    render(<AdhkarPage />);
    await openCategory(user, /أذكار قبل الدراسة/);

    // None of the before-study items uses 3 repetitions, so check the
    // morning/evening "سورة الإخلاص والمعوذتان" (3x) for the cap behaviour.
    await goBackToOverview(user);
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    const label = (n: number) => `الذكر، تم العد ${n} من 3`;
    const card = screen.getByTestId('adhkar-me-muawwidhat');
    fireEvent.click(within(card).getByRole('button', { name: new RegExp(label(0)) }));
    fireEvent.click(within(card).getByRole('button', { name: new RegExp(label(1)) }));
    fireEvent.click(within(card).getByRole('button', { name: new RegExp(label(2)) }));
    // An extra click must NOT go past 3.
    fireEvent.click(within(card).getByRole('button', { name: new RegExp(label(3)) }));
    expect(within(card).getByRole('button', { name: new RegExp(label(3)) })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /تم العد 4 من 3/ })).not.toBeInTheDocument();

    // Reset brings it back to 0.
    fireEvent.click(
      within(card).getByRole('button', { name: /إعادة تعيين عداد الذكر/ }),
    );
    expect(within(card).getByRole('button', { name: new RegExp(label(0)) })).toBeInTheDocument();
  });

  it('updates the overview progress once a dhikr is completed', async () => {
    const user = userEvent.setup();
    render(<AdhkarPage />);
    await openCategory(user, /أذكار قبل الدراسة/);

    await user.click(
      within(screen.getByTestId('adhkar-bs-rabbi-zidni-ilma')).getByRole('button', { name: 'الذكر، تم العد 0 من 1' }),
    );

    await goBackToOverview(user);

    const total = getAdhkarByCategory('before-study').length;
    expect(screen.getByText(`تم إنجاز 1 من ${total}`)).toBeInTheDocument();
  });

  it('shows a completed state on the overview card when the whole category is done', () => {
    // Complete every dhikr in the category directly through the store before
    // mounting, so the overview renders the finished state on first paint.
    for (const dhikr of getAdhkarByCategory('before-study')) {
      useAdhkarStore.getState().increment(dhikr.id, dhikr.repeatCount);
    }

    render(<AdhkarPage />);

    const total = getAdhkarByCategory('before-study').length;
    expect(screen.getByText(`تم إنجاز ${total} من ${total}`)).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders every dhikr card directly without group headings (morning/evening)', async () => {
    const user = userEvent.setup();
    render(<AdhkarPage />);
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    // No section/group headings above the cards.
    expect(screen.queryByText('آيات من القرآن الكريم')).not.toBeInTheDocument();
    expect(screen.queryByText('أدعية الصباح المأثورة')).not.toBeInTheDocument();
    expect(screen.queryByText('تسبيح وذكر')).not.toBeInTheDocument();
    expect(screen.queryByText('أذكار الحماية والتحصين')).not.toBeInTheDocument();

    // All dhikr cards of the category for the active period are present.
    const total = filterAdhkarByPeriod(
      getAdhkarByCategory('morning-evening'),
      getAdhkarPeriod(),
    ).length;
    expect(total).toBeGreaterThan(10);
    expect(screen.getAllByTestId(/^adhkar-me-/)).toHaveLength(total);
    expect(screen.getByTestId('adhkar-me-ayatul-kursi')).toBeInTheDocument();
    expect(screen.getByTestId('adhkar-me-sayyid-istighfar')).toBeInTheDocument();
  });

  it('has no search bar inside any category', async () => {
    const user = userEvent.setup();
    render(<AdhkarPage />);
    await openCategory(user, /أذكار قبل الدراسة/);

    expect(
      screen.queryByRole('textbox', { name: 'البحث ضمن أذكار قبل الدراسة' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ابحث ضمن هذا القسم/)).not.toBeInTheDocument();
  });

  it('shows the morning/evening section header following the active period', async () => {
    const user = userEvent.setup();
    render(<AdhkarPage />);
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    const hero = getAdhkarHeroText(getAdhkarPeriod());
    expect(screen.getByRole('heading', { level: 2, name: hero.title })).toBeInTheDocument();
    // The subtitle is the period-aware one (the static "للصباح والمساء" copy
    // would not match), and it only mentions the active half of the day.
    expect(screen.getByText(hero.description)).toBeInTheDocument();
    expect(screen.queryByText(CATEGORY_META['morning-evening'].description)).not.toBeInTheDocument();
  });
});

describe('GeneralToolPage chrome visibility for Adhkar', () => {
  it('shows the tool hero and the general-tools back button on the landing page, but hides them inside a category', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GeneralToolPage toolId="adhkar" />
      </MemoryRouter>,
    );

    // Landing page keeps the Hero and the general back button.
    expect(screen.getByRole('button', { name: /العودة للأدوات العامة/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'الأذكار' })).toBeInTheDocument();

    await openCategory(user, /أذكار قبل الدراسة/);

    // Inside a category both the Hero and the general back button disappear.
    expect(screen.queryByRole('button', { name: /العودة للأدوات العامة/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'الأذكار' })).not.toBeInTheDocument();

    // The category's own back button is still there.
    expect(screen.getByRole('button', { name: /العودة لقائمة الأذكار/ })).toBeInTheDocument();
  });
});