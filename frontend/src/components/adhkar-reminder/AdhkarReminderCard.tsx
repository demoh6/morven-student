/**
 * Adhkar Reminder card — the NON-BLOCKING reminder surface.
 *
 * Deliberately the opposite of the Prayer Pause overlay: it is a small fixed
 * corner card with no backdrop, no focus trap, no key capture, no scroll lock
 * and no countdown. The rest of Morven stays fully usable while it is up.
 *
 * The card carries exactly two actions:
 *   - «قراءة الأذكار» (primary): reused by the host to navigate to the
 *     existing Adhkar tool and open the morning/evening category.
 *   - «تخطي» (secondary): dismisses the reminder for the day.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bookmark, Sunrise, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { ADHKAR_REMINDER_Z_INDEX } from './config';
import type { AdhkarReminderSlot } from './adhkarReminder';

const SLOT_META: Record<AdhkarReminderSlot, { title: string; icon: LucideIcon }> = {
  morning: { title: 'أذكار الصباح', icon: Sunrise },
  evening: { title: 'أذكار المساء', icon: Bookmark },
};

const PRIMARY_ACTION = 'قراءة الأذكار';
const SKIP_ACTION = 'تخطي';

interface AdhkarReminderCardProps {
  slot: AdhkarReminderSlot;
  visible: boolean;
  onOpenAdhkar: () => void;
  onSkip: () => void;
}

export function AdhkarReminderCard({
  slot,
  visible,
  onOpenAdhkar,
  onSkip,
}: AdhkarReminderCardProps) {
  const reducedMotion = useReducedMotion();
  const meta = SLOT_META[slot];
  const Icon = meta.icon;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          data-adhkar-reminder={slot}
          dir="rtl"
          role="region"
          aria-label={`تذكير ${meta.title}`}
          className="fixed bottom-4 end-4 w-[min(24rem,calc(100vw-2rem))]"
          style={{ zIndex: ADHKAR_REMINDER_Z_INDEX }}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        >
          <Card padding="md" className="w-full">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {meta.title}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  حان وقت {meta.title}، اذهب لقراءة الأذكار.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <Button onClick={onOpenAdhkar} className="flex-1">
                {PRIMARY_ACTION}
              </Button>
              <Button variant="ghost" onClick={onSkip} className="flex-1">
                {SKIP_ACTION}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}