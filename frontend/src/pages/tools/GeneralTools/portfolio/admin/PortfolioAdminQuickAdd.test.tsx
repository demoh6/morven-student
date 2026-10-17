import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PortfolioAdminPage from './PortfolioAdminPage';
import type { MockBatch, MockSubject, MockUniversity } from '../types';
import { usePortfolioCatalogStore } from '../data/catalog';
import { usePortfolioAdminStore } from './usePortfolioAdminStore';
import {
  createAdminCohort,
  createAdminCourse,
  createAdminUniversity,
  fetchCatalog,
  listPortfolioTemplates,
} from '../api/portfolioApi';

vi.mock('../api/portfolioApi', () => ({
  fetchCatalog: vi.fn(),
  fetchPublishedTemplate: vi.fn(),
  listPortfolioTemplates: vi.fn(),
  createPortfolioTemplate: vi.fn(),
  updatePortfolioTemplate: vi.fn(),
  setPortfolioTemplateStatus: vi.fn(),
  deletePortfolioTemplate: vi.fn(),
  createAdminUniversity: vi.fn(),
  createAdminCohort: vi.fn(),
  createAdminCourse: vi.fn(),
}));

const najah: MockUniversity = { id: 'u-najah', name: 'جامعة النجاح الوطنية', nameEn: 'An-Najah', city: 'نابلس', shortCode: 'نج', color: '#1b5e20', established: 1977, students: '22,000+' };
const batchNajah4: MockBatch = { id: 'u-najah-4', universityId: 'u-najah', label: 'السنة الرابعة', order: 4, academicYears: '2022/2023', description: 'مرحلة التخرج' };
const najahCivil: MockSubject = { id: 's-najah-civil', universityId: 'u-najah', batchIds: ['u-najah-4'], name: 'الهندسة المدنية', code: 'CIV', description: 'تصميم المنشآت', portfolioKind: 'مشروع تخرج' };

let universities: MockUniversity[] = [];
let batches: MockBatch[] = [];
let subjects: MockSubject[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  universities = [najah];
  batches = [batchNajah4];
  subjects = [najahCivil];

  usePortfolioCatalogStore.setState({
    universities,
    batches,
    subjects,
    loaded: true,
    loading: false,
    error: null,
  });
  usePortfolioAdminStore.setState({ templates: [], loaded: false, loading: false, error: null });

  vi.mocked(listPortfolioTemplates).mockResolvedValue([]);
  vi.mocked(fetchCatalog).mockImplementation(async () => ({
    universities,
    batches,
    subjects,
  }));
  vi.mocked(createAdminUniversity).mockImplementation(async (payload) => {
    const created: MockUniversity = {
      id: 'u-new',
      name: payload.name,
      nameEn: payload.nameEn ?? '',
      city: payload.city ?? '',
      shortCode: payload.shortCode ?? '',
      color: payload.color ?? '#1b5e20',
      established: payload.established ?? 2026,
      students: payload.students ?? '',
    };
    universities = [...universities, created];
    return created;
  });
  vi.mocked(createAdminCohort).mockImplementation(async (payload) => {
    const created: MockBatch = {
      id: 'b-new',
      universityId: payload.universityId,
      label: payload.label,
      order: payload.order,
      academicYears: payload.academicYears,
      description: payload.description ?? '',
    };
    batches = [...batches, created];
    return created;
  });
  vi.mocked(createAdminCourse).mockImplementation(async (payload) => {
    const created: MockSubject = {
      id: 's-new',
      universityId: payload.universityId,
      batchIds: payload.batchIds,
      name: payload.name,
      code: payload.code ?? undefined,
      description: payload.description,
      portfolioKind: payload.portfolioKind,
    };
    subjects = [...subjects, created];
    return created;
  });
});

async function startWizard() {
  render(<PortfolioAdminPage />);
  await waitFor(() => expect(screen.getByText('إنشاء قالب جديد')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'إنشاء قالب جديد' }));
  expect(screen.getByText('اختر الجامعة')).toBeInTheDocument();
}

describe('Portfolio admin inline catalog creation', () => {
  it('creates a university from the wizard and auto-selects it, then moves to cohorts', async () => {
    await startWizard();

    fireEvent.click(screen.getByRole('button', { name: /إضافة جامعة جديدة/ }));
    expect(screen.getByText('إضافة جامعة')).toBeInTheDocument();

    // The university form was simplified to only the name field.
    expect(screen.getByLabelText(/اسم الجامعة/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/المدينة/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/الرمز المختصر/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/سنة التأسيس/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/عدد الطلاب/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/اسم الجامعة/), { target: { value: 'جامعة رام الله' } });

    fireEvent.click(screen.getByRole('button', { name: 'إضافة الجامعة' }));

    await waitFor(() => expect(createAdminUniversity).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createAdminUniversity).mock.calls[0][0]).toEqual({ name: 'جامعة رام الله' });
    // Automatically advanced to the cohort step for the new university.
    await waitFor(() => expect(screen.getByText('اختر الدفعة')).toBeInTheDocument());
  });

  it('creates a cohort under the selected university from the wizard', async () => {
    await startWizard();

    fireEvent.click(screen.getByRole('button', { name: /جامعة النجاح الوطنية/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));
    expect(screen.getByText('اختر الدفعة')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /إضافة دفعة جديدة/ }));
    expect(screen.getByText('إضافة دفعة')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/اسم الدفعة/), { target: { value: 'السنة الأولى' } });
    fireEvent.change(screen.getByLabelText(/السنوات الأكاديمية/), { target: { value: '2025/2026' } });

    fireEvent.click(screen.getByRole('button', { name: 'إضافة الدفعة' }));

    await waitFor(() => expect(createAdminCohort).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createAdminCohort).mock.calls[0][0].universityId).toBe('u-najah');
    await waitFor(() => expect(screen.getByText('اختر المقرر')).toBeInTheDocument());
  });

  it('creates a course associated with the selected university and cohort', async () => {
    await startWizard();

    fireEvent.click(screen.getByRole('button', { name: /جامعة النجاح الوطنية/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));
    fireEvent.click(screen.getByRole('button', { name: /السنة الرابعة/ }));
    fireEvent.click(screen.getByRole('button', { name: /^متابعة$/ }));
    expect(screen.getByText('اختر المقرر')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /إضافة مادة جديدة/ }));
    expect(screen.getByText('إضافة مقرر')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/اسم المقرر/), { target: { value: 'علوم الحاسوب' } });

    fireEvent.click(screen.getByRole('button', { name: 'إضافة المقرر' }));

    await waitFor(() => expect(createAdminCourse).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createAdminCourse).mock.calls[0][0];
    expect(payload.universityId).toBe('u-najah');
    expect(payload.batchIds).toContain('u-najah-4');
  });

  it('exposes add-new options in the template editor for editing an existing template', async () => {
    vi.mocked(listPortfolioTemplates).mockResolvedValue([
      {
        id: 'admin-tpl-najah-civil',
        name: 'قالب النجاح',
        universityId: 'u-najah',
        batchId: 'u-najah-4',
        subjectId: 's-najah-civil',
        kind: 'مشروع تخرج',
        specialty: '',
        status: 'published',
        pdfName: '',
        pdfBytes: null,
        createdAt: 1,
        fields: [],
      },
    ]);
    render(<PortfolioAdminPage />);
    await waitFor(() => expect(screen.getByText('قالب النجاح')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /تعديل/ }));

    // The template form carries the selection fields with add-new options.
    expect(screen.getByText('الجامعة')).toBeInTheDocument();
    expect(screen.getByText('الدفعة')).toBeInTheDocument();
    expect(screen.getByText('المقرر')).toBeInTheDocument();

    const uniSelect = screen.getByDisplayValue('جامعة النجاح الوطنية');
    expect(uniSelect).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '+ إضافة جامعة جديدة' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '+ إضافة دفعة جديدة' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '+ إضافة مادة جديدة' })).toBeInTheDocument();
  });
});
