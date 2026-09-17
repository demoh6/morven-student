import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';

vi.mock('@/pages/auth/authApi', () => ({
  resetPassword: vi.fn(),
}));

import { resetPassword } from '@/pages/auth/authApi';

const mockedResetPassword = vi.mocked(resetPassword);

function renderPage(initialPath = '/reset-password') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResetPassword.mockResolvedValue({ message: 'تم إعادة تعيين كلمة المرور بنجاح' });
  });

  it('reads the token from the URL and submits the new password', async () => {
    const token = 'reset-token-from-url';
    renderPage(`/reset-password?token=${token}`);

    fireEvent.change(screen.getByLabelText(/كلمة المرور الجديدة/), {
      target: { value: 'new-secret-123' },
    });
    fireEvent.change(screen.getByLabelText(/تأكيد كلمة المرور/), {
      target: { value: 'new-secret-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /إعادة تعيين كلمة المرور/ }));

    await waitFor(() => {
      expect(mockedResetPassword).toHaveBeenCalledWith(token, 'new-secret-123');
    });
    expect(screen.getByText('تم إعادة تعيين كلمة المرور بنجاح')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /تسجيل الدخول/ })).toBeInTheDocument();
  });

  it('shows an error when the two passwords do not match', async () => {
    renderPage('/reset-password?token=r1');

    fireEvent.change(screen.getByLabelText(/كلمة المرور الجديدة/), {
      target: { value: 'new-secret-123' },
    });
    fireEvent.change(screen.getByLabelText(/تأكيد كلمة المرور/), {
      target: { value: 'different-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /إعادة تعيين كلمة المرور/ }));

    await waitFor(() => {
      expect(screen.getByText('كلمتا المرور غير متطابقتين')).toBeInTheDocument();
    });
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it('shows an error when the new password is shorter than 8 characters', async () => {
    renderPage('/reset-password?token=r1');

    fireEvent.change(screen.getByLabelText(/كلمة المرور الجديدة/), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByLabelText(/تأكيد كلمة المرور/), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /إعادة تعيين كلمة المرور/ }));

    await waitFor(() => {
      expect(screen.getByText('كلمة المرور يجب أن تكون 8 أحرف على الأقل')).toBeInTheDocument();
    });
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it('shows an invalid-link message when no token is present in the URL', () => {
    renderPage('/reset-password');
    expect(
      screen.getByText(/رابط إعادة التعيين غير صالح أو منتهي الصلاحية/),
    ).toBeInTheDocument();
  });

  it('surfaces the backend error message when reset fails', async () => {
    mockedResetPassword.mockRejectedValue(new Error('رمز إعادة التعيين غير صالح'));
    renderPage('/reset-password?token=bad-token');

    fireEvent.change(screen.getByLabelText(/كلمة المرور الجديدة/), {
      target: { value: 'new-secret-123' },
    });
    fireEvent.change(screen.getByLabelText(/تأكيد كلمة المرور/), {
      target: { value: 'new-secret-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /إعادة تعيين كلمة المرور/ }));

    await waitFor(() => {
      expect(screen.getByText('رمز إعادة التعيين غير صالح')).toBeInTheDocument();
    });
    expect(screen.queryByText('تم إعادة تعيين كلمة المرور بنجاح')).not.toBeInTheDocument();
  });
});
