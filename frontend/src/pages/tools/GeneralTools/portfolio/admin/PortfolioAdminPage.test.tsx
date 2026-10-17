import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PortfolioAdminPage from './PortfolioAdminPage';
import type { MockBatch, MockSubject, MockUniversity } from '../types';
import type { AdminPortfolioTemplate } from './usePortfolioAdminStore';
import { usePortfolioCatalogStore } from '../data/catalog';
import { usePortfolioAdminStore } from './usePortfolioAdminStore';
import { listPortfolioTemplates, createPortfolioTemplate, updatePortfolioTemplate } from '../api/portfolioApi';

vi.mock('../api/portfolioApi', () => ({
  fetchCatalog: vi.fn(),
  fetchPublishedTemplate: vi.fn(),
  listPortfolioTemplates: vi.fn(),
  createPortfolioTemplate: vi.fn(),
  updatePortfolioTemplate: vi.fn(),
  setPortfolioTemplateStatus: vi.fn(),
  deletePortfolioTemplate: vi.fn(),
}));

const najah: MockUniversity = { id: 'u-najah', name: 'جامعة النجاح الوطنية', nameEn: 'An-Najah', city: 'نابلس', shortCode: 'نج', color: '#1b5e20', established: 1977, students: '22,000+' };
const birzeit: MockUniversity = { id: 'u-birzeit', name: 'جامعة بيرزيت', nameEn: 'Birzeit', city: 'بيرزيت', shortCode: 'ب', color: '#0d47a1', established: 1924, students: '14,000+' };
const ppu: MockUniversity = { id: 'u-ppu', name: 'جامعة بوليتكنك فلسطين', nameEn: 'PPU', city: 'الخليل', shortCode: 'بو', color: '#e65100', established: 1978, students: '9,000+' };

const batchNajah4: MockBatch = { id: 'u-najah-4', universityId: 'u-najah', label: 'السنة الرابعة', order: 4, academicYears: '2022/2023', description: 'مرحلة التخرج' };
const batchPpu4: MockBatch = { id: 'u-ppu-4', universityId: 'u-ppu', label: 'السنة الرابعة', order: 4, academicYears: '2022/2023', description: 'مرحلة التخرج' };
const batchBirzeit2: MockBatch = { id: 'u-birzeit-2', universityId: 'u-birzeit', label: 'السنة الثانية', order: 2, academicYears: '2024/2025', description: 'التعمق في التخصص' };

const najahCivil: MockSubject = { id: 's-najah-civil', universityId: 'u-najah', batchIds: ['u-najah-4'], name: 'الهندسة المدنية', code: 'CIV', description: 'تصميم المنشآت', portfolioKind: 'مشروع تخرج' };
const ppuMechatronics: MockSubject = { id: 's-ppu-mechatronics', universityId: 'u-ppu', batchIds: ['u-ppu-4'], name: 'هندسة الميكاترونكس', code: 'MCT', description: 'دمج التخصصات', portfolioKind: 'مشروع تخرج' };
const birzeitPharm: MockSubject = { id: 's-birz-pharm', universityId: 'u-birzeit', batchIds: ['u-birzeit-2'], name: 'الصيدلة', code: 'PHR', description: 'العلوم الدوائية', portfolioKind: 'ملف إنجاز' };

const seededTemplates: AdminPortfolioTemplate[] = [
  {
    id: 'admin-tpl-najah-civil',
    name: 'الهندسة المدنية — مشروع التخرج',
    universityId: 'u-najah',
    batchId: 'u-najah-4',
    subjectId: 's-najah-civil',
    kind: 'مشروع تخرج',
    specialty: 'الهندسة المدنية',
    status: 'published',
    pdfName: '',
    pdfBytes: null,
    createdAt: 1,
    fields: [
      { id: 'f-name', label: 'اسم الطالب (ثلاثي)', type: 'TEXT', page: 1, x: 45, y: 270, width: 120, height: 13, defaultValue: 'أحمد محمد النجار', required: true, originalText: 'أحمد محمد النجار' },
      { id: 'f-id', label: 'الرقم الجامعي', type: 'TEXT', page: 1, x: 45, y: 300, width: 100, height: 13, defaultValue: '12234567', required: true, originalText: '12234567' },
      { id: 'f-photo', label: 'الصورة الشخصية', type: 'IMAGE', page: 1, x: 480, y: 255, width: 70, height: 95, defaultValue: '', required: true },
      { id: 'f-intro', label: 'المقدمة', type: 'TEXTAREA', page: 1, x: 45, y: 370, width: 500, height: 70, defaultValue: '', required: true },
    ],
  },
  {
    id: 'admin-tpl-ppu-mechatronics',
    name: 'الميكاترونكس — مشروع التخرج',
    universityId: 'u-ppu',
    batchId: 'u-ppu-4',
    subjectId: 's-ppu-mechatronics',
    kind: 'مشروع تخرج',
    specialty: 'هندسة الميكاترونكس',
    status: 'draft',
    pdfName: '',
    pdfBytes: null,
    createdAt: 2,
    fields: [
      { id: 'f-name', label: 'اسم الطالب (ثلاثي)', type: 'TEXT', page: 1, x: 45, y: 270, width: 120, height: 13, defaultValue: 'سارة خالد الحلبي', required: true, originalText: 'سارة خالد الحلبي' },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  usePortfolioAdminStore.setState({ templates: [], loaded: false, loading: false, error: null });
  usePortfolioCatalogStore.setState({
    universities: [najah, birzeit, ppu],
    batches: [batchNajah4, batchPpu4, batchBirzeit2],
    subjects: [najahCivil, ppuMechatronics, birzeitPharm],
    loaded: true,
    loading: false,
    error: null,
  });

  vi.mocked(listPortfolioTemplates).mockResolvedValue(seededTemplates);
  vi.mocked(createPortfolioTemplate).mockImplementation(async (payload) => ({
    id: 'new-template-1',
    name: payload.name,
    universityId: payload.universityId,
    batchId: payload.batchId,
    subjectId: payload.subjectId,
    kind: payload.kind,
    specialty: payload.specialty ?? '',
    status: payload.status,
    pdfName: payload.pdfName,
    pdfBytes: payload.pdfBytes,
    fields: payload.fields,
    createdAt: Date.now(),
  }));
  vi.mocked(updatePortfolioTemplate).mockImplementation(async (id, payload) => ({
    ...seededTemplates[0],
    id,
    ...payload,
    specialty: payload.specialty ?? '',
  }));
});

describe('PortfolioAdminPage template manager', () => {
  it('renders the templates loaded from the API on the dashboard', async () => {
    render(<PortfolioAdminPage />);
    expect(screen.getByText('مدير قوالب الملفات الجامعية')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('الهندسة المدنية — مشروع التخرج')).toBeInTheDocument());
    expect(screen.getByText('منشور')).toBeInTheDocument();
  });

  it('opens the PDF template editor from a row', async () => {
    render(<PortfolioAdminPage />);
    await waitFor(() => expect(screen.getByText('الهندسة المدنية — مشروع التخرج')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /تعديل/ })[0]);

    // The real PDF editor: metadata header + upload-first workflow (no PDF yet).
    expect(screen.getByText('اسم القالب')).toBeInTheDocument();
    expect(screen.getByText('ارفع الملف الأصلي (PDF)')).toBeInTheDocument();
    expect(screen.getByText('بدون ملف')).toBeInTheDocument();
    expect(screen.getByText('4 حقول')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ القالب' })).toBeInTheDocument();
  });

  it('creates a new template through the wizard and reaches the PDF editor', async () => {
    render(<PortfolioAdminPage />);
    await waitFor(() => expect(screen.getByText('الهندسة المدنية — مشروع التخرج')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء قالب جديد' }));

    // University
    expect(screen.getByText('اختر الجامعة')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /جامعة بيرزيت/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));

    // Batch
    expect(screen.getByText('اختر الدفعة')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /السنة الثانية/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));

    // Subject → continue to the original document
    expect(screen.getByText('اختر المقرر')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /الصيدلة/ }));
    fireEvent.click(screen.getByRole('button', { name: /الانتقال إلى المستند الأصلي/ }));

    // The PDF editor is shown with the upload-first workflow.
    expect(screen.getByText('ارفع الملف الأصلي (PDF)')).toBeInTheDocument();
    expect(screen.getByText('0 حقول')).toBeInTheDocument();

    // Save returns to the dashboard and lists the new template.
    fireEvent.click(screen.getByRole('button', { name: 'حفظ القالب' }));
    await waitFor(() => expect(screen.getByText('الصيدلة — ملف إنجاز')).toBeInTheDocument());
  });

  it('keeps the selected batch and subject highlighted while walking the wizard', async () => {
    render(<PortfolioAdminPage />);
    await waitFor(() => expect(screen.getByText('الهندسة المدنية — مشروع التخرج')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء قالب جديد' }));

    fireEvent.click(screen.getByRole('button', { name: /جامعة بيرزيت/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));

    const batch = screen.getByRole('button', { name: /السنة الثانية/ });
    fireEvent.click(batch);
    expect(batch.className).toContain('ring-2');

    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));

    const subject = screen.getByRole('button', { name: /الصيدلة/ });
    fireEvent.click(subject);
    expect(subject.className).toContain('ring-2');
  });

  it('loads the template specialty when reopening it for editing', async () => {
    render(<PortfolioAdminPage />);
    await waitFor(() => expect(screen.getByText('الهندسة المدنية — مشروع التخرج')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /تعديل/ })[0]);

    expect(screen.getByLabelText('التخصص')).toHaveValue('الهندسة المدنية');
  });

  it('saves an edited specialty back to the template', async () => {
    render(<PortfolioAdminPage />);
    await waitFor(() => expect(screen.getByText('الهندسة المدنية — مشروع التخرج')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /تعديل/ })[0]);

    fireEvent.change(screen.getByLabelText('التخصص'), { target: { value: 'طب الأطفال' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ القالب' }));

    await waitFor(() => expect(updatePortfolioTemplate).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updatePortfolioTemplate).mock.calls[0][1].specialty).toBe('طب الأطفال');
  });

  it('creates a template with a specialty through the wizard', async () => {
    render(<PortfolioAdminPage />);
    await waitFor(() => expect(screen.getByText('الهندسة المدنية — مشروع التخرج')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء قالب جديد' }));

    fireEvent.click(screen.getByRole('button', { name: /جامعة بيرزيت/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));
    fireEvent.click(screen.getByRole('button', { name: /السنة الثانية/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));
    fireEvent.click(screen.getByRole('button', { name: /الصيدلة/ }));
    fireEvent.click(screen.getByRole('button', { name: /الانتقال إلى المستند الأصلي/ }));

    fireEvent.change(screen.getByLabelText('التخصص'), { target: { value: 'الجراحة العامة' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ القالب' }));

    await waitFor(() => expect(createPortfolioTemplate).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPortfolioTemplate).mock.calls[0][0].specialty).toBe('الجراحة العامة');
  });
});
