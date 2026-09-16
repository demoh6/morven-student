import { authRequest, authedFetch } from '@/pages/auth/authApi';
import { API_BASE } from './apiBase';

// ---------------------------------------------------------------------------
// Account-scoped data APIs (Phase 2) — thin wrappers for the client-side
// migration and live CRUD. All responses use camelCase fields and epoch-ms
// timestamps.
// ---------------------------------------------------------------------------

export interface ServerTask {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: string;
  dueDate?: string;
  taskType: string;
  dailyTime?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ServerExam {
  id: string;
  name: string;
  date: string;
  color: string;
  createdAt: number;
}

export interface ServerFlashcard {
  id: string;
  front: string;
  back: string;
  deck: string;
  type: string;
  difficulty: string;
  nextReview: number;
  reviewCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ServerNote {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  type: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ServerUserFile {
  id: string;
  name: string;
  type: string;
  size: number;
  toolUsed?: string;
  createdAt: number;
}

// Tasks -------------------------------------------------------------------

export async function fetchTasks(): Promise<ServerTask[]> {
  const res = await authRequest<{ tasks: ServerTask[] }>('/api/tasks');
  return res.tasks;
}

export async function createTask(
  data: Record<string, unknown> & { title: string },
): Promise<ServerTask> {
  const res = await authRequest<{ task: ServerTask }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.task;
}

export async function updateTask(
  id: string,
  data: Record<string, unknown>,
): Promise<ServerTask> {
  const res = await authRequest<{ task: ServerTask }>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.task;
}

export async function deleteTask(id: string): Promise<void> {
  await authRequest(`/api/tasks/${id}`, { method: 'DELETE' });
}

// Exams -------------------------------------------------------------------

export async function fetchExams(): Promise<ServerExam[]> {
  const res = await authRequest<{ exams: ServerExam[] }>('/api/exams');
  return res.exams;
}

export async function createExam(
  data: Record<string, unknown> & { name: string; date: string; color: string },
): Promise<ServerExam> {
  const res = await authRequest<{ exam: ServerExam }>('/api/exams', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.exam;
}

export async function updateExam(
  id: string,
  data: Record<string, unknown>,
): Promise<ServerExam> {
  const res = await authRequest<{ exam: ServerExam }>(`/api/exams/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.exam;
}

export async function deleteExam(id: string): Promise<void> {
  await authRequest(`/api/exams/${id}`, { method: 'DELETE' });
}

// Flashcards --------------------------------------------------------------

export async function fetchFlashcards(
  type?: 'general' | 'medical',
): Promise<ServerFlashcard[]> {
  const qs = type ? `?type=${type}` : '';
  const res = await authRequest<{ flashcards: ServerFlashcard[] }>(
    `/api/flashcards${qs}`,
  );
  return res.flashcards;
}

export async function createFlashcard(
  data: Record<string, unknown> & { front: string; back: string; deck: string },
): Promise<ServerFlashcard> {
  const res = await authRequest<{ flashcard: ServerFlashcard }>('/api/flashcards', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.flashcard;
}

export async function updateFlashcard(
  id: string,
  data: Record<string, unknown>,
): Promise<ServerFlashcard> {
  const res = await authRequest<{ flashcard: ServerFlashcard }>(`/api/flashcards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.flashcard;
}

export async function deleteFlashcard(id: string): Promise<void> {
  await authRequest(`/api/flashcards/${id}`, { method: 'DELETE' });
}

// Notes -------------------------------------------------------------------

export async function fetchNotes(
  type?: 'general' | 'medical',
): Promise<ServerNote[]> {
  const qs = type ? `?type=${type}` : '';
  const res = await authRequest<{ notes: ServerNote[] }>(`/api/notes${qs}`);
  return res.notes;
}

export async function createNote(
  data: Record<string, unknown> & { title: string; content: string },
): Promise<ServerNote> {
  const res = await authRequest<{ note: ServerNote }>('/api/notes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.note;
}

export async function updateNote(
  id: string,
  data: Record<string, unknown>,
): Promise<ServerNote> {
  const res = await authRequest<{ note: ServerNote }>(`/api/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.note;
}

export async function deleteNote(id: string): Promise<void> {
  await authRequest(`/api/notes/${id}`, { method: 'DELETE' });
}

// User files (metadata + bytes) -------------------------------------------

export async function fetchUserFiles(): Promise<ServerUserFile[]> {
  const res = await authRequest<{ files: ServerUserFile[] }>('/api/user-files');
  return res.files;
}

export async function createUserFile(
  data: Record<string, unknown> & { name: string; type: string; size: number },
): Promise<ServerUserFile> {
  const res = await authRequest<{ file: ServerUserFile }>('/api/user-files', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.file;
}

/**
 * Attach the actual file bytes to an existing metadata record (multipart
 * "file"). Must NOT set a Content-Type — the multipart boundary is generated
 * by the browser.
 */
export async function uploadUserFile(
  fileId: string,
  file: Blob,
  name: string,
): Promise<ServerUserFile> {
  const form = new FormData();
  form.append('file', file, name);
  const res = await authedFetch(`${API_BASE}/api/user-files/${fileId}/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || 'فشل رفع الملف');
  }
  const json = await res.json();
  return json.file as ServerUserFile;
}

/** Download a user file's bytes from the server (for remote-only records). */
export async function downloadUserFile(fileId: string): Promise<ArrayBuffer> {
  const res = await authedFetch(`${API_BASE}/api/user-files/${fileId}/download`, {
    method: 'GET',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || 'تعذر تنزيل الملف');
  }
  return res.arrayBuffer();
}

/** Delete a user file record on the server (ownership-scoped). */
export async function deleteUserFile(fileId: string): Promise<void> {
  await authRequest(`/api/user-files/${fileId}`, { method: 'DELETE' });
}

// Pomodoro stats -----------------------------------------------------------

export interface ServerPomodoroStats {
  completedSessions: number;
  totalFocusSeconds: number;
  lastFocusSeconds: number;
  updatedAt: number;
}

export async function fetchPomodoroStats(): Promise<ServerPomodoroStats> {
  const res = await authRequest<{ stats: ServerPomodoroStats }>(
    '/api/pomodoro/me/stats',
  );
  return res.stats;
}

export async function recordPomodoroSession(
  sessionSeconds: number,
): Promise<ServerPomodoroStats> {
  const res = await authRequest<{ stats: ServerPomodoroStats }>(
    '/api/pomodoro/me/stats',
    { method: 'POST', body: JSON.stringify({ sessionSeconds }) },
  );
  return res.stats;
}

export async function mergePomodoroStats(data: {
  completedSessions?: number;
  totalFocusSeconds?: number;
  lastFocusSeconds?: number;
}): Promise<ServerPomodoroStats> {
  const res = await authRequest<{ stats: ServerPomodoroStats }>(
    '/api/pomodoro/me/stats/merge',
    { method: 'POST', body: JSON.stringify(data) },
  );
  return res.stats;
}

// Adhkar progress ---------------------------------------------------------

export interface ServerAdhkarProgress {
  day: string;
  counts: Record<string, number>;
}

export async function fetchAdhkarProgress(
  day: string,
): Promise<ServerAdhkarProgress | null> {
  const res = await authedFetch(`${API_BASE}/api/adhkar/progress/${day}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('خطأ في جلب بيانات الأذكار');
  const body = await res.json();
  return body.progress;
}

export async function saveAdhkarProgress(
  day: string,
  counts: Record<string, number>,
): Promise<ServerAdhkarProgress> {
  const res = await authRequest<{ progress: ServerAdhkarProgress }>(
    `/api/adhkar/progress/${day}`,
    { method: 'PUT', body: JSON.stringify({ counts }) },
  );
  return res.progress;
}

// Achievements (increment) -----------------------------------------------

export async function incrementAchievements(
  deltas: Partial<{
    completedTasks: number;
    cardsReviewed: number;
    completedSessions: number;
    meaningfulNotes: number;
    files: number;
    flashcards: number;
    quizzesCompleted: number;
  }>,
): Promise<void> {
  await authRequest('/api/profile/me/achievements/increment', {
    method: 'POST',
    body: JSON.stringify(deltas),
  });
}
