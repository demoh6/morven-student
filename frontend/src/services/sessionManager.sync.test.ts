import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '@/pages/auth/authApi';
import * as api from '@/services/userDataApi';
import * as profileApi from '@/services/profileApi';
import * as fileStorage from '@/services/fileStorage';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { bootstrapSession, refreshAccountData } from '@/services/sessionManager';
import { setScopeToAccount, setScopeToGuest } from '@/storage/scope';
import { useAppStore } from '@/store/useAppStore';
import { useNotesStore } from '@/pages/tools/GeneralTools/Notes/useNotesStore';
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

/** Device B already has an account-scoped snapshot: an OLD exam + OLD note +
 *  OLD general card. The server then returns NEW records created on device A. */
function setDeviceBOldData(): void {
  setScopeToAccount('user-a');
  localStorage.setItem('morven:acct:user-a:exams', JSON.stringify([
    { id: 'old-exam-b', name: 'قديم ب', date: '2026-10-01', color: 'blue', createdAt: 100 },
  ]));
  localStorage.setItem('morven:acct:user-a:notes', JSON.stringify({
    state: { notes: [{ id: 'old-note-b', title: 'قديم ب', content: 'c', pinned: false, createdAt: 1, updatedAt: 2 }] },
    version: 0,
  }));
  localStorage.setItem('morven:acct:user-a:flashcards', JSON.stringify([
    { id: 'old-card-b', front: 'قديم ب', back: 'b', deck: 'Default', difficulty: 'medium', nextReview: 0, reviewCount: 0, createdAt: 1, updatedAt: 1 },
  ]));
}

function bootApp(): void {
  useAuthStore.getState().initialize();
  bootstrapSession();
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  localStorage.clear();
  setScopeToGuest();
  vi.resetAllMocks();
  vi.mocked(authApi.getAccessToken).mockReturnValue(null);
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

describe('cross-device hydration (device B sees device A records)', () => {
  it('updates in-memory stores with server data for exams, notes and medical flashcards', async () => {
    setDeviceBOldData();

    // Records created on device A, now present on the server.
    vi.mocked(api.fetchExams).mockResolvedValue([
      { id: 'exam-a', name: 'امتحان أ', date: '2026-11-01', color: 'red', createdAt: 500 },
    ]);
    vi.mocked(api.fetchNotes).mockImplementation(async (type) => {
      if (type === 'general') {
        return [
          { id: 'note-a', title: 'ملاحظة أ', content: 'x', pinned: false, type: 'general', createdAt: 300, updatedAt: 300 },
          { id: 'old-note-b', title: 'قديم ب', content: 'c', pinned: false, type: 'general', createdAt: 1, updatedAt: 2 },
        ];
      }
      return [];
    });
    vi.mocked(api.fetchFlashcards).mockImplementation(async (type) => {
      if (type === 'medical') {
        return [
          { id: 'card-a', front: 'بطاقة أ', back: 'b', deck: 'Custom', type: 'medical', difficulty: 'medium', nextReview: 0, reviewCount: 0, createdAt: 400, updatedAt: 400 },
        ];
      }
      // device B's old general card is still on the server
      return [{ id: 'old-card-b', front: 'قديم ب', back: 'b', deck: 'Default', type: 'general', difficulty: 'medium', nextReview: 0, reviewCount: 0, createdAt: 1, updatedAt: 1 }];
    });

    bootApp();
    await flush();

    expect(useAuthStore.getState().user?.id).toBe('user-a');

    const exams = useAppStore.getState().exams;
    expect(exams.some((e) => e.id === 'exam-a' && e.name === 'امتحان أ')).toBe(true);

    const notes = useNotesStore.getState().notes;
    expect(notes.some((n) => n.id === 'note-a' && n.title === 'ملاحظة أ')).toBe(true);

    const cards = useAppStore.getState().flashcards;
    expect(cards.some((c) => c.id === 'card-a' && c.type === 'medical')).toBe(true);
  });

  it('refreshAccountData pulls NEW cross-device records into an open device (throttled)', async () => {
    setDeviceBOldData();
    vi.mocked(api.fetchExams).mockResolvedValue([
      { id: 'exam-a', name: 'امتحان أ', date: '2026-11-01', color: 'red', createdAt: 500 },
    ]);
    vi.mocked(api.fetchNotes).mockResolvedValue([]);
    vi.mocked(api.fetchFlashcards).mockResolvedValue([]);

    bootApp();
    await flush();

    expect(useAppStore.getState().exams.some((e) => e.id === 'exam-a')).toBe(true);
    const fetchCallsAfterBoot = vi.mocked(api.fetchExams).mock.calls.length;

    // Device A creates ANOTHER exam while device B stays open.
    vi.mocked(api.fetchExams).mockResolvedValue([
      { id: 'exam-a', name: 'امتحان أ', date: '2026-11-01', color: 'red', createdAt: 500 },
      { id: 'exam-a2', name: 'امتحان جديد', date: '2026-12-01', color: 'blue', createdAt: 600 },
    ]);

    // Refocus hydration must happen at most MIN_INTERVAL after boot — the boot
    // already counted as a refresh, so force a fresh window to test behaviour.
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(120_000);
    vi.useRealTimers();

    await refreshAccountData();
    await flush();

    expect(useAppStore.getState().exams.some((e) => e.id === 'exam-a2')).toBe(true);
    expect(vi.mocked(api.fetchExams).mock.calls.length).toBeGreaterThan(fetchCallsAfterBoot);

    // Immediately re-refreshing is throttled: no additional network traffic.
    const beforeThrottled = vi.mocked(api.fetchExams).mock.calls.length;
    await refreshAccountData();
    await flush();
    expect(vi.mocked(api.fetchExams).mock.calls.length).toBe(beforeThrottled);
  });
});