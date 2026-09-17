import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { v4 as uuid } from 'uuid';
import type { Note } from '@/types';
import { scopedStorage } from '@/storage/scopedStorage';
import { syncCreateNote, syncUpdateNote, syncDeleteNote } from '@/services/syncService';
import { addPendingId, removePendingId } from '@/services/pendingCreate';

interface NotesStore {
  notes: Note[];
  createNote: (title?: string, content?: string) => string;
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'pinned'>>) => void;
  deleteNote: (id: string) => void;
  togglePin: (id: string) => void;
  searchNotes: (query: string) => Note[];
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export const useNotesStore = create<NotesStore>()(
  persist(
    (set, get) => ({
      notes: [],
      createNote: (title = '', content = '') => {
        const now = Date.now();
        const localId = uuid();
        const note: Note = { id: localId, title, content, pinned: false, createdAt: now, updatedAt: now };
        set((s) => ({ notes: [note, ...s.notes] }));
        // Track as pending: hydration keeps a local-only note ONLY if it was
        // just created here and the create-sync hasn't been acknowledged yet.
        // A note missing from the server and NOT pending was deleted elsewhere.
        addPendingId('notes', localId);
        // Fire-and-forget sync
        syncCreateNote(localId, { title, content }).then((serverId) => {
          if (serverId && serverId !== localId) {
            set((s) => ({ notes: s.notes.map(n => n.id === localId ? { ...n, id: serverId } : n) }));
            removePendingId('notes', localId);
          }
        }).catch(() => {});
        return localId;
      },
      updateNote: (id, updates) => {
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n,
          ),
        }));
        syncUpdateNote(id, updates).catch(() => {});
      },
      deleteNote: (id) => {
        set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
        removePendingId('notes', id);
        syncDeleteNote(id).catch(() => {});
      },
      togglePin: (id) => {
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n)),
        }));
        const note = get().notes.find((n) => n.id === id);
        if (note) syncUpdateNote(id, { pinned: note.pinned }).catch(() => {});
      },
      searchNotes: (query) => {
        const q = query.trim().toLowerCase();
        const all = sortNotes(get().notes);
        if (!q) return all;
        return all.filter(
          (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
        );
      },
    }),
    {
      name: 'morven-notes',
      storage: createJSONStorage(() => scopedStorage),
    },
  ),
);
