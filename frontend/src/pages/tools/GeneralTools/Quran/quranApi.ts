import { useState, useEffect, useCallback } from 'react';
import type { Reciter, Surah } from '@/pages/tools/GeneralTools/Quran/quran';

const RECITERS_CACHE_KEY = 'morven:quran:reciters:v1';
const SURAHS_CACHE_KEY = 'morven:quran:suwar:v1';

function readMetadataCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeMetadataCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* metadata cache is best-effort */
  }
}

const FEATURED_RECITER_IDS: string[] = [
  "5", // أحمد العجمي
  "12", //  ادريس أبكر
  "51",  // عبدالباسط عبدالصمد
  "92",  // ياسر الدوسري
  "86",  // ناصر القطامي
  "107", // محمد اللحيدان
  "112", // محمد صديق المنشاوي
  "102", // ماهر المعيقلي
  "217", // بندر بليله
  "231", // هزاع البلوشي
  "253", // اسلام صبحي
];

async function fetchRecitersInternal(): Promise<Reciter[]> {
  const res = await fetch('https://mp3quran.net/api/v3/reciters?language=ar');

  if (!res.ok) {
    throw new Error('Failed to fetch reciters');
  }

  const data = await res.json();

  const allReciters: Reciter[] = (data.reciters as any[])
    .filter(
      (r: any) =>
        r.moshaf &&
        r.moshaf.length > 0 &&
        r.moshaf[0].server,
    )
    .map((r: any) => {
      const moshaf = r.moshaf[0];

      return {
        id: String(r.id),
        name: r.name,
        style: moshaf?.name || '',
        server: moshaf.server.replace(/\/?$/, '/'),
      };
    });

  return FEATURED_RECITER_IDS.length > 0
    ? allReciters.filter((reciter) => FEATURED_RECITER_IDS.includes(reciter.id))
    : allReciters;
}

async function fetchSurahsInternal(): Promise<Surah[]> {
  const res = await fetch('https://mp3quran.net/api/v3/suwar?language=ar');

  if (!res.ok) {
    throw new Error('Failed to fetch surahs');
  }

  const data = await res.json();

  return (data.suwar as any[]).map((s: any) => ({
    id: s.id,
    name: s.name.trim(),
  }));
}

export function useQuranData() {
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const cachedReciters = readMetadataCache<Reciter[]>(RECITERS_CACHE_KEY);
      const cachedSurahs = readMetadataCache<Surah[]>(SURAHS_CACHE_KEY);
      const hasCache = Boolean(cachedReciters?.length && cachedSurahs?.length);

      // Serve cached metadata immediately so downloaded surahs stay usable
      // offline (and the list renders without waiting on the network).
      if (mounted && hasCache) {
        setReciters(cachedReciters as Reciter[]);
        setSurahs(cachedSurahs as Surah[]);
        setLoading(false);
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (mounted) {
          setLoading(false);
          if (!hasCache) {
            setError('أنت غير متصل بالإنترنت');
          }
        }
        return;
      }

      try {
        if (!hasCache) setLoading(true);

        const [recitersData, surahsData] = await Promise.all([
          fetchRecitersInternal(),
          fetchSurahsInternal(),
        ]);

        if (mounted) {
          setReciters(recitersData);
          setSurahs(surahsData);
          setError(null);
          writeMetadataCache(RECITERS_CACHE_KEY, recitersData);
          writeMetadataCache(SURAHS_CACHE_KEY, surahsData);
        }
      } catch (err) {
        if (mounted && !hasCache) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load Quran data',
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [reloadFlag]);

  const refetch = useCallback(() => setReloadFlag((f) => f + 1), []);

  return {
    reciters,
    surahs,
    loading,
    error,
    refetch,
  };
}
