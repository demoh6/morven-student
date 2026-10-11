import { create } from 'zustand';
import type { Reciter, Surah } from '@/pages/tools/GeneralTools/Quran/quran';
import { audioUrl, getCachedAudioUrl } from '@/pages/tools/GeneralTools/Quran/quranDownloads';
import { useAppStore } from '@/store/useAppStore';
import { OFFLINE_NOTICE_DURATION_MS } from '@/hooks/useOnlineStatus';

let _audio: HTMLAudioElement | null = null;

// Object URL for the currently loaded cached (offline) audio blob. Owned by
// this module and revoked whenever the source changes.
let _objectUrl: string | null = null;
// Guards against out-of-order async source resolution when the user rapidly
// switches surah/reciter.
let _sourceToken = 0;

function releaseObjectUrl(): void {
  if (_objectUrl) {
    try {
      URL.revokeObjectURL(_objectUrl);
    } catch {
      /* ignore */
    }
    _objectUrl = null;
  }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Resolve the audio source for a reciter/surah pair: prefer the downloaded
 * (offline) copy and fall back to the remote URL. Never attempts a network
 * request for a surah that is not downloaded while offline.
 */
async function applyAudioSource(
  reciter: Reciter,
  surah: Surah,
  autoplay: boolean,
): Promise<void> {
  const token = ++_sourceToken;
  const audio = initAudio();

  let cachedUrl: string | null = null;
  try {
    cachedUrl = await getCachedAudioUrl(reciter.id, surah.id);
  } catch {
    cachedUrl = null;
  }

  // A newer source request superseded this one; discard the stale URL.
  if (token !== _sourceToken) {
    if (cachedUrl) {
      try {
        URL.revokeObjectURL(cachedUrl);
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (!cachedUrl && isOffline()) {
    releaseObjectUrl();
    audio.removeAttribute('src');
    audio.load();
    useAppStore
      .getState()
      .addNotification(
        'هذه السورة غير محمّلة، حمّلها أولاً للاستماع دون اتصال',
        'warning',
        OFFLINE_NOTICE_DURATION_MS,
      );
    return;
  }

  releaseObjectUrl();

  if (cachedUrl) {
    _objectUrl = cachedUrl;
    audio.src = cachedUrl;
  } else {
    audio.src = audioUrl(reciter.server, surah.id);
  }

  audio.load();

  if (autoplay) {
    audio.play().catch(() => {});
  }
}

function initAudio(): HTMLAudioElement {
  if (_audio) return _audio;

  _audio = new Audio();
  _audio.preload = 'metadata';

  _audio.addEventListener('timeupdate', () => {
    const store = useQuranStore.getState();
    if (_audio) {
      store._setCurrentTime(_audio.currentTime);
    }
  });

  _audio.addEventListener('loadedmetadata', () => {
    const store = useQuranStore.getState();
    if (_audio && isFinite(_audio.duration)) {
      store._setDuration(_audio.duration);
    }
  });

  _audio.addEventListener('ended', () => {
    useQuranStore.setState({ isPlaying: false });
  });

  _audio.addEventListener('play', () => {
    useQuranStore.setState({ isPlaying: true });
  });

  _audio.addEventListener('pause', () => {
    useQuranStore.setState({ isPlaying: false });
  });

  return _audio;
}

interface QuranStore {
  currentReciter: Reciter | null;
  currentSurah: Surah | null;
  isPlaying: boolean;
  volume: number;
  duration: number;
  currentTime: number;

  setReciter: (reciter: Reciter) => void;
  setSurah: (surah: Surah) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;

  _setCurrentTime: (time: number) => void;
  _setDuration: (duration: number) => void;
}

export const useQuranStore = create<QuranStore>((set, get) => ({
  currentReciter: null,
  currentSurah: null,
  isPlaying: false,
  volume: 0.8,
  duration: 0,
  currentTime: 0,

  setReciter: (reciter) => {
    set({ currentReciter: reciter });

    if (get().currentSurah) {
      get().setSurah(get().currentSurah!);
    }
  },

  setSurah: (surah) => {
    const state = get();
    const wasPlaying = state.isPlaying;

    set({ currentSurah: surah, currentTime: 0, duration: 0 });

    if (!state.currentReciter) return;

    void applyAudioSource(state.currentReciter, surah, wasPlaying);
  },

  play: () => {
    const audio = initAudio();
    const state = get();

    if (!state.currentSurah || !state.currentReciter) return;

    const hasSource =
      Boolean(audio.src) && audio.src !== window.location.href;

    if (!hasSource) {
      void applyAudioSource(state.currentReciter, state.currentSurah, true);
      return;
    }

    audio.play().catch(() => {});
  },

  pause: () => {
    const audio = initAudio();
    audio.pause();
  },

  seek: (time) => {
    const audio = initAudio();
    audio.currentTime = time;
    set({ currentTime: time });
  },

  setVolume: (volume) => {
    const audio = initAudio();
    audio.volume = volume;
    set({ volume });
  },

  _setCurrentTime: (time) => {
    set({ currentTime: time });
  },

  _setDuration: (duration) => {
    set({ duration });
  },
}));
