import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, Search, ChevronDown, Download, Trash2, Check, Loader2 } from 'lucide-react';
import type { Reciter, Surah } from '@/pages/tools/GeneralTools/Quran/quran';
import { useQuranDownloadStore } from '@/pages/tools/GeneralTools/Quran/useQuranDownloadStore';
import { downloadKey } from '@/pages/tools/GeneralTools/Quran/quranDownloads';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface SurahSelectorProps {
  surahs: Surah[];
  currentSurah: Surah | null;
  reciter: Reciter | null;
  onSelect: (surah: Surah) => void;
}

export function SurahSelector({ surahs, currentSurah, reciter, onSelect }: SurahSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const downloaded = useQuranDownloadStore((s) => s.downloaded);
  const busy = useQuranDownloadStore((s) => s.busy);
  const progress = useQuranDownloadStore((s) => s.progress);
  const download = useQuranDownloadStore((s) => s.download);
  const remove = useQuranDownloadStore((s) => s.remove);
  const isOnline = useOnlineStatus();

  const filtered = useMemo(() => {
    if (!search.trim()) return surahs;
    const q = search.toLowerCase();
    return surahs.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        String(s.id).includes(q),
    );
  }, [surahs, search]);

  const selectSurah = (surah: Surah) => {
    onSelect(surah);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <Book className="w-4 h-4" />
        السورة
      </label>

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={[
            'w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border',
            currentSurah
              ? 'bg-white dark:bg-dark-card border-light-border dark:border-dark-border'
              : 'bg-gray-50 dark:bg-dark-surface border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500',
          ].join(' ')}
        >
          <span>
            {currentSurah
              ? `(${currentSurah.id}) ${currentSurah.name}`
              : 'اختر سورة'}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute z-50 mt-2 w-full rounded-xl border border-light-border dark:border-dark-border bg-white dark:bg-dark-card shadow-lg overflow-hidden"
            >
              <div className="p-3 border-b border-light-border dark:border-dark-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث..."
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  />
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto overscroll-contain">
                {filtered.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400 dark:text-gray-500 text-center">
                    لا توجد نتائج
                  </div>
                ) : (
                  <div className="p-1">
                    {filtered.map((surah) => {
                      const isActive = currentSurah?.id === surah.id;
                      const key = reciter ? downloadKey(reciter.id, surah.id) : null;
                      const isDownloaded = key ? Boolean(downloaded[key]) : false;
                      const isBusy = key ? Boolean(busy[key]) : false;
                      const ratio = key ? progress[key] ?? 0 : 0;
                      const percent = Math.round(ratio * 100);

                      return (
                        <div
                          key={surah.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectSurah(surah)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              selectSurah(surah);
                            }
                          }}
                          className={[
                            'relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 cursor-pointer',
                            isActive
                              ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-surface',
                          ].join(' ')}
                        >
                          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-dark-surface text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">
                            {surah.id}
                          </span>
                          <div className="flex-1 text-left">
                            <div className="font-medium">
                              {surah.name}
                            </div>
                          </div>

                          {reciter ? (
                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              {isBusy ? (
                                <span className="flex items-center gap-1 text-[11px] font-medium text-primary-600 dark:text-primary-400 tabular-nums">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  {percent}%
                                </span>
                              ) : isDownloaded ? (
                                <>
                                  <span
                                    title="متاح للاستماع دون اتصال"
                                    aria-label="متاح للاستماع دون اتصال"
                                    className="flex h-6 w-6 items-center justify-center rounded-lg text-emerald-600 dark:text-emerald-400"
                                  >
                                    <Check className="w-4 h-4" />
                                  </span>
                                  <button
                                    type="button"
                                    title="إزالة التحميل"
                                    aria-label={`إزالة تحميل سورة ${surah.name}`}
                                    onClick={() => void remove(reciter.id, surah.id)}
                                    className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  title={
                                    isOnline
                                      ? 'تحميل للاستماع دون اتصال'
                                      : 'تحميل السورة يتطلب اتصالاً بالإنترنت'
                                  }
                                  aria-label={`تحميل سورة ${surah.name}`}
                                  disabled={!isOnline}
                                  onClick={() => void download(reciter, surah)}
                                  className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400 dark:disabled:hover:text-gray-500 disabled:hover:bg-transparent"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ) : null}

                          {surah.verses ? (
                            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                              {surah.verses}
                            </span>
                          ) : null}

                          {isBusy ? (
                            <div className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-gray-200 dark:bg-dark-border overflow-hidden">
                              <div
                                className="h-full bg-primary-500 transition-all duration-150"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
