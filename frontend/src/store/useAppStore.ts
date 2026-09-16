import { create } from 'zustand';
import type { ToolCategory, Notification, FileItem, Task, ExamCountdown, Flashcard } from '@/types';
import { v4 as uuid } from 'uuid';
import { readScoped, writeScoped } from '@/storage/scope';
import {
  syncCreateTask, syncUpdateTask, syncDeleteTask,
  syncCreateExam, syncDeleteExam,
  syncCreateFlashcard, syncDeleteFlashcard,
} from '@/services/syncService';
import { replaceRecordId } from '@/services/syncService';

interface AppStore {
  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Recent tools
  recentTools: string[];
  addRecentTool: (toolId: string) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (msg: string, type: Notification['type'], duration?: number) => void;
  removeNotification: (id: string) => void;

  // Files
  recentFiles: FileItem[];
  addFile: (file: FileItem) => void;

  // Tasks
  tasks: Task[];
  addTask: (title: string, description?: string, priority?: Task['priority'], dueDate?: string, taskType?: Task['taskType'], dailyTime?: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;

  // Exams
  exams: ExamCountdown[];
  addExam: (name: string, date: string, color: string) => void;
  deleteExam: (id: string) => void;

  // Flashcards
  flashcards: Flashcard[];
  addFlashcard: (front: string, back: string, deck: string) => void;
  deleteFlashcard: (id: string) => void;
}

const loadState = <T>(key: string, fallback: T): T => readScoped(key, fallback);

const saveState = (key: string, value: unknown) => writeScoped(key, value);

function replaceLocalId(scopeKey: string, localId: string, serverId: string) {
  if (serverId === localId) return;
  replaceRecordId(scopeKey, localId, serverId);
  const state = useAppStore.getState();
  if (scopeKey === 'tasks') {
    const updated = state.tasks.map(t => t.id === localId ? { ...t, id: serverId } : t);
    saveState('tasks', updated);
    useAppStore.setState({ tasks: updated });
  } else if (scopeKey === 'exams') {
    const updated = state.exams.map(e => e.id === localId ? { ...e, id: serverId } : e);
    saveState('exams', updated);
    useAppStore.setState({ exams: updated });
  } else if (scopeKey === 'flashcards') {
    const updated = state.flashcards.map(f => f.id === localId ? { ...f, id: serverId } : f);
    saveState('flashcards', updated);
    useAppStore.setState({ flashcards: updated });
  }
}

export const useAppStore = create<AppStore>((set, get) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  recentTools: loadState('recentTools', []),
  addRecentTool: (toolId) => {
    const current = get().recentTools.filter((id) => id !== toolId);
    const next = [toolId, ...current].slice(0, 20);
    saveState('recentTools', next);
    set({ recentTools: next });
  },

  notifications: [],
  addNotification: (message, type, duration = 3000) => {
    const id = uuid();
    set((s) => ({ notifications: [...s.notifications, { id, message, type, duration }] }));
    setTimeout(() => get().removeNotification(id), duration);
  },
  removeNotification: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  recentFiles: loadState('files', []),
  addFile: (file) => {
    const next = [file, ...get().recentFiles].slice(0, 30);
    saveState('files', next);
    set({ recentFiles: next });
  },

  tasks: loadState('tasks', []),
  addTask: (title, description, priority = 'medium', dueDate, taskType, dailyTime) => {
    const localId = uuid();
    const task: Task = {
      id: localId,
      title,
      description,
      completed: false,
      priority,
      dueDate,
      taskType,
      dailyTime,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [...get().tasks, task];
    saveState('tasks', next);
    set({ tasks: next });
    // Fire-and-forget: sync to server, replace local ID with server ID
    syncCreateTask(localId, {
      title, description: description ?? null, completed: false,
      priority, dueDate: dueDate ?? null, taskType: taskType ?? 'normal', dailyTime: dailyTime ?? null,
    }).then((serverId) => { if (serverId) replaceLocalId('tasks', localId, serverId); }).catch(() => {});
  },
  updateTask: (id, updates) => {
    const next = get().tasks.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t));
    saveState('tasks', next);
    set({ tasks: next });
    syncUpdateTask(id, updates).catch(() => {});
  },
  deleteTask: (id) => {
    const next = get().tasks.filter((t) => t.id !== id);
    saveState('tasks', next);
    set({ tasks: next });
    syncDeleteTask(id).catch(() => {});
  },
  toggleTask: (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const completed = !task.completed;
    const next = get().tasks.map((t) => (t.id === id ? { ...t, completed, updatedAt: Date.now() } : t));
    saveState('tasks', next);
    set({ tasks: next });
    syncUpdateTask(id, { completed }).catch(() => {});
  },

  exams: loadState('exams', []),
  addExam: (name, date, color) => {
    const localId = uuid();
    const exam: ExamCountdown = { id: localId, name, date, color, createdAt: Date.now() };
    const next = [...get().exams, exam];
    saveState('exams', next);
    set({ exams: next });
    syncCreateExam(localId, { name, date, color })
      .then((serverId) => { if (serverId) replaceLocalId('exams', localId, serverId); })
      .catch(() => {});
  },
  deleteExam: (id) => {
    const next = get().exams.filter((e) => e.id !== id);
    saveState('exams', next);
    set({ exams: next });
    syncDeleteExam(id).catch(() => {});
  },

  flashcards: loadState('flashcards', []),
  addFlashcard: (front, back, deck) => {
    const localId = uuid();
    const card: Flashcard = {
      id: localId,
      front,
      back,
      deck,
      difficulty: 'medium',
      nextReview: Date.now(),
      reviewCount: 0,
      createdAt: Date.now(),
    };
    const next = [...get().flashcards, card];
    saveState('flashcards', next);
    set({ flashcards: next });
    syncCreateFlashcard(localId, { front, back, deck })
      .then((serverId) => { if (serverId) replaceLocalId('flashcards', localId, serverId); })
      .catch(() => {});
  },
  deleteFlashcard: (id) => {
    const next = get().flashcards.filter((c) => c.id !== id);
    saveState('flashcards', next);
    set({ flashcards: next });
    syncDeleteFlashcard(id).catch(() => {});
  },
}));
