import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '@/pages/auth/authApi';
import * as api from '@/services/userDataApi';
import * as profileApi from '@/services/profileApi';
import * as fileStorage from '@/services/fileStorage';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { bootstrapSession } from '@/services/sessionManager';
import { getScopeUserId, setScopeToGuest } from '@/storage/scope';
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

vi.mock('@/services/profileApi', () => ({ getPublicAchievements: vi.fn() }));

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

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  localStorage.clear();
  setScopeToGuest();
  vi.resetAllMocks();
  vi.mocked(authApi.getAccessToken).mockReturnValue(null);
  vi.mocked(authApi.refresh).mockResolvedValue({ user: USER_A, accessToken: 'token' });
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

describe('Bug 2 — bootstrap when the subscription is installed first', () => {
  it('applies the account scope after a later initialize() completes', async () => {
    // Subscribe first, like the new App.tsx order.
    bootstrapSession();

    useAuthStore.setState({
      user: null,
      loading: false,
      error: null,
      initialized: false,
      hasPersistedSession: false,
      loggedOut: false,
    });

    useAuthStore.getState().initialize();
    await flush();

    expect(useAuthStore.getState().user?.id).toBe('user-a');
    expect(getScopeUserId()).toBe('user-a');
  });

  it('guest boot with no session stays in guest scope (unchanged)', async () => {
    bootstrapSession();

    useAuthStore.setState({
      user: null,
      loading: false,
      error: null,
      initialized: false,
      hasPersistedSession: false,
      loggedOut: false,
    });
    vi.mocked(authApi.refresh).mockRejectedValue(
      Object.assign(new Error('رمز التحديث غير صالح'), { status: 401 }),
    );

    useAuthStore.getState().initialize();
    await flush();

    expect(useAuthStore.getState().user).toBeNull();
    expect(getScopeUserId()).toBeNull();
  });
});
