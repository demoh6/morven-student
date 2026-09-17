import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '@/pages/auth/authApi';
import * as api from '@/services/userDataApi';
import * as profileApi from '@/services/profileApi';
import * as fileStorage from '@/services/fileStorage';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { bootstrapSession } from '@/services/sessionManager';
import { getScopeUserId, isGuestScope, setScopeToAccount, setScopeToGuest } from '@/storage/scope';
import type { AuthUser } from '@/pages/auth/authApi';

const USER_A: AuthUser = {
  id: 'user-a',
  email: 'a@example.com',
  username: 'userA',
  displayName: 'A',
  role: 'USER',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const TASK_RAW = JSON.stringify([
  { id: 'lt1', title: 'task', description: null, completed: false, priority: 'low', taskType: 'normal', dailyTime: null, createdAt: 1, updatedAt: 1 },
]);
const NOTES_RAW = JSON.stringify({
  state: { notes: [{ id: 'n1', title: 'note', content: 'c', pinned: false, createdAt: 1, updatedAt: 1 }] },
  version: 0,
});

vi.mock('@/dev/previewMode', () => ({ isPreviewMode: () => false }));

vi.mock('@/dev/mockApi', () => ({
  mockRefresh: vi.fn(),
  mockLogin: vi.fn(),
  mockRegister: vi.fn(),
  mockLogout: vi.fn(),
}));

vi.mock('@/pages/auth/authApi', () => ({
  refresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  googleLogin: vi.fn(),
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => null),
  setTokenRotationHandler: vi.fn(),
  authRequest: vi.fn(),
  authedFetch: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('@/services/userDataApi', () => ({
  fetchTasks: vi.fn(),
  fetchExams: vi.fn(),
  fetchFlashcards: vi.fn(),
  fetchNotes: vi.fn(),
  fetchUserFiles: vi.fn(),
  fetchPomodoroStats: vi.fn(),
  fetchAdhkarProgress: vi.fn(),
  createTask: vi.fn(),
  createExam: vi.fn(),
  createFlashcard: vi.fn(),
  createNote: vi.fn(),
  createUserFile: vi.fn(),
  uploadUserFile: vi.fn(),
  downloadUserFile: vi.fn(),
  deleteUserFile: vi.fn(),
  mergePomodoroStats: vi.fn(),
  recordPomodoroSession: vi.fn(),
  saveAdhkarProgress: vi.fn(),
  incrementAchievements: vi.fn(),
  fetchPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));

vi.mock('@/services/profileApi', () => ({
  getPublicAchievements: vi.fn(),
}));

vi.mock('@/services/fileStorage', () => ({
  getAllFiles: vi.fn(),
  getFile: vi.fn(),
  saveFile: vi.fn(),
  deleteFile: vi.fn(),
  clearAllFiles: vi.fn(),
  updateFileRecord: vi.fn(),
  fetchAndCacheRemoteBytes: vi.fn(),
  rekeyGuestFilesToAccount: vi.fn(),
}));

function setPostLoginAccountState(): void {
  setScopeToAccount('user-a');
  localStorage.setItem('morven:acct:user-a:tasks', TASK_RAW);
  localStorage.setItem('morven:acct:user-a:notes', NOTES_RAW);
}

/** Mirror App.tsx: `initialize()` then `bootstrapSession()`, exactly like the
 *  mount effect — called twice reproduces React.StrictMode's double-mount. */
function bootApp(): void {
  useAuthStore.getState().initialize();
  bootstrapSession();
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  localStorage.clear();
  setScopeToGuest();
  // resetAllMocks (not clearAllMocks): a previous test's mockResolvedValueOnce /
  // mockRejectedValueOnce queue would otherwise leak into the next test.
  vi.resetAllMocks();
  vi.mocked(authApi.getAccessToken).mockReturnValue(null);
  // Reset the auth store to a deterministic PRE-BOOT state so each test drives
  // its own initialize()/logout() transition.
  useAuthStore.setState({ user: null, loading: false, error: null, initialized: false });
  vi.mocked(authApi.refresh).mockResolvedValue({ user: USER_A, accessToken: 'access-token' });
  vi.mocked(api.fetchTasks).mockResolvedValue([]);
  vi.mocked(api.fetchExams).mockResolvedValue([]);
  vi.mocked(api.fetchFlashcards).mockResolvedValue([]);
  vi.mocked(api.fetchNotes).mockResolvedValue([]);
  vi.mocked(api.fetchUserFiles).mockResolvedValue([]);
  vi.mocked(api.fetchPomodoroStats).mockResolvedValue({
    completedSessions: 0,
    totalFocusSeconds: 0,
    lastFocusSeconds: 0,
    updatedAt: 1,
  });
  vi.mocked(api.fetchAdhkarProgress).mockResolvedValue(null);
  vi.mocked(api.fetchPreferences).mockResolvedValue({
    theme: 'dark',
    recentTools: [],
    pomodoroFocusMinutes: 25,
    pomodoroBreakMinutes: 5,
    pomodoroLongBreakMinutes: 15,
    pomodoroSessionsUntilLongBreak: 4,
    pomodoroTheme: 'classic',
    pomodoroTimerMode: 'countdown',
  });
  vi.mocked(profileApi.getPublicAchievements).mockResolvedValue({
    achievements: {
      username: 'userA',
      completedTasks: 0,
      cardsReviewed: 0,
      completedSessions: 0,
      meaningfulNotes: 0,
      files: 0,
      flashcards: 0,
      quizzesCompleted: 0,
      totalAchievements: 0,
      updatedAt: null,
    },
  });
  vi.mocked(fileStorage.getAllFiles).mockResolvedValue([]);
  vi.mocked(fileStorage.rekeyGuestFilesToAccount).mockResolvedValue([]);
  await flush();
});

describe('authenticated refresh boot (Phase 3 regression)', () => {
  it('StrictMode double-mount must NOT wipe account data (single-flight boot refresh)', async () => {
    setPostLoginAccountState();

    // The refresh cookie is single-use + rotated server-side, so a SECOND
    // concurrent refresh with the same cookie is rejected.
    vi.mocked(authApi.refresh)
      .mockResolvedValueOnce({ user: USER_A, accessToken: 'fresh-access-token' })
      .mockRejectedValueOnce(new Error('رمز التحديث غير صالح أو منتهي الصلاحية'));

    bootApp(); // mount #1
    bootApp(); // mount #2 (StrictMode)

    await flush();

    expect(vi.mocked(authApi.refresh)).toHaveBeenCalledTimes(1);
    expect(isGuestScope()).toBe(false);
    expect(getScopeUserId()).toBe('user-a');
    expect(localStorage.getItem('morven:acct:user-a:tasks')).not.toBeNull();
    expect(localStorage.getItem('morven:acct:user-a:notes')).not.toBeNull();
  });

  it('a normal single boot with a valid session keeps the account scope + data', async () => {
    setPostLoginAccountState();

    bootApp();

    await flush();

    expect(isGuestScope()).toBe(false);
    expect(getScopeUserId()).toBe('user-a');
    expect(localStorage.getItem('morven:acct:user-a:tasks')).not.toBeNull();
  });

  it('a boot WITHOUT a session flips to guest but never wipes account data', async () => {
    setPostLoginAccountState();
    vi.mocked(authApi.refresh).mockRejectedValue(new Error('no session'));

    bootApp();

    await flush();

    expect(isGuestScope()).toBe(true);
    expect(localStorage.getItem('morven:acct:user-a:tasks')).not.toBeNull();
    expect(localStorage.getItem('morven:acct:user-a:notes')).not.toBeNull();
  });

  it('an explicit logout still clears the account scope (logout isolation)', async () => {
    setPostLoginAccountState();
    useAuthStore.setState({ user: USER_A, initialized: true, loading: false });
    bootApp();

    useAuthStore.getState().logout();

    await flush();

    expect(isGuestScope()).toBe(true);
    expect(localStorage.getItem('morven:acct:user-a:tasks')).toBeNull();
  });
});