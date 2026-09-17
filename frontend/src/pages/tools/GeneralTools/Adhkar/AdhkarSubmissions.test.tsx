import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdhkarPage from '@/pages/tools/GeneralTools/Adhkar/AdhkarPage';
import { useAdhkarStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarStore';
import { useAdhkarApprovedStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarApprovedStore';
import { useAppStore } from '@/store/useAppStore';
import { toNetworkError } from '@/services/apiError';
import type { OfficialApprovedDhikr } from '@/pages/tools/GeneralTools/Adhkar/adhkarApi';

vi.mock('@/pages/tools/GeneralTools/Adhkar/adhkarApi', () => ({
  fetchApprovedAdhkar: vi.fn(),
  submitDhikrSubmission: vi.fn(),
  listDhikrSubmissions: vi.fn(),
  approveDhikrSubmission: vi.fn(),
  rejectDhikrSubmission: vi.fn(),
}));

import { fetchApprovedAdhkar, submitDhikrSubmission } from '@/pages/tools/GeneralTools/Adhkar/adhkarApi';
const mockedFetchApproved = vi.mocked(fetchApprovedAdhkar);
const mockedSubmit = vi.mocked(submitDhikrSubmission);

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resetStores() {
  useAdhkarStore.setState({ currentCategory: null, counts: {}, day: todayKey() });
  useAdhkarApprovedStore.setState({ approved: [] });
  useAppStore.setState({ notifications: [] });
}

function approvedFixture(): OfficialApprovedDhikr[] {
  return [
    {
      id: 'aa-1',
      categoryId: 'morning-evening',
      title: 'ذكر مقبول صباحي',
      text: 'النص المستعلم للموافقة',
      source: 'إضافة مقبولة',
      createdAt: '2026-09-09T00:00:00.000Z',
    },
    {
      id: 'aa-2',
      categoryId: 'before-study',
      title: 'ذكر مقبول دراسي',
      text: 'درس ميسر وذكر مقبول',
      source: '',
      createdAt: '2026-09-09T01:00:00.000Z',
    },
  ];
}

beforeEach(() => {
  localStorage.clear();
  resetStores();
  mockedFetchApproved.mockResolvedValue({
    adhkar: [],
    officialEdits: [],
    officialDeletions: [],
  });
  mockedSubmit.mockReset();
});

function toasts() {
  return useAppStore.getState().notifications.map((n) => n.message);
}

async function openCategory(user: U, name: RegExp, headingName?: RegExp) {
  await user.click(screen.getByRole('button', { name }));
  await screen.findByRole('heading', { level: 2, name: headingName ?? name });
}

type U = ReturnType<typeof userEvent.setup>;

describe('Adhkar add-dhikr submissions', () => {
  it('shows two square icon-only action buttons in the category header', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    const resetButton = screen.getByRole('button', { name: 'تصفير القسم' });
    const addButton = screen.getByRole('button', { name: 'إضافة ذكر' });
    expect(resetButton).toBeInTheDocument();
    expect(addButton).toBeInTheDocument();
    // Both are icon-only squares: no text label, only the icon.
    expect(resetButton.textContent?.trim()).not.toContain('تصفير');
    expect(addButton.querySelector('svg')).not.toBeNull();
    expect(resetButton.querySelector('svg')).not.toBeNull();
  });

  it('opens the add-dhikr modal from the add button', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    await user.click(screen.getByRole('button', { name: 'إضافة ذكر' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('محتوى الذكر')).toBeInTheDocument();
    expect(screen.getByLabelText('المصدر')).toBeInTheDocument();
  });

  it('validates required fields before submitting', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);
    await user.click(screen.getByRole('button', { name: 'إضافة ذكر' }));

    await user.click(screen.getByRole('button', { name: 'إرسال للمراجعة' }));

    expect(screen.getByText('يرجى إدخال محتوى الذكر')).toBeInTheDocument();
    expect(mockedSubmit).not.toHaveBeenCalled();
    // The modal stays open.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('submits a valid dhikr, shows a success toast and closes the modal', async () => {
    const user = userEvent.setup();
    mockedSubmit.mockResolvedValue({
      id: 's-9',
      userId: 'u-1',
      categoryId: 'morning-evening',
      title: 'دعاء مقترح',
      text: 'نص مقترح',
      source: 'مصدر مقترح',
      status: 'PENDING',
      createdAt: '2026-09-09T00:00:00.000Z',
      updatedAt: '2026-09-09T00:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);
    await user.click(screen.getByRole('button', { name: 'إضافة ذكر' }));

    await user.type(screen.getByLabelText('محتوى الذكر'), 'نص مقترح');
    await user.type(screen.getByLabelText('المصدر'), 'مصدر مقترح');
    await user.click(screen.getByRole('button', { name: 'إرسال للمراجعة' }));

    await waitFor(() => {
      expect(mockedSubmit).toHaveBeenCalledWith({
        categoryId: 'morning-evening',
        title: 'دعاء مقترح',
        text: 'نص مقترح',
        source: 'مصدر مقترح',
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(toasts()).toContain('تم إرسال الذكر وسيظهر بعد مراجعة الإدارة');
  });

  it('keeps the modal open and shows an error toast on network failure', async () => {
    const user = userEvent.setup();
    mockedSubmit.mockRejectedValue(toNetworkError('تعذر الاتصال بالخادم'));

    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);
    await user.click(screen.getByRole('button', { name: 'إضافة ذكر' }));

    await user.type(screen.getByLabelText('محتوى الذكر'), 'نص');
    await user.click(screen.getByRole('button', { name: 'إرسال للمراجعة' }));

    await waitFor(() => {
      expect(toasts()).toContain('تعذر إرسال الذكر، تحقق من اتصالك بالإنترنت');
    });
    // Modal must not falsely report success — it stays open.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('warns the user to log in when the session is not authenticated', async () => {
    const user = userEvent.setup();
    mockedSubmit.mockRejectedValue(new Error('غير مصرح'));

    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);
    await user.click(screen.getByRole('button', { name: 'إضافة ذكر' }));

    await user.type(screen.getByLabelText('محتوى الذكر'), 'نص');
    await user.click(screen.getByRole('button', { name: 'إرسال للمراجعة' }));

    await waitFor(() => {
      expect(toasts()).toContain('يجب تسجيل الدخول لإضافة ذكر');
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Approved adhkar are appended after the official content', () => {
  it('renders approved submissions at the end of the matching category only', async () => {
    mockedFetchApproved.mockResolvedValue({
      adhkar: approvedFixture(),
      officialEdits: [],
      officialDeletions: [],
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );

    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    // Wait until the approved card streamed in, then confirm it is the LAST
    // card in the category — appended after every official dhikr.
    await screen.findByText('النص المستعلم للموافقة');
    const morningButtons = screen.getAllByRole('button', { name: /تم العد/ });
    const lastMorningButton = morningButtons[morningButtons.length - 1];
    expect(lastMorningButton).toHaveTextContent('النص المستعلم للموافقة');
    expect(screen.getByText('إضافة مقبولة')).toBeInTheDocument();

    // Back to overview, open a different category: the approved content must
    // not leak into it.
    await user.click(
      screen.getByRole('button', { name: /العودة لقائمة الأذكار/ }),
    );
    await screen.findByRole('button', { name: /أذكار قبل الامتحانات/ });
    await user.click(screen.getByRole('button', { name: /أذكار قبل الامتحانات/ }));
    await screen.findByRole('heading', { level: 2, name: /أذكار قبل الامتحانات/ });
    expect(screen.queryByText('النص المستعلم للموافقة')).not.toBeInTheDocument();
    expect(screen.queryByText('درس ميسر وذكر مقبول')).not.toBeInTheDocument();
  });

  it('shows study approved adhkar under the study category', async () => {
    mockedFetchApproved.mockResolvedValue({
      adhkar: approvedFixture(),
      officialEdits: [],
      officialDeletions: [],
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );

    await openCategory(user, /أذكار قبل الدراسة/);
    expect(
      await screen.findByText('درس ميسر وذكر مقبول'),
    ).toBeInTheDocument();
  });

  it('the counter works for approved adhkar (increment + reset)', async () => {
    mockedFetchApproved.mockResolvedValue({
      adhkar: approvedFixture(),
      officialEdits: [],
      officialDeletions: [],
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );

    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);
    const card = await screen.findByText('النص المستعلم للموافقة');
    const cardZone = card.closest('div[role="button"]') as HTMLElement;
    await user.click(cardZone);
    expect(cardZone).toHaveTextContent('1 / 1');

    const resetButtons = screen.getAllByRole('button', { name: /إعادة تعيين عداد/ });
    await user.click(resetButtons[resetButtons.length - 1]);
    expect(cardZone).toHaveTextContent('0 / 1');
  });

  it('does not render approved content when offline/fetch fails (bundled data intact)', async () => {
    mockedFetchApproved.mockRejectedValue(
      toNetworkError('تعذر الاتصال بالخادم'),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );

    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'إضافة ذكر' })).toBeInTheDocument();
    });
    // Only bundled official adhkar render — no sub-* cards, no crash.
    expect(screen.queryByTestId(/^adhkar-sub-/)).not.toBeInTheDocument();
    expect(mockedFetchApproved).toHaveBeenCalled();
  });
});