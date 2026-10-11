import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Play } from 'lucide-react';
import { Button } from '@/components/UI';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { portfolioLabels } from '../labels';

interface PortfolioLandingProps {
  onStart: () => void;
}

export default function PortfolioLanding({ onStart }: PortfolioLandingProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const initialised = useAuthStore((s) => s.initialized);
  const l = portfolioLabels.landing;

  const handleStart = () => {
    if (initialised && !user) {
      navigate('/login');
      return;
    }
    onStart();
  };

  return (
    <div className="space-y-8">
      <div className="text-center py-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-3 mb-5"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-lg shadow-primary-600/25">
            <GraduationCap className="w-8 h-8" />
          </div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white leading-snug"
        >
          {l.title}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
          className="mt-3 text-sm sm:text-base text-gray-500 dark:text-gray-400 max-w-xl mx-auto leading-relaxed"
        >
          {l.subtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18 }}
          className="mt-6"
        >
          <Button size="lg" onClick={handleStart} icon={<Play className="w-5 h-5" />}>
            {l.cta}
          </Button>
          {initialised && !user && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {l.accountNote}
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}