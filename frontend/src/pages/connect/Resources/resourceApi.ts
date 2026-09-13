import { authedFetch } from '@/pages/auth/authApi';
import { API_BASE } from '@/services/apiBase';
import type { ResourceType } from '@/pages/connect/Resources/resources';

// ---------------------------------------------------------------------------
// Types (mirror of the backend Resource API response shapes)
// ---------------------------------------------------------------------------

export interface ApiResourceFile {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
}

export interface ApiResourceNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

export interface ApiResourceLink {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface ApiResource {
  id: string;
  title: string;
  description: string | null;
  type: ResourceType;
  ownerId: string;
  uploadedBy: string;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
  isPrivate: boolean;
  accessCode?: string | null;
}

export interface ApiResourceDetail extends ApiResource {
  files: ApiResourceFile[];
  notes: ApiResourceNote[];
  links: ApiResourceLink[];
}

// ---------------------------------------------------------------------------
// Internal helpers — use a local `resourceRequest` that attaches HTTP status
// and optional error code (e.g. PRIVATE_RESOURCE) to thrown errors so the
// UI can react accordingly, instead of going through the shared authRequest.
// ---------------------------------------------------------------------------

interface ResourceApiError extends Error {
  status?: number;
  code?: string;
}

/** Authed JSON request that preserves HTTP status + error code in the thrown Error. */
async function resourceRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await authedFetch(`${API_BASE}${url}`, { ...init, headers });
  if (!res.ok) {
    let message = `حدث خطأ (${res.status})`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data?.error) message = data.error;
      if (data?.code) code = data.code;
    } catch {
      // non-JSON body — keep the default message
    }
    const err = new Error(message) as ResourceApiError;
    err.status = res.status;
    if (code) err.code = code;
    throw err;
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Resource endpoints
// ---------------------------------------------------------------------------

export async function getResources(): Promise<ApiResource[]> {
  const { resources } = await resourceRequest<{ resources: ApiResource[] }>('/api/resources');
  return resources;
}

export async function getResource(resourceId: string): Promise<ApiResourceDetail> {
  const { resource } = await resourceRequest<{ resource: ApiResourceDetail }>(
    `/api/resources/${encodeURIComponent(resourceId)}`,
  );
  return resource;
}

export async function createResourceApi(input: {
  title: string;
  description?: string;
  type: ResourceType;
  isPrivate?: boolean;
}): Promise<ApiResource> {
  const { resource } = await resourceRequest<{ resource: ApiResource }>('/api/resources', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return resource;
}

export async function updateResourceApi(
  resourceId: string,
  input: { title?: string; description?: string | null; type?: ResourceType; isPrivate?: boolean },
): Promise<ApiResource> {
  const { resource } = await resourceRequest<{ resource: ApiResource }>(
    `/api/resources/${encodeURIComponent(resourceId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return resource;
}

export async function deleteResourceApi(resourceId: string): Promise<void> {
  await resourceRequest<{ message: string }>(`/api/resources/${encodeURIComponent(resourceId)}`, {
    method: 'DELETE',
  });
}

/** Unlocks a private resource after proving knowledge of its 6-digit access code. */
export async function accessResourceApi(resourceId: string, code: string): Promise<ApiResourceDetail> {
  const { resource } = await resourceRequest<{ resource: ApiResourceDetail }>(
    `/api/resources/${encodeURIComponent(resourceId)}/access`,
    { method: 'POST', body: JSON.stringify({ code }) },
  );
  return resource;
}

/** Adds a private resource to the caller's list using ONLY its 6-digit code. */
export async function accessResourceByCodeApi(code: string): Promise<ApiResourceDetail> {
  const { resource } = await resourceRequest<{ resource: ApiResourceDetail }>('/api/resources/access', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  return resource;
}

// ---------------------------------------------------------------------------
// File endpoints
// ---------------------------------------------------------------------------

export async function uploadResourceFiles(
  resourceId: string,
  files: File[],
): Promise<ApiResourceFile[]> {
  const fd = new FormData();
  for (const file of files) {
    fd.append('files', file);
  }

  const res = await authedFetch(
    `${API_BASE}/api/resources/${encodeURIComponent(resourceId)}/files`,
    { method: 'POST', body: fd },
  );

  if (!res.ok) {
    let message = `حدث خطأ (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const { files: uploaded } = (await res.json()) as { files: ApiResourceFile[] };
  return uploaded;
}

export async function deleteResourceFileApi(resourceId: string, fileId: string): Promise<void> {
  await resourceRequest<{ message: string }>(
    `/api/resources/${encodeURIComponent(resourceId)}/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  );
}

export async function downloadResourceFile(resourceId: string, fileId: string, filename: string): Promise<void> {
  const res = await authedFetch(
    `${API_BASE}/api/resources/${encodeURIComponent(resourceId)}/files/${encodeURIComponent(fileId)}/download`,
    { method: 'GET' },
  );
  if (!res.ok) {
    let message = `حدث خطأ (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Note endpoints
// ---------------------------------------------------------------------------

export async function addResourceNoteApi(
  resourceId: string,
  title: string,
  content: string,
): Promise<ApiResourceNote> {
  const { note } = await resourceRequest<{ note: ApiResourceNote }>(
    `/api/resources/${encodeURIComponent(resourceId)}/notes`,
    { method: 'POST', body: JSON.stringify({ title, content }) },
  );
  return note;
}

export async function deleteResourceNoteApi(resourceId: string, noteId: string): Promise<void> {
  await resourceRequest<{ message: string }>(
    `/api/resources/${encodeURIComponent(resourceId)}/notes/${encodeURIComponent(noteId)}`,
    { method: 'DELETE' },
  );
}

// ---------------------------------------------------------------------------
// Link endpoints
// ---------------------------------------------------------------------------

export async function addResourceLinkApi(
  resourceId: string,
  title: string,
  url: string,
): Promise<ApiResourceLink> {
  const { link } = await resourceRequest<{ link: ApiResourceLink }>(
    `/api/resources/${encodeURIComponent(resourceId)}/links`,
    { method: 'POST', body: JSON.stringify({ title, url }) },
  );
  return link;
}

export async function deleteResourceLinkApi(resourceId: string, linkId: string): Promise<void> {
  await resourceRequest<{ message: string }>(
    `/api/resources/${encodeURIComponent(resourceId)}/links/${encodeURIComponent(linkId)}`,
    { method: 'DELETE' },
  );
}