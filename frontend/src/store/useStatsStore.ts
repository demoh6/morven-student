import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { scopedStorage } from '@/storage/scopedStorage';

interface StatsState {
  cardsReviewed: number;
  quizzesCompleted: number;
  incrementCardsReviewed: (count?: number) => void;
  incrementQuizzesCompleted: () => void;
}

export const useStatsStore = create<StatsState>()(
  persist(
    (set) => ({
      cardsReviewed: 0,
      quizzesCompleted: 0,
      incrementCardsReviewed: (count = 1) =>
        set((s) => ({ cardsReviewed: s.cardsReviewed + count })),
      incrementQuizzesCompleted: () =>
        set((s) => ({ quizzesCompleted: s.quizzesCompleted + 1 })),
    }),
    { name: 'morven-stats', storage: createJSONStorage(() => scopedStorage) },
  ),
);
