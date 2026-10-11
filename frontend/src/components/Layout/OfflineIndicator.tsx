import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useOfflineNotice } from '@/hooks/useOnlineStatus';

export function OfflineIndicator() {
  const showOffline = useOfflineNotice();

  return (
    <AnimatePresence>
      {showOffline && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="bg-amber-500/95 dark:bg-amber-600/95 text-white text-xs sm:text-sm px-3 py-1.5 flex items-center justify-center gap-2 text-center"
          role="status"
          aria-live="polite"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            {'أنت غير متصل بالإنترنت — الأدوات المحلية لا تزال تعمل.'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
