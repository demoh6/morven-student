import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card } from '@/components/UI/Card';
import { Button } from '@/components/UI/Button';
import { Avatar } from '@/pages/connect/Avatar';
import {
  getPublicProfile,
  getPublicAchievements,
  type Profile,
  type AchievementCounters,
} from '@/services/profileApi';
import AchievementMetricsGrid from '@/pages/Dashboard/Achievements/AchievementMetricsGrid';
import { userFacingMessage } from '@/services/apiError';
import { ChevronLeft, Shield, Trophy } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [achievements, setAchievements] = useState<AchievementCounters | null>(null);
  const [achievementsLoaded, setAchievementsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setAchievements(null);
      setAchievementsLoaded(false);
      try {
        const { profile: p } = await getPublicProfile(username);
        if (cancelled) return;
        setProfile(p);
        if (p.isPublic) {
          try {
            const { achievements: a } = await getPublicAchievements(username);
            if (!cancelled) {
              setAchievements(a);
              // Loaded successfully — even with zero achievements the card shows.
              setAchievementsLoaded(true);
            }
          } catch {
            // Achievements are optional: keep the public profile working, but
            // mark that the card's data is unavailable so we can show a graceful
            // empty state instead of silently hiding the card.
            if (!cancelled) setAchievementsLoaded(true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(userFacingMessage(err, 'حدث خطأ'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
          {error || 'المستخدم غير موجود'}
        </h2>
        <Button variant="secondary" className="mt-4" onClick={() => navigate(-1)}>
          العودة
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8" dir="rtl">
      {/* Back nav */}
      <motion.div {...fadeUp}>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 mb-6 group"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:ps-1" />
          <span className="text-sm font-medium">العودة</span>
        </button>
      </motion.div>

      {/* Profile card */}
      <motion.div {...fadeUp}>
        <Card padding="lg" className="relative overflow-hidden">
          <div className="absolute -top-10 -end-10 w-40 h-40 rounded-full bg-primary-100/40 dark:bg-primary-900/15 blur-2xl pointer-events-none" />
          <div className="relative flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="mb-4">
              <Avatar src={profile.avatarUrl} name={profile.displayName} size="lg" />
            </div>

            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {profile.displayName}
            </h1>

            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1" dir="ltr">
              @{profile.username}
            </p>

            {/* Bio is private info — only shown for public profiles */}
            {profile.isPublic && profile.bio && (
              <p className="mt-4 text-gray-600 dark:text-gray-300 text-sm leading-relaxed max-w-md">
                {profile.bio}
              </p>
            )}

            <div className="flex items-center gap-2 mt-4 text-xs text-gray-400 dark:text-gray-500">
              <Shield className="w-3.5 h-3.5" />
              <span>{profile.isPublic ? 'ملف عام' : 'ملف خاص'}</span>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Private profile: privacy notice — no achievements, stats, or other data */}
      {!profile.isPublic && (
        <motion.div {...fadeUp} className="mt-6">
          <Card padding="lg" className="relative overflow-hidden">
            <div className="flex items-center justify-center gap-3 text-center">
              <Shield className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                {'هذا الحساب خاص'}
              </p>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Achievements (public only — always shown, even with zero achievements) */}
      {profile.isPublic && achievementsLoaded && (
        <motion.div {...fadeUp} className="mt-6">
          <Card padding="lg" className="relative overflow-hidden">
            <div className="mb-6 flex items-center justify-center relative">
              <div className="absolute start-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <Trophy className="w-[18px] h-[18px] text-amber-600" strokeWidth={1.8} />
              </div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 text-center tracking-tight">
                {'إنجازات'}
              </h2>
            </div>
            <AchievementMetricsGrid
              counts={{
                completedTasks: achievements?.completedTasks ?? 0,
                cardsReviewed: achievements?.cardsReviewed ?? 0,
                completedSessions: achievements?.completedSessions ?? 0,
                meaningfulNotes: achievements?.meaningfulNotes ?? 0,
                files: achievements?.files ?? 0,
                flashcards: achievements?.flashcards ?? 0,
                quizzesCompleted: achievements?.quizzesCompleted ?? 0,
              }}
              total={achievements?.totalAchievements ?? 0}
              showMilestoneMessage={false}
              emptyLabel={'لا توجد إنجازات بعد'}
            />
          </Card>
        </motion.div>
      )}
    </div>
  );
}
