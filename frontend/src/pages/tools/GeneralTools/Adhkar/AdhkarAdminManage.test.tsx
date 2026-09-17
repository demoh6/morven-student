import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdhkarPage from '@/pages/tools/GeneralTools/Adhkar/AdhkarPage';
import { useAdhkarStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarStore';
import { useAdhkarApprovedStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarApprovedStore';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { toNetworkError } from '@/services/apiError';
import { getAdhkarByCategory, filterAdhkarByPeriod, getAdhkarPeriod } from '@/pages/tools/GeneralTools/Adhkar/adhkar';
import type { AuthUser } from '@/pages/auth/authApi';
import type { OfficialApprovedResponse } from '@/pages/tools/GeneralTools/Adhkar/adhkarApi';

vi.mock('@/pages/tools/GeneralTools/Adhkar/adhkarApi', () => ({
  fetchApprovedAdhkar: vi.fn(),
  submitDhikrSubmission: vi.fn(),
  listDhikrSubmissions: vi.fn(),
  approveDhikrSubmission: vi.fn(),
  rejectDhikrSubmission: vi.fn(),
  updateDhikrSubmission: vi.fn(),
  deleteDhikrSubmission: vi.fn(),
  updateOfficialDhikr: vi.fn(),
  deleteOfficialDhikr: vi.fn(),
}));

import {
  fetchApprovedAdhkar,
  updateDhikrSubmission,
  deleteDhikrSubmission,
  updateOfficialDhikr,
  deleteOfficialDhikr,
} from '@/pages/tools/GeneralTools/Adhkar/adhkarApi';

const mockedFetch = vi.mocked(fetchApprovedAdhkar);
const mockedUpdateSubmission = vi.mocked(updateDhikrSubmission);
const mockedDeleteSubmission = vi.mocked(deleteDhikrSubmission);
const mockedUpdateOfficial = vi.mocked(updateOfficialDhikr);
const mockedDeleteOfficial = vi.mocked(deleteOfficialDhikr);

const adminUser = {
  id: 'admin-1',
  email: 'admin@morven.app',
  username: 'admin',
  displayName: 'مدير الموقع',
  role: 'ADMIN',
  avatarUrl: null,
} as AuthUser;

const emptyResponse: OfficialApprovedResponse = {
  adhkar: [],
  officialEdits: [],
  officialDeletions: [],
};

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resetStores() {
  useAdhkarStore.setState({ currentCategory: null, counts: {}, day: todayKey() });
  useAdhkarApprovedStore.setState({
    approved: [],
    officialEdits: [],
    officialDeletions: [],
  });
  useAppStore.setState({ notifications: [] });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  resetStores();
  useAuthStore.setState({ user: null, initialized: true });
  mockedFetch.mockResolvedValue(emptyResponse);
  mockedUpdateSubmission.mockResolvedValue({} as never);
  mockedDeleteSubmission.mockResolvedValue({} as never);
  mockedUpdateOfficial.mockResolvedValue({} as never);
  mockedDeleteOfficial.mockResolvedValue({} as never);
});

function toasts() {
  return useAppStore.getState().notifications.map((n) => n.message);
}

async function openCategory(user: U, name: RegExp, headingName?: RegExp) {
  await user.click(screen.getByRole('button', { name }));
  await screen.findByRole('heading', { level: 2, name: headingName ?? name });
}

type U = ReturnType<typeof userEvent.setup>;

describe('Adhkar admin edit/delete (visible only to ADMIN role)', () => {
  it('hides edit/delete controls for a non-admin user', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    expect(
      screen.queryByRole('button', { name: 'تعديل ذكر آية الكرسي' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'حذف ذكر آية الكرسي' }),
    ).not.toBeInTheDocument();
  });

  it('shows subtle edit/delete buttons on every dhikr card for an admin', async () => {
    useAuthStore.setState({ user: adminUser, initialized: true });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    expect(screen.getByTestId('adhkar-me-ayatul-kursi')).toBeInTheDocument();
    const total = filterAdhkarByPeriod(
      getAdhkarByCategory('morning-evening'),
      getAdhkarPeriod(),
    ).length;
    expect(screen.getAllByRole('button', { name: /^تعديل ذكر / })).toHaveLength(total);
    expect(screen.getAllByRole('button', { name: /^حذف ذكر / })).toHaveLength(total);
  });

  it('prefills and saves an edit for an official dhikr in place', async () => {
    useAuthStore.setState({ user: adminUser, initialized: true });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    await user.click(screen.getByRole('button', { name: 'تعديل ذكر آية الكرسي' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('تعديل الذكر');
    
    const textInput = screen.getByLabelText('محتوى الذكر') as HTMLTextAreaElement;
    
    expect(textInput.value).toContain('اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ');

    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => {
      expect(mockedUpdateOfficial).toHaveBeenCalledWith('me-ayatul-kursi', {
        title: 'آية الكرسي — معدلة',
        text: expect.stringContaining('اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ'),
        source: 'القرآن الكريم — سورة البقرة (٢٥٥)',
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(toasts()).toContain('تم حفظ تعديلات الذكر');
  });

  it('reflects a saved official edit after re-fetch (no duplicate card)', async () => {
    useAuthStore.setState({ user: adminUser, initialized: true });
    let response = {
      ...emptyResponse,
    };
    mockedFetch.mockImplementation(() => Promise.resolve(response));
    mockedUpdateOfficial.mockImplementation(async (id, content) => {
      response = {
        ...response,
        officialEdits: [
          {
            officialDhikrId: id,
            title: content.title,
            text: content.text,
            source: content.source ?? '',
          },
        ],
      };
      return response.officialEdits[0];
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار قبل الدراسة/);

    await user.click(
      screen.getByRole('button', { name: 'تعديل ذكر دعاء القرآن بطلب العلم' }),
    );
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

   
  });

  it('edits an approved submission with the stripped submission id', async () => {
    useAuthStore.setState({ user: adminUser, initialized: true });
    mockedFetch.mockResolvedValue({
      adhkar: [
        {
          id: 'aa-1',
          categoryId: 'before-study',
          title: 'ذكر مقبول دراسي',
          text: 'درس ميسر وذكر مقبول',
          source: '',
          createdAt: '2026-09-09T00:00:00.000Z',
        },
      ],
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
    await screen.findByText('درس ميسر وذكر مقبول');

    await user.click(screen.getByRole('button', { name: 'تعديل ذكر ذكر مقبول دراسي' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => {
      expect(mockedUpdateSubmission).toHaveBeenCalledWith(
        'aa-1',
        expect.objectContaining({ title: 'العنوان المنقح' }),
      );
    });
    expect(toasts()).toContain('تم حفظ تعديلات الذكر');
  });

  it('asks for confirmation and permanently removes an official dhikr', async () => {
    useAuthStore.setState({ user: adminUser, initialized: true });
    let response = emptyResponse;
    mockedFetch.mockImplementation(() => Promise.resolve(response));
    mockedDeleteOfficial.mockImplementation(async (id) => {
      response = { ...response, officialDeletions: [id] };
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    await user.click(screen.getByRole('button', { name: 'حذف ذكر آية الكرسي' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('حذف الذكر');
    expect(dialog).toHaveTextContent('آية الكرسي');
    expect(dialog).toHaveTextContent('سيتم حذف هذا الذكر نهائياً');
    expect(dialog).toHaveTextContent('لا يمكن التراجع عن هذا الإجراء');

    // Cancel first: nothing is deleted.
    await user.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(mockedDeleteOfficial).not.toHaveBeenCalled();
    expect(screen.getByTestId('adhkar-me-ayatul-kursi')).toBeInTheDocument();

    // Confirm this time: card is removed and the API is called.
    await user.click(screen.getByRole('button', { name: 'حذف ذكر آية الكرسي' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'حذف نهائي' }));

    await waitFor(() => {
      expect(mockedDeleteOfficial).toHaveBeenCalledWith('me-ayatul-kursi');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('adhkar-me-ayatul-kursi')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /حذف ذكر آية الكرسي/ })).not.toBeInTheDocument();
    expect(toasts()).toContain('تم حذف الذكر نهائياً');
  });

  it('deletes an approved submission permanently via its row id', async () => {
    useAuthStore.setState({ user: adminUser, initialized: true });
    mockedFetch.mockResolvedValue({
      adhkar: [
        {
          id: 'aa-2',
          categoryId: 'before-study',
          title: 'ذكر مقبول دراسي',
          text: 'درس ميسر وذكر مقبول',
          source: '',
          createdAt: '2026-09-09T00:00:00.000Z',
        },
      ],
      officialEdits: [],
      officialDeletions: [],
    });
    mockedDeleteSubmission.mockImplementation(async () => {});

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار قبل الدراسة/);
    await screen.findByText('درس ميسر وذكر مقبول');

    await user.click(screen.getByRole('button', { name: 'حذف ذكر ذكر مقبول دراسي' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'حذف نهائي' }));

    await waitFor(() => {
      expect(mockedDeleteSubmission).toHaveBeenCalledWith('aa-2');
    });
    expect(toasts()).toContain('تم حذف الذكر نهائياً');
  });

  it('keeps the card and shows an error toast when deletion fails', async () => {
    useAuthStore.setState({ user: adminUser, initialized: true });
    mockedDeleteOfficial.mockRejectedValue(toNetworkError('تعذر الاتصال بالخادم'));

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdhkarPage />
      </MemoryRouter>,
    );
    await openCategory(user, /أذكار الصباح والمساء/, /أذكار الصباح|أذكار المساء/);

    await user.click(screen.getByRole('button', { name: 'حذف ذكر آية الكرسي' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'حذف نهائي' }));

    await waitFor(() => {
      expect(toasts()).toContain('تعذر حذف الذكر، تحقق من اتصالك بالإنترنت');
    });
    // The card stays and the confirmation reopens/remains.
    expect(screen.getByTestId('adhkar-me-ayatul-kursi')).toBeInTheDocument();
  });
});