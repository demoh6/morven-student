import { create } from 'zustand';
import type { PdfTemplateDefinition, TemplateFieldDefinition, TemplateStatus } from '../model';

export type { TemplateStatus } from '../model';

/**
 * Admin templates are kept in memory for Phase 2. `pdfBytes` holds the
 * unmodified original PDF (the source of truth) so it can be handed to the
 * apply engine later; serialization to the Phase 3 API is provided by
 * toSerializablePdfTemplate().
 */
export interface AdminPortfolioTemplate {
  id: string;
  name: string;
  universityId: string;
  batchId: string;
  subjectId: string;
  kind: string;
  status: TemplateStatus;
  pdfName: string;
  pdfBytes: Uint8Array | null;
  fields: TemplateFieldDefinition[];
  createdAt: number;
}

interface AdminState {
  templates: AdminPortfolioTemplate[];
  add: (template: AdminPortfolioTemplate) => void;
  update: (id: string, patch: Partial<AdminPortfolioTemplate>) => void;
  remove: (id: string) => void;
  setStatus: (id: string, status: TemplateStatus) => void;
}

// Phase 2 has no PDF persistence yet: seeds keep their field definitions but
// the original PDF bytes must be (re)uploaded before the template can be used.
const seedTemplates: AdminPortfolioTemplate[] = [
  {
    id: 'admin-tpl-najah-civil',
    name: 'الهندسة المدنية — مشروع التخرج',
    universityId: 'u-najah',
    batchId: 'u-najah-4',
    subjectId: 's-najah-civil',
    kind: 'مشروع تخرج',
    status: 'published',
    pdfName: '',
    pdfBytes: null,
    createdAt: Date.now() - 86400000 * 12,
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
    status: 'draft',
    pdfName: '',
    pdfBytes: null,
    createdAt: Date.now() - 86400000 * 3,
    fields: [
      { id: 'f-name', label: 'اسم الطالب (ثلاثي)', type: 'TEXT', page: 1, x: 45, y: 270, width: 120, height: 13, defaultValue: 'سارة خالد الحلبي', required: true, originalText: 'سارة خالد الحلبي' },
      { id: 'f-id', label: 'الرقم الجامعي', type: 'TEXT', page: 1, x: 45, y: 300, width: 100, height: 13, defaultValue: '', required: true },
    ],
  },
];

let adminIdCounter = 0;
export function nextAdminTemplateId(): string {
  return `admin-tpl-${++adminIdCounter}-${Date.now()}`;
}

export function toPdfTemplateDefinition(t: AdminPortfolioTemplate): PdfTemplateDefinition {
  return {
    schema: 'morven-portfolio-pdf-template.v1',
    templateId: t.id,
    name: t.name,
    universityId: t.universityId,
    batchId: t.batchId,
    subjectId: t.subjectId,
    kind: t.kind,
    status: t.status,
    pdfName: t.pdfName,
    pdfBytes: t.pdfBytes ?? new Uint8Array(0),
    fields: t.fields,
    createdAt: t.createdAt,
    updatedAt: Date.now(),
  };
}

export const usePortfolioAdminStore = create<AdminState>((set) => ({
  templates: seedTemplates,

  add: (template) =>
    set((state) => ({ templates: [template, ...state.templates] })),

  update: (id, patch) =>
    set((state) => ({
      templates: state.templates.map((t) => (t.id === id ? { ...t, ...patch, id } : t)),
    })),

  remove: (id) =>
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) })),

  setStatus: (id, status) =>
    set((state) => ({
      templates: state.templates.map((t) => (t.id === id ? { ...t, status } : t)),
    })),
}));