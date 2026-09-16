import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { v4 as uuid } from 'uuid';
import type { Note } from '@/types';
import { scopedStorage } from '@/storage/scopedStorage';

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
        const note: Note = { id: uuid(), title, content, pinned: false, createdAt: now, updatedAt: now };
        set((s) => ({ notes: [note, ...s.notes] }));
        return note.id;
      },
      updateNote: (id, updates) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n,
          ),
        })),
      deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      togglePin: (id) =>
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
        })),
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
