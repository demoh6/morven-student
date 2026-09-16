import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DhikrCategory } from '@/pages/tools/GeneralTools/Adhkar/adhkar';
import { getAdhkarByCategory } from '@/pages/tools/GeneralTools/Adhkar/adhkar';
import { scopedStorage } from '@/storage/scopedStorage';

export type AdhkarCounts = Record<string, number>;

interface AdhkarStore {
  currentCategory: DhikrCategory | null;
  counts: AdhkarCounts;
  day: string;
  setCategory: (category: DhikrCategory | null) => void;
  increment: (id: string, repeatCount: number) => void;
  reset: (id: string) => void;
  resetCategory: (category: DhikrCategory) => void;
  resetAll: () => void;
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const initialState = {
  currentCategory: null as DhikrCategory | null,
  counts: {} as AdhkarCounts,
  day: todayKey(),
};

export const useAdhkarStore = create<AdhkarStore>()(
  persist(
    (set) => ({
      ...initialState,

      setCategory: (category) => set({ currentCategory: category }),

      increment: (id, repeatCount) =>
        set((s) => ({
          counts: {
            ...s.counts,
            [id]: Math.min(repeatCount, (s.counts[id] ?? 0) + 1),
          },
        })),

      reset: (id) =>
        set((s) => ({
          counts: { ...s.counts, [id]: 0 },
        })),

      resetCategory: (category) =>
        set((s) => {
          const next = { ...s.counts };
          for (const dhikr of getAdhkarByCategory(category)) {
            next[dhikr.id] = 0;
          }
          return { counts: next };
        }),

      resetAll: () => set({ counts: {} }),
    }),
    {
      name: 'morven-adhkar',
      storage: createJSONStorage(() => scopedStorage),
      partialize: (s) => ({ counts: s.counts, day: s.day }),
      merge: (persisted, current) => {
        const saved = persisted as
          | Partial<{ counts: AdhkarCounts; day: string }>
          | undefined;
        const fresh = saved && saved.day === todayKey();
        return {
          ...current,
          counts: fresh && saved?.counts ? saved.counts : {},
          day: todayKey(),
        };
      },
    },
  ),
);