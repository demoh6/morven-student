import { authRequest } from '@/pages/auth/authApi';
import { bytesToDataUrl } from '../model';
import type { MockBatch, MockSubject, MockUniversity } from '../types';
import type { AdminPortfolioTemplate, TemplateStatus } from '../admin/usePortfolioAdminStore';
import type { TemplateFieldDefinition } from '../model';

// ---------------------------------------------------------------------------
// Portfolio Builder API client.
//
// The backend keeps the durable catalog (universities / cohorts / courses) and
// the admin PDF templates. This module is the single boundary between the
// frontend and those endpoints, mapping the API shapes onto the existing
// frontend models so the rest of the tool is unchanged.
// ---------------------------------------------------------------------------

export interface PortfolioCatalog {
  universities: MockUniversity[];
  batches: MockBatch[];
  subjects: MockSubject[];
}

interface ApiCohort {
  id: string;
  universityId: string;
  label: string;
  order: number;
  academicYears: string;
  description: string;
}

interface ApiCourse {
  id: string;
  universityId: string;
  batchIds: string[];
  name: string;
  code?: string;
  description: string;
  portfolioKind: string;
}

interface ApiTemplate {
  id: string;
  name: string;
  universityId: string;
  batchId: string;
  subjectId: string;
  kind: string;
  specialty: string | null;
  status: string;
  pdfName: string;
  pdfBytesLength: number;
  pdfDataUrl?: string | null;
  fields: TemplateFieldDefinition[];
  createdAt: number;
  updatedAt: number;
}

export interface TemplatePayload {
  name: string;
  universityId: string;
  batchId: string;
  subjectId: string;
  kind: string;
  specialty?: string | null;
  status: TemplateStatus;
  pdfName: string;
  pdfBytes: Uint8Array | null;
  fields: TemplateFieldDefinition[];
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function mapTemplate(t: ApiTemplate): AdminPortfolioTemplate {
  return {
    id: t.id,
    name: t.name,
    universityId: t.universityId,
    batchId: t.batchId,
    subjectId: t.subjectId,
    kind: t.kind,
    specialty: t.specialty ?? '',
    status: t.status === 'published' ? 'published' : 'draft',
    pdfName: t.pdfName,
    pdfBytes:
      t.pdfDataUrl && t.pdfDataUrl.length > 0
        ? dataUrlToBytes(t.pdfDataUrl)
        : t.pdfBytesLength > 0
        ? new Uint8Array(0)
        : null,
    fields: t.fields ?? [],
    createdAt: t.createdAt,
  };
}

function toApiBody(payload: TemplatePayload) {
  return {
    name: payload.name,
    universityId: payload.universityId,
    cohortId: payload.batchId,
    courseId: payload.subjectId,
    kind: payload.kind,
    specialty: payload.specialty ?? null,
    status: payload.status,
    pdfName: payload.pdfName,
    pdfDataUrl:
      payload.pdfBytes && payload.pdfBytes.length > 0 ? bytesToDataUrl(payload.pdfBytes) : null,
    fields: payload.fields,
  };
}

// ---------------------------------------------------------------------------
// Catalog (any authenticated user)
// ---------------------------------------------------------------------------

export async function fetchCatalog(): Promise<PortfolioCatalog> {
  const data = await authRequest<{
    universities: MockUniversity[];
    cohorts: ApiCohort[];
    courses: ApiCourse[];
  }>('/api/portfolio/catalog');

  return {
    universities: data.universities,
    batches: data.cohorts.map((c) => ({
      id: c.id,
      universityId: c.universityId,
      label: c.label,
      order: c.order,
      academicYears: c.academicYears,
      description: c.description,
    })),
    subjects: data.courses.map((c) => ({
      id: c.id,
      universityId: c.universityId,
      batchIds: c.batchIds,
      name: c.name,
      code: c.code,
      description: c.description,
      portfolioKind: c.portfolioKind,
    })),
  };
}

/** Published PDF template for a course, or null when none is available. */
export async function fetchPublishedTemplate(
  universityId: string,
  cohortId: string,
  courseId: string,
): Promise<AdminPortfolioTemplate | null> {
  const query = new URLSearchParams({ universityId, cohortId, courseId }).toString();
  const data = await authRequest<{ template: ApiTemplate | null }>(
    `/api/portfolio/template?${query}`,
  );
  return data.template ? mapTemplate(data.template) : null;
}

// ---------------------------------------------------------------------------
// Templates (main admin)
// ---------------------------------------------------------------------------

export async function listPortfolioTemplates(
  universityId?: string,
): Promise<AdminPortfolioTemplate[]> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : '';
  const data = await authRequest<{ templates: ApiTemplate[] }>(
    `/api/admin/portfolio/templates${query}`,
  );
  return data.templates.map(mapTemplate);
}

export async function createPortfolioTemplate(
  payload: TemplatePayload,
): Promise<AdminPortfolioTemplate> {
  const data = await authRequest<{ template: ApiTemplate }>('/api/admin/portfolio/templates', {
    method: 'POST',
    body: JSON.stringify(toApiBody(payload)),
  });
  return mapTemplate(data.template);
}

export async function updatePortfolioTemplate(
  id: string,
  payload: Partial<TemplatePayload>,
): Promise<AdminPortfolioTemplate> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.universityId !== undefined) body.universityId = payload.universityId;
  if (payload.batchId !== undefined) body.cohortId = payload.batchId;
  if (payload.subjectId !== undefined) body.courseId = payload.subjectId;
  if (payload.kind !== undefined) body.kind = payload.kind;
  if (payload.specialty !== undefined) body.specialty = payload.specialty ?? null;
  if (payload.status !== undefined) body.status = payload.status;
  if (payload.pdfName !== undefined) body.pdfName = payload.pdfName;
  if (payload.pdfBytes !== undefined) {
    body.pdfDataUrl =
      payload.pdfBytes && payload.pdfBytes.length > 0 ? bytesToDataUrl(payload.pdfBytes) : null;
  }
  if (payload.fields !== undefined) body.fields = payload.fields;

  const data = await authRequest<{ template: ApiTemplate }>(
    `/api/admin/portfolio/templates/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  return mapTemplate(data.template);
}

export async function setPortfolioTemplateStatus(
  id: string,
  status: TemplateStatus,
): Promise<AdminPortfolioTemplate> {
  const data = await authRequest<{ template: ApiTemplate }>(
    `/api/admin/portfolio/templates/${encodeURIComponent(id)}/status`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
  );
  return mapTemplate(data.template);
}

export async function deletePortfolioTemplate(id: string): Promise<void> {
  await authRequest(`/api/admin/portfolio/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Catalog management (main admin)
// ---------------------------------------------------------------------------

// The university form was simplified to only collect "اسم الجامعة". The other
// fields remain part of the API for backward compatibility but are optional.
export interface UniversityPayload {
  name: string;
  nameEn?: string | null;
  city?: string | null;
  shortCode?: string | null;
  color?: string | null;
  established?: number | null;
  students?: string | null;
}

export interface CohortPayload {
  universityId: string;
  label: string;
  order: number;
  academicYears: string;
  description?: string | null;
}

export interface CoursePayload {
  universityId: string;
  name: string;
  code?: string | null;
  description: string;
  portfolioKind: string;
  batchIds: string[];
}

export async function listAdminUniversities(): Promise<MockUniversity[]> {
  const data = await authRequest<{ universities: MockUniversity[] }>(
    '/api/admin/portfolio/universities',
  );
  return data.universities;
}

export async function createAdminUniversity(payload: UniversityPayload): Promise<MockUniversity> {
  const data = await authRequest<{ university: MockUniversity }>(
    '/api/admin/portfolio/universities',
    { method: 'POST', body: JSON.stringify(payload) },
  );
  return data.university;
}

export async function updateAdminUniversity(
  id: string,
  payload: Partial<UniversityPayload>,
): Promise<MockUniversity> {
  const data = await authRequest<{ university: MockUniversity }>(
    `/api/admin/portfolio/universities/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
  return data.university;
}

export async function deleteAdminUniversity(id: string): Promise<void> {
  await authRequest(`/api/admin/portfolio/universities/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

function mapCohort(c: ApiCohort): MockBatch {
  return {
    id: c.id,
    universityId: c.universityId,
    label: c.label,
    order: c.order,
    academicYears: c.academicYears,
    description: c.description,
  };
}

export async function listAdminCohorts(universityId?: string): Promise<MockBatch[]> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : '';
  const data = await authRequest<{ cohorts: ApiCohort[] }>(
    `/api/admin/portfolio/cohorts${query}`,
  );
  return data.cohorts.map(mapCohort);
}

export async function createAdminCohort(payload: CohortPayload): Promise<MockBatch> {
  const data = await authRequest<{ cohort: ApiCohort }>('/api/admin/portfolio/cohorts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapCohort(data.cohort);
}

export async function updateAdminCohort(
  id: string,
  payload: Partial<CohortPayload>,
): Promise<MockBatch> {
  const data = await authRequest<{ cohort: ApiCohort }>(
    `/api/admin/portfolio/cohorts/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
  return mapCohort(data.cohort);
}

export async function deleteAdminCohort(id: string): Promise<void> {
  await authRequest(`/api/admin/portfolio/cohorts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

function mapCourse(c: ApiCourse): MockSubject {
  return {
    id: c.id,
    universityId: c.universityId,
    batchIds: c.batchIds,
    name: c.name,
    code: c.code,
    description: c.description,
    portfolioKind: c.portfolioKind,
  };
}

export async function listAdminCourses(universityId?: string): Promise<MockSubject[]> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : '';
  const data = await authRequest<{ courses: ApiCourse[] }>(
    `/api/admin/portfolio/courses${query}`,
  );
  return data.courses.map(mapCourse);
}

export async function createAdminCourse(payload: CoursePayload): Promise<MockSubject> {
  const data = await authRequest<{ course: ApiCourse }>('/api/admin/portfolio/courses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapCourse(data.course);
}

export async function updateAdminCourse(
  id: string,
  payload: Partial<CoursePayload>,
): Promise<MockSubject> {
  const data = await authRequest<{ course: ApiCourse }>(
    `/api/admin/portfolio/courses/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
  return mapCourse(data.course);
}

export async function deleteAdminCourse(id: string): Promise<void> {
  await authRequest(`/api/admin/portfolio/courses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
