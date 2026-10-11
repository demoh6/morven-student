import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Crown, UserPlus, ChevronLeft } from 'lucide-react';
import type { Group } from '@/services/groupApi';
import { CachedImage } from '@/components/UI/CachedImage';

type StudyGroupCardProps = {
  group: Group;
  showArrow?: boolean;
};

export function StudyGroupCard({
  group: g,
  showArrow = false,
}: StudyGroupCardProps) {
  return (
    <Link to={`/connect/groups/${g.id}`}>
      <motion.div
        whileHover={{ y: -3, scale: 1.01 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="group relative rounded-2xl bg-white dark:bg-dark-card border border-light-border dark:border-dark-border shadow-card dark:shadow-card-dark hover:shadow-soft dark:hover:shadow-card-dark transition-all duration-300 overflow-hidden"
      >
        {/* Top accent line */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-primary-400 to-primary-600 opacity-70 group-hover:opacity-100 transition-opacity" />

        <div className="p-4 pt-5">
          {/* Header: icon + name + description */}
          <div className="flex items-center gap-3 mb-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-md flex items-center justify-center shrink-0 overflow-hidden">
              {g.imageUrl ? (
                <CachedImage
                  src={g.imageUrl}
                  alt={g.name}
                  className="w-full h-full object-cover"
                  fallback={<Users className="w-4 h-4" />}
                />
              ) : (
                <Users className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate leading-snug">
                  {g.name}
                </h3>
                {g.role === 'OWNER' && (
                  <Crown className="w-3 h-3 text-primary-400 dark:text-primary-500 shrink-0" />
                )}
              </div>
              {g.description && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                  {g.description}
                </p>
              )}
            </div>
            {showArrow && (
              <ChevronLeft className="w-5 h-5 text-gray-300 dark:text-gray-600 shrink-0 group-hover:text-primary-400 dark:group-hover:text-primary-500 transition-colors" />
            )}
          </div>

          {/* Footer: stats */}
          <div className="flex items-center pt-2.5 border-t border-light-border/60 dark:border-dark-border/60">
            <div className="flex items-center gap-3.5 text-[11px] text-gray-400 dark:text-gray-500">
              <span className="flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                {g.memberCount || 0}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
