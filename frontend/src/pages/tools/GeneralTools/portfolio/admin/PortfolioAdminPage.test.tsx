import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PortfolioAdminPage from './PortfolioAdminPage';

describe('PortfolioAdminPage template manager', () => {
  it('renders the seeded templates on the dashboard', () => {
    render(<PortfolioAdminPage />);
    expect(screen.getByText('مدير قوالب الملفات الجامعية')).toBeInTheDocument();
    expect(screen.getByText('الهندسة المدنية — مشروع التخرج')).toBeInTheDocument();
    expect(screen.getByText('منشور')).toBeInTheDocument();
  });

  it('opens the PDF template editor from a row', () => {
    render(<PortfolioAdminPage />);
    fireEvent.click(screen.getAllByRole('button', { name: /تعديل/ })[0]);

    // The real PDF editor: metadata header + upload-first workflow (no PDF yet).
    expect(screen.getByText('اسم القالب')).toBeInTheDocument();
    expect(screen.getByText('ارفع الملف الأصلي (PDF)')).toBeInTheDocument();
    expect(screen.getByText('بدون ملف')).toBeInTheDocument();
    expect(screen.getByText('4 حقول')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ القالب' })).toBeInTheDocument();
  });

  it('creates a new template through the wizard and reaches the PDF editor', () => {
    render(<PortfolioAdminPage />);
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
    expect(screen.getByText('الصيدلة — ملف إنجاز')).toBeInTheDocument();
  });

  it('keeps the selected batch and subject highlighted while walking the wizard', () => {
    render(<PortfolioAdminPage />);
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
});