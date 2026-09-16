import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredFile } from '@/services/db';
import * as api from '@/services/userDataApi';
import * as fileStorage from '@/services/fileStorage';
import { syncFileToServer } from '@/services/fileSync';
import {
  applyMigrationForUser,
  migrateGuestToServer,
  readMigrationState,
} from '@/services/sessionManager';
import { setScopeToAccount, setScopeToGuest } from '@/storage/scope';

const SERVER_TASK = {
  id: 'srv-task',
  title: '',
  description: undefined,
  completed: false,
  priority: 'low',
  dueDate: undefined,
  taskType: 'normal',
  dailyTime: undefined,
  createdAt: 0,
  updatedAt: 0,
};

const SERVER_EXAM = { id: 'srv-exam', name: '', date: '2026-01-01', color: '#000000', createdAt: 0 };

const EMPTY_SNAP: Record<string, string | null> = {
  tasks: null,
  exams: null,
  flashcards: null,
  notes: null,
  pomodoro: null,
  adhkar: null,
  stats: null,
  'medical-flashcards': null,
  'medical-notes': null,
};

function mkFile(id = 'f1'): StoredFile {
  return {
    id,
    name: 'a.pdf',
    type: 'application/pdf',
    size: 3,
    data: new Uint8Array([1, 2, 3]).buffer as ArrayBuffer,
    createdAt: 100,
    scope: 'account:user-1',
  };
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(blob);
  });
}

vi.mock('@/services/userDataApi', () => ({
  fetchTasks: vi.fn(),
  createTask: vi.fn(),
  fetchExams: vi.fn(),
  createExam: vi.fn(),
  fetchFlashcards: vi.fn(),
  createFlashcard: vi.fn(),
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
  fetchUserFiles: vi.fn(),
  createUserFile: vi.fn(),
  uploadUserFile: vi.fn(),
  downloadUserFile: vi.fn(),
  deleteUserFile: vi.fn(),
  fetchPomodoroStats: vi.fn(),
  recordPomodoroSession: vi.fn(),
  mergePomodoroStats: vi.fn(),
  fetchAdhkarProgress: vi.fn(),
  saveAdhkarProgress: vi.fn(),
  incrementAchievements: vi.fn(),
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

vi.mock('@/store/useAppStore', () => ({
  useAppStore: { getState: () => ({ addNotification: vi.fn() }) },
}));

beforeEach(() => {
  localStorage.clear();
  setScopeToGuest();
  vi.clearAllMocks();

  vi.mocked(api.createTask).mockResolvedValue({ ...SERVER_TASK });
  vi.mocked(api.createExam).mockResolvedValue({ ...SERVER_EXAM });
  vi.mocked(api.createFlashcard).mockResolvedValue({
    id: 'srv-fc',
    front: '',
    back: '',
    deck: '',
    type: 'general',
    difficulty: 'medium',
    nextReview: 0,
    reviewCount: 0,
    createdAt: 0,
    updatedAt: 0,
  });
  vi.mocked(api.createNote).mockResolvedValue({
    id: 'srv-note',
    title: '',
    content: '',
    pinned: false,
    type: 'general',
    createdAt: 0,
    updatedAt: 0,
  });
  vi.mocked(api.mergePomodoroStats).mockResolvedValue({
    completedSessions: 1,
    totalFocusSeconds: 1500,
    lastFocusSeconds: 1500,
    updatedAt: 0,
  });
  vi.mocked(api.fetchAdhkarProgress).mockResolvedValue(null);
  vi.mocked(api.saveAdhkarProgress).mockResolvedValue({ day: '2026-01-01', counts: {} });
  vi.mocked(api.createUserFile).mockResolvedValue({ id: 'srv-file', name: 'a.pdf', type: 'application/pdf', size: 3, createdAt: 0 });
  vi.mocked(api.uploadUserFile).mockResolvedValue({ id: 'srv-file', name: 'a.pdf', type: 'application/pdf', size: 3, createdAt: 0 });
  vi.mocked(fileStorage.rekeyGuestFilesToAccount).mockResolvedValue([]);
  vi.mocked(fileStorage.getAllFiles).mockResolvedValue([]);
  vi.mocked(fileStorage.updateFileRecord).mockResolvedValue(undefined);
});

describe('syncFileToServer (cross-device byte upload)', () => {
  it('is a no-op in guest scope — files stay purely local', async () => {
    setScopeToGuest();
    const file = mkFile();
    const result = await syncFileToServer(file);
    expect(result).toBe(file);
    expect(api.createUserFile).not.toHaveBeenCalled();
    expect(api.uploadUserFile).not.toHaveBeenCalled();
    expect(fileStorage.updateFileRecord).not.toHaveBeenCalled();
  });

  it('creates the metadata record, uploads the real bytes, then stamps serverId', async () => {
    setScopeToAccount('user-1');
    const file = mkFile('f1');
    vi.mocked(api.createUserFile).mockResolvedValue({ id: 'srv-1', name: file.name, type: file.type, size: file.size, createdAt: 0 });

    const result = await syncFileToServer(file);

    expect(api.createUserFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'a.pdf', type: 'application/pdf', size: 3, clientId: 'f1' }),
    );
    const [uploadedId, blob, name] = vi.mocked(api.uploadUserFile).mock.calls[0];
    expect(uploadedId).toBe('srv-1');
    expect(name).toBe('a.pdf');
    const bytes = await blobToArrayBuffer(blob as Blob);
    expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3]);
    expect(fileStorage.updateFileRecord).toHaveBeenCalledWith('f1', { serverId: 'srv-1' });
    expect(result.serverId).toBe('srv-1');
  });

  it('skips files that already have a serverId (idempotent — no duplicate upload)', async () => {
    setScopeToAccount('user-1');
    const file = { ...mkFile(), serverId: 'srv-1' };
    const result = await syncFileToServer(file);
    expect(result.serverId).toBe('srv-1');
    expect(api.uploadUserFile).not.toHaveBeenCalled();
    expect(fileStorage.updateFileRecord).not.toHaveBeenCalled();
  });

  it('throws on metadata failure without mutating the local record', async () => {
    setScopeToAccount('user-1');
    vi.mocked(api.createUserFile).mockRejectedValue(new Error('offline'));
    await expect(syncFileToServer(mkFile())).rejects.toThrow('offline');
    expect(api.uploadUserFile).not.toHaveBeenCalled();
    expect(fileStorage.updateFileRecord).not.toHaveBeenCalled();
  });

  it('throws on byte-upload failure — local file untouched, no serverId', async () => {
    setScopeToAccount('user-1');
    vi.mocked(api.createUserFile).mockResolvedValue({ id: 'srv-1', name: 'a.pdf', type: 'application/pdf', size: 3, createdAt: 0 });
    vi.mocked(api.uploadUserFile).mockRejectedValue(new Error('upload failed'));
    await expect(syncFileToServer(mkFile())).rejects.toThrow('upload failed');
    expect(fileStorage.updateFileRecord).not.toHaveBeenCalled();
  });
});

describe('migrateGuestToServer', () => {
  it('records every present logical as synced on full success', async () => {
    setScopeToAccount('user-1');
    const snap = {
      ...EMPTY_SNAP,
      tasks: JSON.stringify([{ id: 't1', title: 'x', description: null, completed: false, priority: 'low', taskType: 'normal', dailyTime: null, createdAt: 1 }]),
    };
    const outcome = await migrateGuestToServer(snap);
    expect(outcome.logicalOk.tasks).toBe(true);
    expect(api.createTask).toHaveBeenCalledWith(expect.objectContaining({ clientId: 't1' }));
    expect(outcome.filesPending).toEqual([]);
  });

  it('continues independently when one logical fails (failures tracked, not swallowed)', async () => {
    setScopeToAccount('user-1');
    vi.mocked(api.createTask).mockRejectedValue(new Error('network'));
    const snap = {
      ...EMPTY_SNAP,
      tasks: JSON.stringify([{ id: 't1', title: 'x', description: null, completed: false, priority: 'low', taskType: 'normal', dailyTime: null, createdAt: 1 }]),
      exams: JSON.stringify([{ id: 'e1', name: 'n', date: '2026-01-01', color: '#fff' }]),
    };
    const outcome = await migrateGuestToServer(snap);
    expect(outcome.logicalOk.tasks).toBe(false);
    expect(outcome.logicalOk.exams).toBe(true);
    expect(api.createExam).toHaveBeenCalledTimes(1);
  });

  describe('guest file byte migration', () => {
    it('re-keys guest bytes into the account scope and uploads them after the metadata record', async () => {
      setScopeToAccount('user-1');
      const guestFile = mkFile('g1');
      vi.mocked(fileStorage.rekeyGuestFilesToAccount).mockResolvedValue([guestFile]);
      vi.mocked(fileStorage.getAllFiles).mockResolvedValue([guestFile]);
      vi.mocked(api.createUserFile).mockResolvedValue({ id: 'srv-g1', name: 'a.pdf', type: 'application/pdf', size: 3, createdAt: 0 });

      const outcome = await migrateGuestToServer({ ...EMPTY_SNAP });

      expect(outcome.filesPending).toEqual([]);
      expect(api.createUserFile).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'g1' }));
      const [uploadedId] = vi.mocked(api.uploadUserFile).mock.calls[0];
      expect(uploadedId).toBe('srv-g1');
      expect(fileStorage.updateFileRecord).toHaveBeenCalledWith('g1', { serverId: 'srv-g1' });
    });

    it('keeps the guest file intact (no serverId, no deletion) when the byte upload fails', async () => {
      setScopeToAccount('user-1');
      const guestFile = mkFile('g1');
      vi.mocked(fileStorage.rekeyGuestFilesToAccount).mockResolvedValue([guestFile]);
      vi.mocked(fileStorage.getAllFiles).mockResolvedValue([guestFile]);
      vi.mocked(api.createUserFile).mockResolvedValue({ id: 'srv-g1', name: 'a.pdf', type: 'application/pdf', size: 3, createdAt: 0 });
      vi.mocked(api.uploadUserFile).mockRejectedValue(new Error('upload failed'));

      const outcome = await migrateGuestToServer({ ...EMPTY_SNAP });

      expect(outcome.filesPending).toEqual(['g1']);
      expect(fileStorage.updateFileRecord).not.toHaveBeenCalled();
      expect(fileStorage.rekeyGuestFilesToAccount).toHaveBeenCalledWith('account:user-1');
    });

    it('does not re-upload files that already have a serverId', async () => {
      setScopeToAccount('user-1');
      const synced = { ...mkFile('g1'), serverId: 'srv-g1' };
      vi.mocked(fileStorage.rekeyGuestFilesToAccount).mockResolvedValue([synced]);
      vi.mocked(fileStorage.getAllFiles).mockResolvedValue([synced]);

      const outcome = await migrateGuestToServer({ ...EMPTY_SNAP });

      expect(outcome.filesPending).toEqual([]);
      expect(api.createUserFile).not.toHaveBeenCalled();
      expect(api.uploadUserFile).not.toHaveBeenCalled();
    });
  });
});

describe('applyMigrationForUser (data-safe migration)', () => {
  it('clears migrated guest keys and migration state on full success', async () => {
    setScopeToGuest();
    localStorage.setItem('morven:guest:tasks', JSON.stringify([{ id: 't1', title: 'x', description: null, completed: false, priority: 'low', taskType: 'normal', dailyTime: null, createdAt: 1 }]));
    localStorage.setItem('morven:guest:exams', JSON.stringify([{ id: 'e1', name: 'x', date: '2026-01-01', color: '#fff' }]));
    setScopeToAccount('user-1');

    await applyMigrationForUser('user-1');

    expect(localStorage.getItem('morven:guest:tasks')).toBeNull();
    expect(localStorage.getItem('morven:guest:exams')).toBeNull();
    expect(readMigrationState()).toBeNull();
  });

  it('preserves failed guest data, clears only synced logicals, and records pending state', async () => {
    setScopeToGuest();
    const taskRaw = JSON.stringify([{ id: 't1', title: 'x', description: null, completed: false, priority: 'low', taskType: 'normal', dailyTime: null, createdAt: 1 }]);
    const examsRaw = JSON.stringify([{ id: 'e1', name: 'x', date: '2026-01-01', color: '#fff' }]);
    localStorage.setItem('morven:guest:tasks', taskRaw);
    localStorage.setItem('morven:guest:exams', examsRaw);
    vi.mocked(api.createTask).mockRejectedValue(new Error('offline'));
    setScopeToAccount('user-1');

    await applyMigrationForUser('user-1');

    expect(localStorage.getItem('morven:guest:tasks')).toBe(taskRaw);
    expect(localStorage.getItem('morven:guest:exams')).toBeNull();
    const state = readMigrationState();
    expect(state?.userId).toBe('user-1');
    expect(state?.logicalPending).toContain('tasks');
  });

  it('retry resumes with the same clientId and completes without duplicates', async () => {
    setScopeToGuest();
    const taskRaw = JSON.stringify([{ id: 't1', title: 'x', description: null, completed: false, priority: 'low', taskType: 'normal', dailyTime: null, createdAt: 1 }]);
    localStorage.setItem('morven:guest:tasks', taskRaw);
    setScopeToAccount('user-1');
    vi.mocked(api.createTask)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...SERVER_TASK });

    await applyMigrationForUser('user-1');
    expect(localStorage.getItem('morven:guest:tasks')).not.toBeNull();

    await applyMigrationForUser('user-1');

    expect(localStorage.getItem('morven:guest:tasks')).toBeNull();
    expect(readMigrationState()).toBeNull();
    const attempts = vi.mocked(api.createTask).mock.calls.filter((c) => c[0]?.clientId === 't1');
    expect(attempts.length).toBe(2);
    expect(attempts[0][0].clientId).toBe(attempts[1][0].clientId);
  });

  it('network failure loses no guest data and leaves retry state behind', async () => {
    setScopeToGuest();
    localStorage.setItem('morven:guest:tasks', JSON.stringify([{ id: 't1', title: 'x', description: null, completed: false, priority: 'low', taskType: 'normal', dailyTime: null, createdAt: 1 }]));
    setScopeToAccount('user-1');
    vi.mocked(api.createTask).mockRejectedValue(new Error('down'));

    await expect(applyMigrationForUser('user-1')).resolves.toBeUndefined();

    expect(localStorage.getItem('morven:guest:tasks')).not.toBeNull();
    const state = readMigrationState();
    expect(state?.logicalPending).toContain('tasks');
    expect(state?.filesPending).toEqual([]);
  });

  it('resumes a previous files-only state when no guest logical data remains', async () => {
    setScopeToGuest();
    localStorage.setItem('morven:guest:tasks', JSON.stringify([{ id: 't1', title: 'x', description: null, completed: false, priority: 'low', taskType: 'normal', dailyTime: null, createdAt: 1 }]));
    setScopeToAccount('user-1');

    // First run: logicals succeed, but the file byte upload fails → filesPending.
    const guestFile = mkFile('g1');
    vi.mocked(fileStorage.rekeyGuestFilesToAccount).mockResolvedValue([guestFile]);
    vi.mocked(fileStorage.getAllFiles).mockResolvedValue([guestFile]);
    vi.mocked(api.createUserFile).mockResolvedValue({ id: 'srv-g1', name: 'a.pdf', type: 'application/pdf', size: 3, createdAt: 0 });
    vi.mocked(api.uploadUserFile).mockRejectedValue(new Error('upload failed'));

    await applyMigrationForUser('user-1');

    expect(localStorage.getItem('morven:guest:tasks')).toBeNull();
    expect(readMigrationState()?.filesPending).toEqual(['g1']);

    // Second run: no guest logical data left — the pending file is swept again.
    vi.mocked(api.uploadUserFile).mockResolvedValue({ id: 'srv-g1', name: 'a.pdf', type: 'application/pdf', size: 3, createdAt: 0 });
    vi.mocked(fileStorage.rekeyGuestFilesToAccount).mockResolvedValue([guestFile]);
    vi.mocked(fileStorage.getAllFiles).mockResolvedValue([guestFile]);

    await applyMigrationForUser('user-1');

    expect(readMigrationState()).toBeNull();
    expect(fileStorage.updateFileRecord).toHaveBeenCalledWith('g1', { serverId: 'srv-g1' });
  });
});