import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PortfolioBuilder from './PortfolioBuilder';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import type { AuthUser } from '@/pages/auth/authApi';
import { ROLE_USER } from '@/pages/auth/roles';
import { usePortfolioAdminStore, type AdminPortfolioTemplate } from './admin/usePortfolioAdminStore';
import { loadPdfDocument, getPageLayout, renderPageToCanvas, type PdfDocProxy } from './services/pdfjs';

vi.mock('./services/pdfjs', () => ({
  loadPdfDocument: vi.fn(),
  destroyPdfDocument: vi.fn(),
  getPageLayout: vi.fn(),
  renderPageToCanvas: vi.fn(),
  getPageTextItems: vi.fn(),
}));

const A4 = { width: 595.28, height: 841.89, cssWidth: 595.28, cssHeight: 841.89 };

function loggedInStudent(): AuthUser {
  return {
    id: 'u-student',
    email: 'student@example.com',
    username: 'student',
    displayName: 'طالب',
    role: ROLE_USER,
    avatarUrl: null,
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

function renderBuilder() {
  return render(
    <MemoryRouter>
      <PortfolioBuilder />
    </MemoryRouter>,
  );
}

describe('PortfolioBuilder student flow', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: loggedInStudent(), initialized: true, loading: false });
    usePortfolioAdminStore.setState({ templates: [] });
    vi.mocked(loadPdfDocument).mockResolvedValue({ numPages: 1 } as unknown as PdfDocProxy);
    vi.mocked(getPageLayout).mockResolvedValue(A4);
    vi.mocked(renderPageToCanvas).mockResolvedValue(A4);
  });

  it('shows the landing screen before the user starts', () => {
    renderBuilder();
    expect(screen.getByText('أنشئ ملف ال Portfolio بسهولة وسرعة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ابدأ الإنشاء' })).toBeInTheDocument();
  });

  it('walks through university → batch → subject and live-updates the preview while editing', async () => {
    renderBuilder();

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ الإنشاء' }));
    expect(screen.getByText('اختر جامعتك')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /جامعة النجاح الوطنية/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));

    expect(screen.getByText('اختر دفعتك')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /السنة الثالثة/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));

    expect(screen.getByText('اختر المقرر الدراسي')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /الهندسة المدنية/ }));
    fireEvent.click(screen.getByRole('button', { name: /انتقل إلى التحرير/ }));

    // Editor opens with grouped sections.
    expect(screen.getByText('الجامعة والمقرر')).toBeInTheDocument();
    expect(screen.getAllByText('معلومات الطالب').length).toBeGreaterThan(0);

    // Required "student photo" missing ⇒ continue disabled.
    const continueBtn = screen.getByRole('button', { name: /متابعة إلى التصدير/ });
    expect(continueBtn).toBeDisabled();

    // Upload a photo so the document becomes export-ready.
    const photoInput = screen.getByLabelText('الصورة الشخصية');
    fireEvent.change(photoInput, { target: { files: [new File(['photobytes'], 'photo.png', { type: 'image/png' })] } });
    await waitFor(() => expect(continueBtn).toBeEnabled());

    // Changing a field reflects instantly in the live preview.
    const nameInput = screen.getByDisplayValue('أحمد محمد النجار');
    fireEvent.change(nameInput, { target: { value: 'محمد سامي عيد' } });
    expect(screen.getAllByText('محمد سامي عيد').length).toBeGreaterThan(0);

    // Export step: mock only, explains next-phase availability.
    fireEvent.click(continueBtn);
    expect(screen.getByText('تصدير الملف')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /تحميل PDF/ }));
    expect(screen.getByText('التصدير متاح في المرحلة القادمة')).toBeInTheDocument();
  });

  it('offers reset buttons only after the field deviates from the document default', () => {
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ الإنشاء' }));

    fireEvent.click(screen.getByRole('button', { name: /جامعة بيرزيت/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));
    fireEvent.click(screen.getByRole('button', { name: /السنة الثانية/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));
    fireEvent.click(screen.getByRole('button', { name: /الصيدلة/ }));
    fireEvent.click(screen.getByRole('button', { name: /انتقل إلى التحرير/ }));

    expect(screen.queryByText('إعادة النص الأصلي')).not.toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('أحمد محمد النجار');
    fireEvent.change(nameInput, { target: { value: 'اسم مختلف' } });
    expect(screen.getAllByText('إعادة النص الأصلي').length).toBeGreaterThan(0);
  });
});

function walkNajahCivil() {
  fireEvent.click(screen.getByRole('button', { name: 'ابدأ الإنشاء' }));
  fireEvent.click(screen.getByRole('button', { name: /جامعة النجاح الوطنية/ }));
  fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));
  fireEvent.click(screen.getByRole('button', { name: /السنة الثالثة/ }));
  fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));
  fireEvent.click(screen.getByRole('button', { name: /الهندسة المدنية/ }));
  fireEvent.click(screen.getByRole('button', { name: /انتقل إلى التحرير/ }));
}

const publishedAdminTemplate: AdminPortfolioTemplate = {
  id: 'admin-tpl-real',
  name: 'قالب حقيقي',
  universityId: 'u-najah',
  batchId: 'u-najah-3',
  subjectId: 's-najah-civil',
  kind: 'مشروع تخرج',
  status: 'published',
  pdfName: 'real.pdf',
  pdfBytes: new Uint8Array([1, 2, 3]),
  createdAt: 1,
  fields: [
    { id: 'f-name', label: 'اسم الطالب', type: 'TEXT', page: 1, x: 40, y: 100, width: 200, height: 16, defaultValue: 'خالد', required: true },
    { id: 'f-photo', label: 'الصورة الشخصية', type: 'IMAGE', page: 1, x: 400, y: 100, width: 90, height: 110, defaultValue: '', required: false },
  ],
};

describe('PortfolioBuilder with an admin-uploaded PDF template', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: loggedInStudent(), initialized: true, loading: false });
    vi.mocked(loadPdfDocument).mockResolvedValue({ numPages: 1 } as unknown as PdfDocProxy);
    vi.mocked(getPageLayout).mockResolvedValue(A4);
    vi.mocked(renderPageToCanvas).mockResolvedValue(A4);
  });

  it('renders the real PDF template instead of the mock document for the student', async () => {
    usePortfolioAdminStore.setState({ templates: [publishedAdminTemplate] });
    renderBuilder();
    walkNajahCivil();

    // The Phase 1 mock document is NOT rendered when a real template exists.
    expect(screen.queryByText(/مقدّم إلى مؤسسة/)).not.toBeInTheDocument();

    // The admin-defined field labels drive the student form.
    expect(screen.getAllByText(/اسم الطالب/).length).toBeGreaterThan(0);

    // The default value is painted inside the PDF region overlay.
    await waitFor(() => expect(screen.getAllByText('خالد').length).toBeGreaterThan(0));

    // Editing updates the PDF overlay live (the loaded document is not reloaded).
    const nameInput = screen.getByDisplayValue('خالد');
    fireEvent.change(nameInput, { target: { value: 'محمد سامي' } });
    await waitFor(() => expect(screen.getAllByText('محمد سامي').length).toBeGreaterThan(0));
  });

  it('shows an uploaded student image inside the admin-defined PDF region', async () => {
    usePortfolioAdminStore.setState({ templates: [publishedAdminTemplate] });
    renderBuilder();
    walkNajahCivil();

    fireEvent.change(screen.getByLabelText('الصورة الشخصية'), {
      target: { files: [new File(['img'], 'p.png', { type: 'image/png' })] },
    });

    // One <img> in the form control, one in the PDF overlay.
    await waitFor(() => expect(screen.getAllByAltText('الصورة الشخصية').length).toBeGreaterThanOrEqual(2));
  });
});
