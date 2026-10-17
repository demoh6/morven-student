import { create } from 'zustand';
import type { PdfTemplateDefinition, TemplateFieldDefinition, TemplateStatus } from '../model';
import {
  listPortfolioTemplates,
  createPortfolioTemplate,
  updatePortfolioTemplate,
  setPortfolioTemplateStatus,
  deletePortfolioTemplate,
  type TemplatePayload,
} from '../api/portfolioApi';

export type { TemplateStatus } from '../model';

/**
 * Admin-authored portfolio templates. These are persisted by the backend; this
 * store is the in-app cache and API boundary. The original uploaded PDF bytes
 * are fetched with each template and mirrored in the backend (source of truth).
 */
export interface AdminPortfolioTemplate {
  id: string;
  name: string;
  universityId: string;
  batchId: string;
  subjectId: string;
  kind: string;
  specialty: string;
  status: TemplateStatus;
  pdfName: string;
  pdfBytes: Uint8Array | null;
  fields: TemplateFieldDefinition[];
  createdAt: number;
}

interface AdminState {
  templates: AdminPortfolioTemplate[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  add: (template: AdminPortfolioTemplate) => Promise<AdminPortfolioTemplate>;
  update: (id: string, patch: Partial<AdminPortfolioTemplate>) => Promise<AdminPortfolioTemplate>;
  remove: (id: string) => Promise<void>;
  setStatus: (id: string, status: TemplateStatus) => Promise<void>;
}

function toPayload(template: Partial<AdminPortfolioTemplate>): Partial<TemplatePayload> {
  const payload: Partial<TemplatePayload> = {};
  if (template.name !== undefined) payload.name = template.name;
  if (template.universityId !== undefined) payload.universityId = template.universityId;
  if (template.batchId !== undefined) payload.batchId = template.batchId;
  if (template.subjectId !== undefined) payload.subjectId = template.subjectId;
  if (template.kind !== undefined) payload.kind = template.kind;
  if (template.specialty !== undefined) payload.specialty = template.specialty;
  if (template.status !== undefined) payload.status = template.status;
  if (template.pdfName !== undefined) payload.pdfName = template.pdfName;
  if (template.pdfBytes !== undefined) payload.pdfBytes = template.pdfBytes;
  if (template.fields !== undefined) payload.fields = template.fields;
  return payload;
}

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
    specialty: t.specialty,
    status: t.status,
    pdfName: t.pdfName,
    pdfBytes: t.pdfBytes ?? new Uint8Array(0),
    fields: t.fields,
    createdAt: t.createdAt,
    updatedAt: Date.now(),
  };
}

export const usePortfolioAdminStore = create<AdminState>((set, get) => ({
  templates: [],
  loading: false,
  loaded: false,
  error: null,

  load: async (force = false) => {
    const state = get();
    if (state.loading) return;
    if (state.loaded && !force) return;

    set({ loading: true, error: null });
    try {
      const templates = await listPortfolioTemplates();
      set({ templates, loaded: true, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message || 'تعذر تحميل القوالب' });
    }
  },

  add: async (template) => {
    const created = await createPortfolioTemplate({
      name: template.name,
      universityId: template.universityId,
      batchId: template.batchId,
      subjectId: template.subjectId,
      kind: template.kind,
      specialty: template.specialty,
      status: template.status,
      pdfName: template.pdfName,
      pdfBytes: template.pdfBytes ?? null,
      fields: template.fields,
    });
    set((state) => ({ templates: [created, ...state.templates] }));
    return created;
  },

  update: async (id, patch) => {
    const updated = await updatePortfolioTemplate(id, toPayload(patch));
    set((state) => ({
      templates: state.templates.map((t) => (t.id === id ? { ...t, ...updated, id } : t)),
    }));
    return updated;
  },

  remove: async (id) => {
    await deletePortfolioTemplate(id);
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
  },

  setStatus: async (id, status) => {
    const updated = await setPortfolioTemplateStatus(id, status);
    set((state) => ({
      templates: state.templates.map((t) => (t.id === id ? { ...t, ...updated, id } : t)),
    }));
  },
}));
