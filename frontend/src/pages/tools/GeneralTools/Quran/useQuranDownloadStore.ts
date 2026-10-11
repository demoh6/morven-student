import { create } from 'zustand';
import { useAppStore } from '@/store/useAppStore';
import type { Reciter, Surah } from '@/pages/tools/GeneralTools/Quran/quran';
import {
  QuotaError,
  downloadKey,
  downloadSurah,
  downloadsSupported,
  listDownloadedKeys,
  removeDownload,
} from '@/pages/tools/GeneralTools/Quran/quranDownloads';

interface QuranDownloadState {
  ready: boolean;
  downloaded: Record<string, boolean>;
  busy: Record<string, boolean>;
  progress: Record<string, number>;

  init: () => Promise<void>;
  download: (reciter: Reciter, surah: Surah) => Promise<void>;
  remove: (reciterId: string, surahId: number) => Promise<void>;
  isDownloaded: (reciterId: string, surahId: number) => boolean;
  getProgress: (reciterId: string, surahId: number) => number;
}

function notify(message: string, type: 'success' | 'info' | 'warning' | 'error', duration?: number) {
  if (duration === undefined) {
    useAppStore.getState().addNotification(message, type);
  } else {
    useAppStore.getState().addNotification(message, type, duration);
  }
}

let initPromise: Promise<void> | null = null;

export const useQuranDownloadStore = create<QuranDownloadState>((set, get) => ({
  ready: false,
  downloaded: {},
  busy: {},
  progress: {},

  init: () => {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const keys = await listDownloadedKeys();
        const downloaded: Record<string, boolean> = {};
        for (const key of keys) downloaded[key] = true;
        set({ downloaded, ready: true });
      } catch {
        set({ ready: true });
      }
    })();

    return initPromise;
  },

  download: async (reciter, surah) => {
    if (!downloadsSupported()) {
      notify('التحميل غير مدعوم في هذا المتصفح', 'error');
      return;
    }

    const key = downloadKey(reciter.id, surah.id);

    // Duplicate-download prevention: ignore while in progress or once present.
    if (get().busy[key] || get().downloaded[key]) return;

    set((s) => ({
      busy: { ...s.busy, [key]: true },
      progress: { ...s.progress, [key]: 0 },
    }));

    let lastReported = -1;

    try {
      await downloadSurah(reciter, surah, (ratio) => {
        // Throttle UI updates to whole-percent steps.
        const percent = Math.floor(ratio * 100);
        if (percent === lastReported) return;
        lastReported = percent;
        set((s) => ({ progress: { ...s.progress, [key]: ratio } }));
      });

      set((s) => ({
        downloaded: { ...s.downloaded, [key]: true },
        busy: { ...s.busy, [key]: false },
        progress: { ...s.progress, [key]: 1 },
      }));

      notify(`تم تحميل سورة ${surah.name} للاستماع دون اتصال`, 'success');
    } catch (error) {
      set((s) => ({
        busy: { ...s.busy, [key]: false },
        progress: { ...s.progress, [key]: 0 },
      }));

      if (error instanceof QuotaError) {
        notify('لا توجد مساحة كافية في المتصفح لتحميل هذه السورة', 'error', 5000);
      } else {
        notify('فشل تحميل السورة، حاول مرة أخرى', 'error');
      }
    }
  },

  remove: async (reciterId, surahId) => {
    const key = downloadKey(reciterId, surahId);

    try {
      await removeDownload(reciterId, surahId);
    } catch {
      /* deletion is best-effort; state is still cleared below */
    }

    set((s) => {
      const downloaded = { ...s.downloaded };
      delete downloaded[key];
      const progress = { ...s.progress };
      delete progress[key];
      return { downloaded, progress };
    });

    notify('تم حذف التحميل', 'info');
  },

  isDownloaded: (reciterId, surahId) =>
    Boolean(get().downloaded[downloadKey(reciterId, surahId)]),

  getProgress: (reciterId, surahId) =>
    get().progress[downloadKey(reciterId, surahId)] ?? 0,
}));
