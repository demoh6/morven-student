import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotesStore } from '@/pages/tools/GeneralTools/Notes/useNotesStore';
import { useAppStore } from '@/store/useAppStore';
import { setScopeToAccount } from '@/storage/scope';
import { isPending, pendingIds } from '@/services/pendingCreate';

vi.mock('@/dev/previewMode', () => ({ isPreviewMode: () => false }));
vi.mock('@/dev/mockApi', () => ({
  mockRefresh: vi.fn(),
  mockLogin: vi.fn(),
  mockRegister: vi.fn(),
  mockLogout: vi.fn(),
}));

vi.mock('@/pages/auth/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'sync-test' } }),
  },
}));

vi.mock('@/services/syncService', () => ({
  syncCreateNote: vi.fn(),
  syncUpdateNote: vi.fn(),
  syncDeleteNote: vi.fn(),
  syncCreateFlashcard: vi.fn(),
  syncUpdateFlashcard: vi.fn(),
  syncDeleteFlashcard: vi.fn(),
}));

import {
  syncCreateNote,
  syncUpdateNote,
  syncDeleteNote,
  syncCreateFlashcard,
  syncUpdateFlashcard,
  syncDeleteFlashcard,
} from '@/services/syncService';

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  localStorage.clear();
  setScopeToAccount('sync-test');
  vi.resetAllMocks();
  vi.mocked(syncCreateNote).mockResolvedValue(null);
  vi.mocked(syncUpdateNote).mockResolvedValue(undefined);
  vi.mocked(syncDeleteNote).mockResolvedValue(undefined);
  vi.mocked(syncCreateFlashcard).mockResolvedValue(null);
  vi.mocked(syncUpdateFlashcard).mockResolvedValue(undefined);
  vi.mocked(syncDeleteFlashcard).mockResolvedValue(undefined);
  useNotesStore.setState({ notes: [], aliases: {} });
  useAppStore.setState({ flashcards: [] });
  await flush();
});

describe('notes cross-device sync (empty-title create must reach the server once a title exists)', () => {
  it('skips the doomed empty-title create, then creates on the server when the title is typed', async () => {
    const localId = useNotesStore.getState().createNote();

    // Empty title → no doomed network call (the backend rejects empty titles).
    expect(syncCreateNote).not.toHaveBeenCalled();

    // Server will acknowledge with its own id once the create runs.
    vi.mocked(syncCreateNote).mockResolvedValue('srv-note-1');

    // User types a title while the note is still pending → create-sync retries
    // with the FULL note (title + content + pinned).
    useNotesStore.getState().updateNote(localId, { title: 'موضوع مهم' });
    expect(syncCreateNote).toHaveBeenCalledTimes(1);
    expect(syncCreateNote).toHaveBeenCalledWith(localId, {
      title: 'موضوع مهم',
      content: '',
      pinned: false,
    });

    await flush();
    await flush();

    // Local id swapped for the server id, pending cleared, alias recorded so
    // the open editor keeps following the note.
    const notes = useNotesStore.getState().notes;
    expect(notes.some((n) => n.id === 'srv-note-1' && n.title === 'موضوع مهم')).toBe(true);
    expect(notes.some((n) => n.id === localId)).toBe(false);
    expect(useNotesStore.getState().aliases[localId]).toBe('srv-note-1');
    expect(isPending('notes', 'srv-note-1')).toBe(false);
    expect(pendingIds('notes')).not.toContain(localId);

    // Subsequent edits target the server id and use the update endpoint.
    useNotesStore.getState().updateNote('srv-note-1', { content: 'المحتوى' });
    expect(syncUpdateNote).toHaveBeenCalledWith('srv-note-1', { content: 'المحتوى' });
    expect(useNotesStore.getState().notes.find((n) => n.id === 'srv-note-1')?.content).toBe('المحتوى');
  });

  it('routes an update made through the local alias to the server id', async () => {
    const localId = useNotesStore.getState().createNote();

    vi.mocked(syncCreateNote).mockResolvedValue('srv-note-2');
    useNotesStore.getState().updateNote(localId, { title: 'عنوان' });
    await flush();
    await flush();

    // Simulate the open editor still resolving via the OLD local id.
    useNotesStore.getState().updateNote(localId, { content: 'نص' });
    expect(syncUpdateNote).toHaveBeenCalledWith('srv-note-2', { content: 'نص' });
  });

  it('creates immediately when the note already has a title at creation time', async () => {
    const localId = useNotesStore.getState().createNote('عنوان جاهز', 'محتوى');
    expect(syncCreateNote).toHaveBeenCalledWith(localId, {
      title: 'عنوان جاهز',
      content: 'محتوى',
      pinned: false,
    });
  });
});

describe('medical flashcard review progress', () => {
  it('updateFlashcard writes progress into state + localStorage and syncs it', async () => {
    useNotesStore.setState({ notes: [], aliases: {} });
    useAppStore.getState().addFlashcard('ما هو FAST؟', 'إجابة', 'Custom', 'medical');
    await flush();

    const card = useAppStore.getState().flashcards[0];
    const cardId = card.id;

    const nextReview = Date.now() + 7 * 24 * 60 * 60 * 1000;
    useAppStore.getState().updateFlashcard(cardId, {
      difficulty: 'easy',
      nextReview,
      reviewCount: (card.reviewCount ?? 0) + 1,
    });

    const updated = useAppStore.getState().flashcards.find((f) => f.id === cardId);
    expect(updated?.difficulty).toBe('easy');
    expect(updated?.reviewCount).toBe(1);
    expect(typeof updated?.updatedAt).toBe('number');

    // Not a pending create anymore → the update went through the update endpoint.
    expect(syncUpdateFlashcard).toHaveBeenCalledWith(cardId, {
      difficulty: 'easy',
      nextReview,
      reviewCount: 1,
    });

    // Persisted to the account scope so the next hydration (or the other
    // device, once merged) sees the progress.
    const persisted = useAppStore.getState().flashcards;
    expect(persisted.some((f) => f.id === cardId && f.reviewCount === 1)).toBe(true);
  });
});