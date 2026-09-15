import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminDhikrSubmissionsPage from '@/pages/admin/AdminDhikrSubmissionsPage';
import { useAppStore } from '@/store/useAppStore';
import { ADHKARS } from '@/pages/tools/GeneralTools/Adhkar/adhkar';
import type { AdminDhikrSubmission } from '@/pages/tools/GeneralTools/Adhkar/adhkarApi';

vi.mock('@/pages/tools/GeneralTools/Adhkar/adhkarApi', () => ({
  listDhikrSubmissions: vi.fn(),
  approveDhikrSubmission: vi.fn(),
  rejectDhikrSubmission: vi.fn(),
  deleteDhikrSubmission: vi.fn(),
  fetchApprovedAdhkar: vi.fn(),
  submitDhikrSubmission: vi.fn(),
}));

import {
  listDhikrSubmissions,
  approveDhikrSubmission,
  rejectDhikrSubmission,
  deleteDhikrSubmission,
} from '@/pages/tools/GeneralTools/Adhkar/adhkarApi';
const mockedList = vi.mocked(listDhikrSubmissions);
const mockedApprove = vi.mocked(approveDhikrSubmission);
const mockedReject = vi.mocked(rejectDhikrSubmission);
const mockedDelete = vi.mocked(deleteDhikrSubmission);

function baseSubmission(overrides: Partial<AdminDhikrSubmission> = {}): AdminDhikrSubmission {
  return {
    id: 's1',
    userId: 'u1',
    categoryId: 'morning-evening',
    title: 'ذكر مقترح',
    text: 'نص الذكر المقترح',
    source: 'مصدر مقترح',
    status: 'PENDING',
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
    user: {
      id: 'u1',
      email: 'ahmed@example.com',
      username: 'ahmed_m',
      displayName: 'أحمد محمد',
      avatarUrl: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ notifications: [] });
  mockedList.mockResolvedValue([]);
  mockedApprove.mockResolvedValue({ ...baseSubmission(), status: 'APPROVED' });
  mockedReject.mockResolvedValue({ ...baseSubmission(), status: 'REJECTED' });
});

function toasts() {
  return useAppStore.getState().notifications.map((n) => n.message);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminDhikrSubmissionsPage />
    </MemoryRouter>,
  );
}

describe('AdminDhikrSubmissionsPage', () => {
  it('renders submissions with user info, category, status and actions', async () => {
    mockedList.mockResolvedValue([baseSubmission()]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('أحمد محمد')).toBeInTheDocument();
    });
    expect(screen.getByText('ahmed@example.com')).toBeInTheDocument();
    expect(screen.getByText('ذكر مقترح')).toBeInTheDocument();
    expect(screen.getByText('نص الذكر المقترح')).toBeInTheDocument();
    expect(screen.getByText(/القسم: أذكار الصباح والمساء/)).toBeInTheDocument();
    expect(screen.getByText(/المصدر: مصدر مقترح/)).toBeInTheDocument();
    expect(screen.getByText('قيد المراجعة')).toBeInTheDocument();

    const approve = screen.getByRole('button', { name: 'قبول' });
    const reject = screen.getByRole('button', { name: 'رفض' });
    expect(approve).toBeInTheDocument();
    expect(reject).toBeInTheDocument();
  });

  it('approves a pending submission and toasts success', async () => {
    mockedList.mockResolvedValue([baseSubmission()]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'قبول' })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'قبول' }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith('s1');
    });
    expect(toasts()).toContain('تم اعتماد الذكر وسيظهر في القسم');
    // The row now shows the approved state instead of the action buttons.
    await waitFor(() => {
      expect(screen.getByText('تمت الموافقة على هذا الذكر وهو ظاهر في القسم.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'قبول' })).not.toBeInTheDocument();
  });

  it('rejects a pending submission and toasts the user-notification result', async () => {
    mockedList.mockResolvedValue([baseSubmission()]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'رفض' })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'رفض' }));

    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith('s1');
    });
    expect(toasts()).toContain('تم رفض الذكر وإشعار المستخدم بذلك');
    await waitFor(() => {
      expect(screen.getByText('تم رفض هذا الذكر وإشعار المستخدم بذلك.')).toBeInTheDocument();
    });
  });

  it('skips actions for already-approved submissions (no duplicate publishing)', async () => {
    mockedList.mockResolvedValue([baseSubmission({ status: 'APPROVED' })]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('تمت الموافقة على هذا الذكر وهو ظاهر في القسم.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'قبول' })).not.toBeInTheDocument();
    expect(mockedApprove).not.toHaveBeenCalled();
  });

  it('warns about a submission that duplicates an official adhkar', async () => {
    // Use the exact text of a bundled official dhikr to trigger the warning.
    mockedList.mockResolvedValue([
      baseSubmission({
        id: 'dup1',
        title: ADHKARS[0].title ?? 'نسخة',
        text: ADHKARS[0].text,
      }),
    ]);
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText(/قد يكون مكرراً/),
      ).toBeInTheDocument();
    });
  });

  it('does not flag unique submissions as duplicates', async () => {
    mockedList.mockResolvedValue([baseSubmission()]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('ذكر مقترح')).toBeInTheDocument();
    });
    expect(screen.queryByText(/قد يكون مكرراً/)).not.toBeInTheDocument();
  });

  it('renders an empty state when there are no submissions', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('لا توجد أذكار مقدمة بعد')).toBeInTheDocument();
    });
  });

  it('shows an error banner when listing fails', async () => {
    mockedList.mockRejectedValue(new Error('حدث خطأ في الخادم'));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('حدث خطأ في الخادم')).toBeInTheDocument();
    });
  });

  it('shows a delete action for rejected submissions', async () => {
    mockedList.mockResolvedValue([baseSubmission({ status: 'REJECTED' })]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
    });
    expect(
      screen.getByText('تم رفض هذا الذكر وإشعار المستخدم بذلك.'),
    ).toBeInTheDocument();
  });

  it('asks for confirmation before permanently deleting a rejected dhikr', async () => {
    mockedList.mockResolvedValue([baseSubmission({ status: 'REJECTED' })]);
    mockedDelete.mockResolvedValue();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'حذف' }));

    expect(
      screen.getByText('هل أنت متأكد من حذف هذا الذكر نهائياً؟ لا يمكن التراجع عن هذا الإجراء.'),
    ).toBeInTheDocument();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('deletes a rejected dhikr after confirmation and removes it from the list', async () => {
    mockedList.mockResolvedValue([baseSubmission({ status: 'REJECTED' })]);
    mockedDelete.mockResolvedValue();
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
      expect(mockedDelete).toHaveBeenCalledWith('s1');
    });
    expect(toasts()).toContain('تم حذف الذكر نهائياً');
    await waitFor(() => {
      expect(screen.getByText('لا توجد أذكار مقدمة بعد')).toBeInTheDocument();
    });
  });

  it('shows an error toast when the deletion fails and keeps the submission', async () => {
    mockedList.mockResolvedValue([baseSubmission({ status: 'REJECTED' })]);
    mockedDelete.mockRejectedValue(new Error('حدث خطأ في الخادم'));
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
      expect(mockedDelete).toHaveBeenCalledWith('s1');
    });
    expect(toasts()).toContain('حدث خطأ في الخادم');
    expect(screen.getByText('ذكر مقترح')).toBeInTheDocument();
  });

  it('does not show a delete action for pending submissions', async () => {
    mockedList.mockResolvedValue([baseSubmission()]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'قبول' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'حذف' })).not.toBeInTheDocument();
  });
});