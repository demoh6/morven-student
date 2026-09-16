import type { StateStorage } from 'zustand/middleware';
import { scopedKey } from './scope';

/**
 * Zustand persist storage adapter that routes a zustand store's logical name
 * (e.g. "morven-stats") through the current storage scope. Called at persist
 * read/write time, so a scope switch (guest → account on login, or back on
 * logout) is re-read on every access.
 */
export const scopedStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(scopedKey(name.replace(/^morven-/, ''))),
  setItem: (name, value) => localStorage.setItem(scopedKey(name.replace(/^morven-/, '')), value),
  removeItem: (name) => localStorage.removeItem(scopedKey(name.replace(/^morven-/, ''))),
};