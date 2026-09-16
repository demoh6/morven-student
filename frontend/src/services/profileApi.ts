import { authRequest, authedFetch } from '@/pages/auth/authApi';
import { API_BASE } from './apiBase';
import { isPreviewMode } from '@/dev/previewMode';
import {
  mockGetOwnProfile,
  mockUpdateOwnProfile,
  mockGetPublicProfile,
  mockGetPublicAchievements,
  mockSyncAchievements,
} from '@/dev/mockApi';

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OwnProfile extends Profile {
  email: string;
}

export interface AchievementCounters {
  username: string;
  completedTasks: number;
  cardsReviewed: number;
  completedSessions: number;
  meaningfulNotes: number;
  files: number;
  flashcards: number;
  quizzesCompleted: number;
  totalAchievements: number;
  updatedAt: string | null;
}

export interface AchievementSync {
  completedTasks: number;
  cardsReviewed: number;
  completedSessions: number;
  meaningfulNotes: number;
  files: number;
  flashcards: number;
  quizzesCompleted: number;
}

export async function getOwnProfile(): Promise<{ profile: OwnProfile }> {
  if (isPreviewMode()) return mockGetOwnProfile();
  return authRequest<{ profile: OwnProfile }>('/api/profile/me');
}

export async function updateOwnProfile(data: {
  displayName?: string;
  bio?: string;
  isPublic?: boolean;
}): Promise<{ profile: OwnProfile }> {
  if (isPreviewMode()) return mockUpdateOwnProfile(data);
  return authRequest<{ profile: OwnProfile }>('/api/profile/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const fd = new FormData();
  fd.append('avatar', file);
  const res = await authedFetch(`${API_BASE}/api/profile/avatar`, { method: 'POST', body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'حدث خطأ'); }
  return res.json();
}

export async function removeAvatar(): Promise<{ message: string }> {
  const res = await authedFetch(`${API_BASE}/api/profile/avatar`, { method: 'DELETE' });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'حدث خطأ'); }
  return res.json();
}

export async function getPublicProfile(
  username: string,
): Promise<{ profile: Profile }> {
  if (isPreviewMode()) return mockGetPublicProfile(username);
  const res = await fetch(
    `${API_BASE}/api/profile/${encodeURIComponent(username)}`,
    {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    },
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'حدث خطأ غير متوقع');
  }

  return data as { profile: Profile };
}

export async function getPublicAchievements(
  username: string,
): Promise<{ achievements: AchievementCounters }> {
  if (isPreviewMode()) return mockGetPublicAchievements(username);
  const res = await fetch(
    `${API_BASE}/api/profile/${encodeURIComponent(username)}/achievements`,
    {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    },
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'حدث خطأ غير متوقع');
  }

  return data as { achievements: AchievementCounters };
}

export async function syncAchievements(
  counters: Omit<AchievementSync, 'username'>,
): Promise<{ ok: boolean }> {
  if (isPreviewMode()) return mockSyncAchievements(counters);
  return authRequest<{ ok: boolean }>('/api/profile/me/achievements', {
    method: 'PUT',
    body: JSON.stringify(counters),
  });
}

/**
 * Increment the authenticated user's achievement counters (additive, never a
 * destructive overwrite). Deltas must be positive integers.
 */
export async function incrementAchievements(
  deltas: Partial<AchievementSync>,
): Promise<void> {
  const body: Record<string, number> = {};
  for (const [k, v] of Object.entries(deltas) as Array<[keyof AchievementSync, number]>) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) body[k] = v;
  }
  if (Object.keys(body).length === 0) return;
  await authRequest<{ ok: boolean }>(
    '/api/profile/me/achievements/increment',
    { method: 'POST', body: JSON.stringify(body) },
  );
}
