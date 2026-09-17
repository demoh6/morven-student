import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card } from '@/components/UI/Card';
import { StudyGroupCard } from '@/pages/connect/Groups/StudyGroupCard';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { listGroups, type Group } from '@/services/groupApi';
import {
  Users,
  BookOpen,
  UserPlus,
  Plus,
  ChevronLeft,
} from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

export default function ConnectLandingPage() {
  const user = useAuthStore((s) => s.user);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoadingGroups(false);
      return;
    }
    (async () => {
      try {
        const { groups: g } = await listGroups();
        setGroups(g);
      } catch {
        // silently fail
      } finally {
        setLoadingGroups(false);
      }
    })();
  }, [user]);

  return (
    <div className="min-h-full" dir="rtl">
      {/* Hero Section — Full-width immersive workspace entrance */}
      <div className="relative overflow-hidden">
        {/* Background gradients */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -start-20 w-80 h-80 rounded-full bg-primary-200/40 dark:bg-primary-900/25 blur-3xl" />
          <div className="absolute -bottom-24 -end-10 w-96 h-96 rounded-full bg-emerald-300/25 dark:bg-emerald-700/15 blur-3xl" />
          <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-primary-100/25 dark:bg-primary-800/10 blur-2xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-10">
          {/* Center: Main content */}
          <div className="flex flex-col items-center text-center">
              {/* Title */}
              <motion.h1
                {...fadeUp}
                className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white leading-none tracking-tight mb-4"
              >
                الملتقى التعليمي
              </motion.h1>

              {/* Welcome */}
              <motion.p
                {...fadeUp}
                className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-7"
              >
                {user ? (
                  <>مرحباً، <span className="font-semibold text-primary-600 dark:text-primary-400">{user.displayName}</span></>
                ) : (
                  <>المكان الذي تتعاون فيه مع زملائك</>
                )}
              </motion.p>

              {/* Description */}
              <motion.p
                {...fadeUp}
                className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 max-w-md leading-relaxed mb-8"
              >
                {user
                  ? 'أنشئ مجموعات، تعاون مع زملائك، واكتشف موارد مشتركة.'
                  : 'انضم للملتقى للتعاون مع زملائك في مجموعات دراسية مشتركة.'
                }
              </motion.p>

              {/* Action buttons */}
              {user ? (
                <motion.div {...fadeUp} className="flex flex-wrap items-center justify-center gap-2.5">
                  <Link
                    to="/connect/groups"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold shadow-md shadow-primary-600/20 hover:shadow-lg hover:shadow-primary-600/30 transition-all duration-200"
                  >
                    <Users className="w-4 h-4" />
                    المجموعات الدراسية
                  </Link>
                  <Link
                    to="/connect/resources"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 dark:bg-dark-card/70 hover:bg-white dark:hover:bg-dark-card text-gray-700 dark:text-gray-200 text-sm font-semibold border border-light-border dark:border-dark-border shadow-sm transition-all duration-200"
                  >
                    <BookOpen className="w-4 h-4" />
                    الموارد الدراسية
                  </Link>
                </motion.div>
              ) : (
                <motion.div {...fadeUp} className="flex flex-wrap items-center justify-center gap-2.5">
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold shadow-md shadow-primary-600/20 hover:shadow-lg transition-all duration-200"
                  >
                    إنشاء حساب مجاني
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/70 dark:bg-dark-card/70 hover:bg-white dark:hover:bg-dark-card text-gray-700 dark:text-gray-200 text-sm font-semibold border border-light-border dark:border-dark-border shadow-sm transition-all duration-200"
                  >
                    تسجيل الدخول
                  </Link>
                </motion.div>
              )}
            </div>

          {/* Stats row (for logged-in users) */}
          {user && (
            <motion.div
              variants={stagger}
              initial="initial"
              animate="animate"
              className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-10 max-w-2xl mx-auto"
            >
              {[
                {
                  label: 'مجموعات دراسية',
                  value: groups.length,
                  icon: Users,
                  color: 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400',
                },
                {
                  label: 'زملاء',
                  value: groups.reduce((acc, g) => acc + (g.memberCount || 0), 0),
                  icon: UserPlus,
                  color: 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400',
                },
                {
                  label: 'موارد دراسية',
                  value: '—',
                  icon: BookOpen,
                  color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
                },
              ].map((stat) => (
                <motion.div
                  key={stat.label}
                  variants={fadeUp}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-white/60 dark:bg-dark-card/60 border border-light-border/60 dark:border-dark-border/60 backdrop-blur-sm"
                >
                  <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center shrink-0`}>
                    <stat.icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-gray-900 dark:text-white leading-none tabular-nums">
                      {stat.value}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {stat.label}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* Content section */}
      {user && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-12">
          {/* Recent Groups */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                المجموعات الدراسية
              </h2>
              <Link
                to="/connect/groups"
                className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
              >
                عرض الكل
                <ChevronLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loadingGroups ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-dark-surface animate-pulse" />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <Card padding="lg" className="border-dashed">
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-3">
                    <Users className="w-6 h-6 text-primary-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    لم تنضم لأي مجموعة بعد
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                    أنشئ مجموعة أو انضم لمجموعة مع أصدقائك
                  </p>
                  <Link
                    to="/connect/groups"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold shadow-sm shadow-primary-600/20 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    إنشاء مجموعة
                  </Link>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groups.slice(0, 4).map((g) => (
                  <StudyGroupCard key={g.id} group={g} />
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Not logged in — feature showcase */}
      {!user && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-12">
          <motion.div
            variants={stagger}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto"
          >
            {[
              {
                icon: Users,
                title: 'مجموعات دراسية',
                description: 'أنشئ مجموعات وتعاون مع زملائك',
                gradient: 'from-primary-500 to-emerald-500',
              },
              {
                icon: BookOpen,
                title: 'موارد دراسية',
                description: 'شارك وتصفح الموارد التعليمية',
                gradient: 'from-amber-500 to-orange-500',
              },
            ].map((feature) => (
              <motion.div key={feature.title} variants={fadeUp}>
                <div className="p-4 rounded-2xl bg-white/60 dark:bg-dark-card/60 border border-light-border/60 dark:border-dark-border/60 backdrop-blur-sm h-full">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feature.gradient} text-white shadow-lg flex items-center justify-center mb-3`}>
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}
