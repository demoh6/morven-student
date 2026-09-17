import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

vi.mock('@/pages/auth/authApi', () => ({
  requestPasswordReset: vi.fn(),
}));

import { requestPasswordReset } from '@/pages/auth/authApi';

const mockedRequestPasswordReset = vi.mocked(requestPasswordReset);

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequestPasswordReset.mockResolvedValue({
      message:
        'إذا كان هذا البريد الإلكتروني مسجلاً، فستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور.',
    });
  });

  it('submits the email and shows the same generic success message for any email', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/البريد الإلكتروني/), {
      target: { value: 'student@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /إرسال رابط إعادة التعيين/ }));

    await waitFor(() => {
      expect(mockedRequestPasswordReset).toHaveBeenCalledWith('student@example.com');
    });
    // The anti-enumeration message does not reveal whether the email exists.
    expect(
      screen.getByText(/إذا كان هذا البريد الإلكتروني مسجلاً، فستصلك رسالة/),
    ).toBeInTheDocument();
    // A link back to login is shown after a successful request.
    expect(screen.getByRole('link', { name: /العودة إلى تسجيل الدخول/ })).toBeInTheDocument();
  });

  it('shows the backend error message when the request fails', async () => {
    mockedRequestPasswordReset.mockRejectedValue(new Error('حدث خطأ في الخادم'));
    renderPage();

    fireEvent.change(screen.getByLabelText(/البريد الإلكتروني/), {
      target: { value: 'student@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /إرسال رابط إعادة التعيين/ }));

    await waitFor(() => {
      expect(screen.getByText('حدث خطأ في الخادم')).toBeInTheDocument();
    });
    // No success message is shown on failure.
    expect(
      screen.queryByText(/إذا كان هذا البريد الإلكتروني مسجلاً/),
    ).not.toBeInTheDocument();
  });

  it('validates that an email is required before submitting', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /إرسال رابط إعادة التعيين/ }));

    await waitFor(() => {
      expect(mockedRequestPasswordReset).not.toHaveBeenCalled();
    });
  });

  it('links back to login', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /تسجيل الدخول/ })).toBeInTheDocument();
  });
});
