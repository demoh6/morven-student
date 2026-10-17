import { create } from 'zustand';
import type { MockBatch, MockSubject, MockUniversity } from '../types';
import { fetchCatalog } from '../api/portfolioApi';

/**
 * Durable Portfolio Builder catalog.
 *
 * Universities, cohorts (batches) and courses now live in the backend; this
 * store loads them once and exposes the same synchronous selector helpers the
 * tool used when the data was a hardcoded mock module. Components subscribe to
 * the store so they re-render when the catalog finishes loading.
 */
interface CatalogState {
  universities: MockUniversity[];
  batches: MockBatch[];
  subjects: MockSubject[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}

export const usePortfolioCatalogStore = create<CatalogState>((set, get) => ({
  universities: [],
  batches: [],
  subjects: [],
  loading: false,
  loaded: false,
  error: null,

  load: async (force = false) => {
    const state = get();
    if (state.loading) return;
    if (state.loaded && !force) return;

    set({ loading: true, error: null });
    try {
      const catalog = await fetchCatalog();
      set({
        universities: catalog.universities,
        batches: catalog.batches,
        subjects: catalog.subjects,
        loaded: true,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: (err as Error).message || 'تعذر تحميل البيانات' });
    }
  },
}));

export const getUniversityById = (id: string): MockUniversity | undefined =>
  usePortfolioCatalogStore.getState().universities.find((u) => u.id === id);

export const getBatchById = (id: string): MockBatch | undefined =>
  usePortfolioCatalogStore.getState().batches.find((b) => b.id === id);

export const getSubjectById = (id: string): MockSubject | undefined =>
  usePortfolioCatalogStore.getState().subjects.find((s) => s.id === id);

export const getBatchesForUniversity = (universityId: string): MockBatch[] =>
  usePortfolioCatalogStore
    .getState()
    .batches.filter((b) => b.universityId === universityId)
    .sort((a, b) => a.order - b.order);

export const getSubjectsFor = (universityId: string, batchId: string): MockSubject[] =>
  usePortfolioCatalogStore
    .getState()
    .subjects.filter((s) => s.universityId === universityId && s.batchIds.includes(batchId));
