import { create } from 'zustand';
import type { ToolCategory, Notification, FileItem, Task, ExamCountdown, Flashcard } from '@/types';
import { v4 as uuid } from 'uuid';
import { readScoped, writeScoped } from '@/storage/scope';

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
    const task: Task = {
      id: uuid(),
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
  },
  updateTask: (id, updates) => {
    const next = get().tasks.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t));
    saveState('tasks', next);
    set({ tasks: next });
  },
  deleteTask: (id) => {
    const next = get().tasks.filter((t) => t.id !== id);
    saveState('tasks', next);
    set({ tasks: next });
  },
  toggleTask: (id) => {
    const next = get().tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed, updatedAt: Date.now() } : t));
    saveState('tasks', next);
    set({ tasks: next });
  },

  exams: loadState('exams', []),
  addExam: (name, date, color) => {
    const exam: ExamCountdown = { id: uuid(), name, date, color, createdAt: Date.now() };
    const next = [...get().exams, exam];
    saveState('exams', next);
    set({ exams: next });
  },
  deleteExam: (id) => {
    const next = get().exams.filter((e) => e.id !== id);
    saveState('exams', next);
    set({ exams: next });
  },

  flashcards: loadState('flashcards', []),
  addFlashcard: (front, back, deck) => {
    const card: Flashcard = {
      id: uuid(),
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
  },
  deleteFlashcard: (id) => {
    const next = get().flashcards.filter((c) => c.id !== id);
    saveState('flashcards', next);
    set({ flashcards: next });
  },
}));
