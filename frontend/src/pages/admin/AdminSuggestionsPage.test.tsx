import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminSuggestionsPage from '@/pages/admin/AdminSuggestionsPage';
import { useAppStore } from '@/store/useAppStore';
import type { AdminSuggestion } from '@/services/suggestionApi';

vi.mock('@/services/suggestionApi', () => ({
  listSuggestions: vi.fn(),
  deleteSuggestion: vi.fn(),
}));

import { listSuggestions, deleteSuggestion } from '@/services/suggestionApi';
const mockedListSuggestions = vi.mocked(listSuggestions);
const mockedDeleteSuggestion = vi.mocked(deleteSuggestion);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/suggestions']}>
      <Routes>
        <Route path="/admin/suggestions" element={<AdminSuggestionsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminSuggestionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ notifications: [] });
  });

  const suggestion: AdminSuggestion = {
    id: 's1',
    title: 'إضافة وضع ليلي',
    content: 'أقترح إضافة وضع ليلي سهل التفعيل',
    anonymous: false,
    userId: 'u1',
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    user: {
      id: 'u1',
      email: 'ahmed@example.com',
      username: 'ahmed_m',
      displayName: 'أحمد محمد',
      avatarUrl: null,
    },
  };

  it('shows the loading spinner while fetching', () => {
    mockedListSuggestions.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('الاقتراحات')).toBeInTheDocument();
  });

  it('renders submitted suggestions with user info', async () => {
    mockedListSuggestions.mockResolvedValue([suggestion]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('أحمد محمد')).toBeInTheDocument();
    });
    expect(screen.getByText('ahmed@example.com')).toBeInTheDocument();
    expect(screen.getByText('إضافة وضع ليلي')).toBeInTheDocument();
    expect(screen.getByText('أقترح إضافة وضع ليلي سهل التفعيل')).toBeInTheDocument();
    expect(screen.getByText(/تاريخ الإرسال/)).toBeInTheDocument();
  });

  it('renders an empty state when there are no suggestions', async () => {
    mockedListSuggestions.mockResolvedValue([]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('لا توجد اقتراحات بعد')).toBeInTheDocument();
    });
  });

  it('shows an error banner when the fetch fails', async () => {
    mockedListSuggestions.mockRejectedValue(new Error('حدث خطأ في الخادم'));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('حدث خطأ في الخادم')).toBeInTheDocument();
    });
  });

  it('shows the hidden-option indicator when anonymous is true', async () => {
    mockedListSuggestions.mockResolvedValue([
      { ...suggestion, anonymous: true },
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('اختار الإرسال بشكل متخفٍ')).toBeInTheDocument();
    });
    expect(screen.getByText('أحمد محمد')).toBeInTheDocument();
  });

  it('does not show the hidden-option indicator when anonymous is false', async () => {
    mockedListSuggestions.mockResolvedValue([
      { ...suggestion, anonymous: false },
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('أحمد محمد')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('اختار الإرسال بشكل متخفٍ'),
    ).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting a suggestion', async () => {
    mockedListSuggestions.mockResolvedValue([suggestion]);
    mockedDeleteSuggestion.mockResolvedValue();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'حذف' }));

    expect(
      screen.getByText('هل أنت متأكد من حذف هذا الاقتراح نهائياً؟ لا يمكن التراجع عن هذا الإجراء.'),
    ).toBeInTheDocument();
    expect(mockedDeleteSuggestion).not.toHaveBeenCalled();
  });

  it('cancels the delete confirmation without deleting', async () => {
    mockedListSuggestions.mockResolvedValue([suggestion]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'حذف' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'إلغاء' }),
    );

    expect(mockedDeleteSuggestion).not.toHaveBeenCalled();
    expect(screen.getByText('أحمد محمد')).toBeInTheDocument();
  });

  it('deletes the suggestion after confirmation and removes it from the list', async () => {
    mockedListSuggestions.mockResolvedValue([suggestion]);
    mockedDeleteSuggestion.mockResolvedValue();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'حذف' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'حذف' }),
    );

    await waitFor(() => {
      expect(mockedDeleteSuggestion).toHaveBeenCalledWith('s1');
    });
    expect(
      useAppStore.getState().notifications.map((n) => n.message),
    ).toContain('تم حذف الاقتراح بنجاح');
    await waitFor(() => {
      expect(screen.getByText('لا توجد اقتراحات بعد')).toBeInTheDocument();
    });
  });

  it('shows an error toast when the deletion fails and keeps the suggestion', async () => {
    mockedListSuggestions.mockResolvedValue([suggestion]);
    mockedDeleteSuggestion.mockRejectedValue(new Error('حدث خطأ في الخادم'));
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'حذف' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'حذف' }),
    );

    await waitFor(() => {
      expect(mockedDeleteSuggestion).toHaveBeenCalledWith('s1');
    });
    expect(
      useAppStore.getState().notifications.map((n) => n.message),
    ).toContain('حدث خطأ في الخادم');
    expect(screen.getByText('أحمد محمد')).toBeInTheDocument();
  });
});