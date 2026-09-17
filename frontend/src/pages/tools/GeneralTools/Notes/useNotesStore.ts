import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { v4 as uuid } from 'uuid';
import type { Note } from '@/types';
import { scopedStorage } from '@/storage/scopedStorage';
import { syncCreateNote, syncUpdateNote, syncDeleteNote } from '@/services/syncService';
import { addPendingId, removePendingId, isPending } from '@/services/pendingCreate';

interface NotesStore {
  notes: Note[];
  // local id -> server id for pending creates. While a note's create-sync is in
  // flight (or its local uuid was replaced by the server id), the UI can keep
  // resolving the note it is editing through this map so edits never target a
  // stale local id.
  aliases: Record<string, string>;
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
    (set, get) => {
      /** Create the note on the server. On success the local uuid is replaced
       *  by the server-assigned id (kept tracked via `aliases` so an open
       *  editor can keep following it) and the pending flag is cleared. */
      const pushCreate = (note: Note) => {
        syncCreateNote(note.id, {
          title: note.title,
          content: note.content,
          pinned: note.pinned,
        })
          .then((serverId) => {
            if (!serverId || serverId === note.id) return;
            set((s) => ({
              notes: s.notes.map((n) => (n.id === note.id ? { ...n, id: serverId } : n)),
              aliases: { ...s.aliases, [note.id]: serverId },
            }));
            removePendingId('notes', note.id);
          })
          .catch(() => {});
      };

      return {
      notes: [],
      aliases: {},
      createNote: (title = '', content = '') => {
        const now = Date.now();
        const localId = uuid();
        const note: Note = { id: localId, title, content, pinned: false, createdAt: now, updatedAt: now };
        set((s) => ({ notes: [note, ...s.notes] }));
        // Track as pending: hydration keeps a local-only note ONLY if it was
        // just created here and the create-sync hasn't been acknowledged yet.
        // A note missing from the server and NOT pending was deleted elsewhere.
        addPendingId('notes', localId);
        // An empty-title note cannot be created on the server (backend rejects
        // empty titles). Skip the doomed request — updateNote retries the create
        // with the latest content as soon as the user types a title.
        if (title.trim()) pushCreate(note);
        return localId;
      },
      updateNote: (id, updates) => {
        const realId = get().aliases[id] ?? id;
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === realId ? { ...n, ...updates, updatedAt: Date.now() } : n,
          ),
        }));
        const note = get().notes.find((n) => n.id === realId);
        if (!note) return;
        if (isPending('notes', realId)) {
          // Still awaiting a successful create — re-attempt with the CURRENT
          // full note so a freshly-typed title reaches the server immediately.
          pushCreate(note);
        } else {
          syncUpdateNote(realId, updates).catch(() => {});
        }
      },
      deleteNote: (id) => {
        const realId = get().aliases[id] ?? id;
        set((s) => {
          const aliases = { ...s.aliases };
          for (const [local, server] of Object.entries(aliases)) {
            if (local === id || server === realId) delete aliases[local];
          }
          return { notes: s.notes.filter((n) => n.id !== realId), aliases };
        });
        removePendingId('notes', realId);
        syncDeleteNote(realId).catch(() => {});
      },
      togglePin: (id) => {
        const realId = get().aliases[id] ?? id;
        set((s) => ({
          notes: s.notes.map((n) => (n.id === realId ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n)),
        }));
        const note = get().notes.find((n) => n.id === realId);
        if (!note) return;
        if (isPending('notes', realId)) {
          pushCreate(note);
        } else {
          syncUpdateNote(realId, { pinned: note.pinned }).catch(() => {});
        }
      },
      searchNotes: (query) => {
        const q = query.trim().toLowerCase();
        const all = sortNotes(get().notes);
        if (!q) return all;
        return all.filter(
          (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
        );
      },
      };
    },
    {
      name: 'morven-notes',
      storage: createJSONStorage(() => scopedStorage),
    },
  ),
);
