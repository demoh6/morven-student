import { authRequest } from '@/pages/auth/authApi';
import { toNetworkError } from '@/services/apiError';
import type { DhikrCategory } from '@/pages/tools/GeneralTools/Adhkar/adhkar';

export type DhikrSubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DhikrSubmission {
  id: string;
  userId: string;
  categoryId: DhikrCategory;
  title: string;
  text: string;
  source: string;
  status: DhikrSubmissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OfficialApprovedDhikr {
  id: string;
  categoryId: DhikrCategory;
  title: string;
  text: string;
  source: string;
  createdAt: string;
}

/** An admin override of a bundled official dhikr (title/text/source). */
export interface OfficialDhikrEdit {
  officialDhikrId: string;
  title: string;
  text: string;
  source: string;
}

export interface OfficialApprovedResponse {
  adhkar: OfficialApprovedDhikr[];
  officialEdits: OfficialDhikrEdit[];
  officialDeletions: string[];
}

export interface AdminDhikrSubmission extends DhikrSubmission {
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface CreateDhikrSubmissionInput {
  categoryId: DhikrCategory;
  title: string;
  text: string;
  source?: string;
}

/**
 * Submits a dhikr proposal. The backend always stores it as PENDING — it never
 * becomes official/visible content until an administrator approves it.
 */
export async function submitDhikrSubmission(
  input: CreateDhikrSubmissionInput,
): Promise<DhikrSubmission> {
  const data = await authRequest<{ submission: DhikrSubmission }>(
    '/api/adhkar/submissions',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return data.submission;
}

/**
 * Fetches the approved user-submitted dhikr list, along with the admin
 * mutations (edits + tombstone deletions) for official content (public — works
 * for guests). PENDING/REJECTED rows are never returned by the server, so
 * offline/reserved content is unaffected. Returns empty collections on network
 * failure, so the bundled offline adhkar remain the source of truth.
 */
export async function fetchApprovedAdhkar(): Promise<OfficialApprovedResponse> {
  try {
    const data = await authRequest<OfficialApprovedResponse>(
      '/api/adhkar/submissions/official',
    );
    return {
      adhkar: data.adhkar ?? [],
      officialEdits: data.officialEdits ?? [],
      officialDeletions: data.officialDeletions ?? [],
    };
  } catch (err) {
    if (err instanceof TypeError) {
      throw toNetworkError('تعذر الاتصال بالخادم', err);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Admin only
// ---------------------------------------------------------------------------

export async function listDhikrSubmissions(): Promise<AdminDhikrSubmission[]> {
  const data = await authRequest<{ submissions: AdminDhikrSubmission[] }>(
    '/api/admin/adhkar/submissions',
  );
  return data.submissions;
}

export async function approveDhikrSubmission(
  id: string,
): Promise<DhikrSubmission> {
  const data = await authRequest<{ submission: DhikrSubmission }>(
    `/api/admin/adhkar/submissions/${encodeURIComponent(id)}/approve`,
    { method: 'POST' },
  );
  return data.submission;
}

export async function rejectDhikrSubmission(
  id: string,
): Promise<DhikrSubmission> {
  const data = await authRequest<{ submission: DhikrSubmission }>(
    `/api/admin/adhkar/submissions/${encodeURIComponent(id)}/reject`,
    { method: 'POST' },
  );
  return data.submission;
}

export interface UpdateDhikrContentInput {
  title: string;
  text: string;
  source?: string;
}

/** Edits an existing user submission's content in place (ADMIN only). */
export async function updateDhikrSubmission(
  id: string,
  input: UpdateDhikrContentInput,
): Promise<DhikrSubmission> {
  const data = await authRequest<{ submission: DhikrSubmission }>(
    `/api/admin/adhkar/submissions/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.submission;
}

/** Permanently removes a user submission (ADMIN only). */
export async function deleteDhikrSubmission(id: string): Promise<void> {
  await authRequest<{ deleted: boolean }>(
    `/api/admin/adhkar/submissions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

/** Persists an admin edit of a bundled official dhikr (ADMIN only). */
export async function updateOfficialDhikr(
  id: string,
  input: UpdateDhikrContentInput,
): Promise<OfficialDhikrEdit> {
  const data = await authRequest<{ edit: OfficialDhikrEdit }>(
    `/api/admin/adhkar/official/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.edit;
}

/** Hides a bundled official dhikr for everyone via a tombstone (ADMIN only). */
export async function deleteOfficialDhikr(id: string): Promise<void> {
  await authRequest<{ deleted: boolean }>(
    `/api/admin/adhkar/official/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}