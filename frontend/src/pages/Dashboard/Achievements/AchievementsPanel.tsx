import { useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePomodoroStore } from '@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore';
import { useNotesStore } from '@/pages/tools/GeneralTools/Notes/useNotesStore';
import { useStatsStore } from '@/store/useStatsStore';
import { useFileStorage } from '@/hooks/useFileStorage';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { incrementAchievements, getPublicAchievements } from '@/services/profileApi';
import { Trophy } from 'lucide-react';
import {
  computeAchievementTotal,
  type AchievementMetricCounts,
} from './achievementMetrics';
import AchievementMetricsGrid from './AchievementMetricsGrid';

/**
 * Server-authoritative achievements with increment-based sync.
 *
 * Local counters are used for display. On mount, we fetch the server totals
 * and use them as the baseline. Subsequent local increases are sent as
 * increments (never destructive overwrites). The server counters are always
 * >= local — they're never reduced.
 */
export default function AchievementsPanel() {
  const tasks = useAppStore((s) => s.tasks);
  const flashcards = useAppStore((s) => s.flashcards);
  const completedSessions = usePomodoroStore((s) => s.completedSessions);
  const notes = useNotesStore((s) => s.notes);
  const { files } = useFileStorage();
  const cardsReviewed = useStatsStore((s) => s.cardsReviewed);
  const quizzesCompleted = useStatsStore((s) => s.quizzesCompleted);
  const user = useAuthStore((s) => s.user);

  const completedTasks = useMemo(
    () => tasks.filter((t) => t.completed).length,
    [tasks],
  );

  const meaningfulNotes = useMemo(
    () => notes.filter((n) => n.title.trim() || n.content.trim()).length,
    [notes],
  );

  const counts: AchievementMetricCounts = {
    completedTasks,
    cardsReviewed,
    completedSessions,
    meaningfulNotes,
    files: files.length,
    flashcards: flashcards.length,
    quizzesCompleted,
  };

  const totalAchievements = computeAchievementTotal(counts);

  // Track the server baseline so we only send positive deltas.
  const lastSyncedRef = useRef<AchievementMetricCounts | null>(null);

  // On mount (when logged in), fetch server baseline.
  useEffect(() => {
    if (!user) return;
    const username = user.username;
    getPublicAchievements(username)
      .then(({ achievements }) => {
        lastSyncedRef.current = {
          completedTasks: achievements.completedTasks,
          cardsReviewed: achievements.cardsReviewed,
          completedSessions: achievements.completedSessions,
          meaningfulNotes: achievements.meaningfulNotes,
          files: achievements.files,
          flashcards: achievements.flashcards,
          quizzesCompleted: achievements.quizzesCompleted,
        };
      })
      .catch(() => {
        // If fetch fails, start from zero baseline (will increment local deltas).
        lastSyncedRef.current = {
          completedTasks: 0,
          cardsReviewed: 0,
          completedSessions: 0,
          meaningfulNotes: 0,
          files: 0,
          flashcards: 0,
          quizzesCompleted: 0,
        };
      });
  }, [user]);

  // When totals change, send only the positive delta since last sync.
  useEffect(() => {
    if (!user || !lastSyncedRef.current) return;

    const base = lastSyncedRef.current;
    const deltas: Partial<AchievementMetricCounts> = {};
    const advanced: AchievementMetricCounts = { ...base };
    (Object.keys(counts) as Array<keyof AchievementMetricCounts>).forEach((key) => {
      const diff = counts[key] - base[key];
      if (diff > 0) deltas[key] = diff;
      advanced[key] = counts[key];
    });

    if (Object.keys(deltas).length === 0) return;

    // Advance the baseline optimistically so concurrent renders don't re-increment.
    lastSyncedRef.current = advanced;

    incrementAchievements(deltas).catch(() => {
      // Ignore — server sync is best-effort.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAchievements, user]);

  const hasAny = totalAchievements > 0;

  return (
    <div className="w-full flex flex-col">
      {/* Header */}
      <div className="relative flex items-center justify-center mb-8">
        <div className="absolute start-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
          <Trophy className="w-[18px] h-[18px] text-amber-600" strokeWidth={1.8} />
        </div>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 text-center tracking-tight">
          {'إنجازاتك'}
        </h2>
      </div>

      {!hasAny ? (
        <div className="flex flex-col items-center justify-center flex-1 py-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mb-4">
            <Trophy className="w-7 h-7 text-amber-300 dark:text-amber-500" strokeWidth={1.4} />
          </div>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">
            {'لم تبدأ انجازاتك بعد'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[220px]">
            {'ابدأ باستخدام الأدوات وسجل أول إنجاز لك.'}
          </p>
        </div>
      ) : (
        <AchievementMetricsGrid counts={counts} total={totalAchievements} />
      )}
    </div>
  );
}
