import { CalendarClock, CheckCircle2, Plus } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Button,
  Card,
  Modal,
  Input,
  TextArea,
  Select,
  EmptyState,
  Badge,
  Tooltip,
  ProgressBar,
} from '@/components/UI';
import { getToolById } from '@/data/tools';
import { useAppStore } from '@/store/useAppStore';
import { useAdhkarStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarStore';
import { usePomodoroStore, type PomodoroMode, type PomodoroSettings, type PomodoroTheme, type TimerMode } from '@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore';
import { SegmentTimeDisplay } from '@/pages/tools/GeneralTools/Pomodoro/SevenSegment';
import { formatClock, hasClockHours } from '@/pages/tools/GeneralTools/Pomodoro/formatTime';
import { useFullscreen } from '@/pages/tools/GeneralTools/Pomodoro/useFullscreen';
import natureBackground from '@/assets/nature-focus.webp';
import type { Task, ExamCountdown } from '@/types';
import QuranPage from './Quran/QuranPage';
import NotesPage from './Notes/Notes';
import CvBuilder from './cv/CvBuilder';
import AdhkarPage from './Adhkar/AdhkarPage';
import { ToolHero } from '@/pages/tools/ToolHero';


// Shared

interface GeneralToolPageProps {
  toolId: string;
}
export default function GeneralToolPage({ toolId }: GeneralToolPageProps) {
  const navigate = useNavigate();
  const tool = getToolById(toolId);
  const adhkarCategory = useAdhkarStore((s) => s.currentCategory);
  // Inside an Adhkar category, the page owns its own chrome (hero + back
  // button) and the general-tools header must disappear entirely.
  const inAdhkarCategory = toolId === 'adhkar' && adhkarCategory !== null;

  let content: React.ReactNode;

  switch (toolId) {
    case 'pomodoro-timer':
      content = <PomodoroTimer />;
      break;

    case 'task-manager':
      content = <TaskManager />;
      break;

    case 'exam-countdown':
      content = <ExamCountdownPage />;
      break;

    case 'holy-quran':
      content = <QuranPage />;
      break;

    case 'adhkar':
      content = <AdhkarPage />;
      break;

    case 'notes':
      content = <NotesPage />;
      break;

    case 'cv-builder':
      content = <CvBuilder />;
      break;

 

    default:
      return (
        <EmptyState
          icon={<span className="text-4xl">🔧</span>}
          title="الأداة غير موجودة"
          description="هذه الأداة غير متاحة حالياً."
        />
      );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      {!inAdhkarCategory && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <button
            onClick={() => navigate('/category/general')}
            className="flex items-center gap-2 text-gray-500 hover:text-primary-500 dark:text-gray-400 dark:hover:text-primary-400 transition-colors mb-6 group"
          >
            <svg
              className="w-5 h-5 transition-transform rotate-180 group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>

            <span className="text-sm font-medium">العودة للأدوات العامة</span>
          </button>
        </motion.div>
      )}

      {!inAdhkarCategory && tool && tool.id !== 'notes' && (
        <ToolHero
          icon={<tool.icon className="w-7 h-7" />}
          title={tool.name}
          description={tool.description}
        />
      )}

      {content}
    </div>
  );
}

 



// =============================================================================
// 1. POMODORO TIMER
// =============================================================================

function sendBrowserNotification(title: string, body: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '🍅' });
  }
}

const modeColors: Record<PomodoroMode, { ring: string; bg: string; text: string; glow: string; label: string }> = {
  focus: {
    ring: 'stroke-blue-500',
    bg: 'from-blue-500 to-blue-600',
    text: 'text-blue-600 dark:text-blue-400',
    glow: 'shadow-blue-500/30',
    label: 'تركيز',
  },
  break: {
    ring: 'stroke-emerald-500',
    bg: 'from-emerald-500 to-emerald-600',
    text: 'text-emerald-600 dark:text-emerald-400',
    glow: 'shadow-emerald-500/30',
    label: 'استراحة',
  },
  longBreak: {
    ring: 'stroke-purple-500',
    bg: 'from-purple-500 to-purple-600',
    text: 'text-purple-600 dark:text-purple-400',
    glow: 'shadow-purple-500/30',
    label: 'استراحة طويلة',
  },
};

function PomodoroTimer() {
  const [showSettings, setShowSettings] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const fullscreen = useFullscreen();
  const mode = usePomodoroStore((s) => s.mode);
  const timeRemaining = usePomodoroStore((s) => s.timeRemaining);
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const isPaused = usePomodoroStore((s) => s.isPaused);
  const currentSession = usePomodoroStore((s) => s.currentSession);
  const completedSessions = usePomodoroStore((s) => s.completedSessions);
  const totalFocusSeconds = usePomodoroStore((s) => s.totalFocusSeconds);
  const settings = usePomodoroStore((s) => s.settings);
  const start = usePomodoroStore((s) => s.start);
  const pause = usePomodoroStore((s) => s.pause);
  const resume = usePomodoroStore((s) => s.resume);
  const reset = usePomodoroStore((s) => s.reset);
  const skip = usePomodoroStore((s) => s.skip);
  const setMode = usePomodoroStore((s) => s.setMode);
  const setSettings = usePomodoroStore((s) => s.setSettings);
  const setTheme = usePomodoroStore((s) => s.setTheme);
  const addNotification = useAppStore((s) => s.addNotification);
  const currentMode = mode;
  // Theme is presentation-only: it never touches the timer state machine.
  const displayTheme: PomodoroTheme = settings.theme ?? 'classic';
  const isCountUp = settings.timerMode === 'countup';
  const totalDuration = currentMode === 'focus' ? settings.focusDuration * 60 : currentMode === 'break' ? settings.breakDuration * 60 : settings.longBreakDuration * 60;

  const handleSaveSettings = (newSettings: PomodoroSettings) => {
    setSettings(newSettings);
    addNotification('تم الحفظ', 'success');
  };

  const openImmersive = () => {
    setImmersive(true);
    // Wait for the overlay to mount so its ref is attached before requesting
    // the browser fullscreen.
    requestAnimationFrame(() => fullscreen.enter());
  };

  const closeImmersive = useCallback(() => {
    setImmersive(false);
    fullscreen.exit();
  }, [fullscreen]);

  // Keyboard shortcuts: F = fullscreen toggle, Esc = exit fullscreen,
  // Space = start / continue / pause the timer.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (showSettings) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isRunning) pause();
        else if (isPaused && timeRemaining > 0) resume();
        else start();
      } else if (e.code === 'KeyF') {
        if (immersive) closeImmersive();
        else openImmersive();
      } else if (e.code === 'Escape') {
        if (immersive) closeImmersive();
      } else if (e.code === 'KeyR') {
        reset();
      } else if (e.code === 'KeyS') {
        skip();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showSettings,
    isRunning,
    isPaused,
    timeRemaining,
    immersive,
    start,
    pause,
    resume,
    reset,
    skip,
    closeImmersive,
    openImmersive,
  ]);

  // Esc (or the browser's native exit) drops document fullscreen without a
  // keydown reaching the page. Watch fullscreenchange: any time we lose
  // fullscreen we had, close the immersive overlay so Esc fully exits.
  const wasFullscreenRef = useRef(false);
  useEffect(() => {
    if (wasFullscreenRef.current && !fullscreen.isFullscreen) {
      wasFullscreenRef.current = false;
      setImmersive(false);
    } else {
      wasFullscreenRef.current = fullscreen.isFullscreen;
    }
  }, [fullscreen.isFullscreen]);

  const showHours = hasClockHours(timeRemaining);
  // Controls auto-hide: while the Pomodoro runs, the action buttons stay visible
  // for 5s and reappear on any mouse/touch/pointer interaction; they are always
  // visible when the timer is paused or stopped.
  const isRunningRef = useRef(isRunning);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);

  const scheduleControlsHide = useCallback(() => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      hideControlsTimerRef.current = null;
      if (isRunningRef.current) setControlsVisible(false);
    }, 5000);
  }, []);

  const pokeControls = useCallback(() => {
    if (!isRunningRef.current) return;
    scheduleControlsHide();
    setControlsVisible(true);
  }, [scheduleControlsHide]);

  useEffect(() => {
    isRunningRef.current = isRunning;
    if (isRunning) {
      // Freshly started session: keep the controls visible for the first 5s.
      setControlsVisible(true);
      scheduleControlsHide();
    } else {
      // Not running (paused or stopped): controls stay visible, no auto-hide.
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
      setControlsVisible(true);
    }
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    };
  }, [isRunning, scheduleControlsHide]);

  // Any interaction while running re-shows the controls and restarts the 5s
  // inactivity countdown. Listeners are removed when the component unmounts.
  useEffect(() => {
    const onInteraction = () => pokeControls();
    window.addEventListener('pointermove', onInteraction);
    window.addEventListener('pointerdown', onInteraction);
    window.addEventListener('touchstart', onInteraction);
    return () => {
      window.removeEventListener('pointermove', onInteraction);
      window.removeEventListener('pointerdown', onInteraction);
      window.removeEventListener('touchstart', onInteraction);
    };
  }, [pokeControls]);

  const controlsShown = !isRunning || controlsVisible;
  // Count Up has no target duration, so its progress area stays empty (0%).
  const progress = isCountUp ? 0 : totalDuration > 0 ? ((totalDuration - timeRemaining) / totalDuration) * 100 : 0;
  const modeColor = modeColors[currentMode];
  const circumference = 2 * Math.PI * 120;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const formatTotalTime = (totalSecs: number) => {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);

  if (h > 0) return `${h}س ${m}د`;
  return `${m}د`;
};

  const modeLabel = (() => {
    switch (currentMode) {
      case 'focus': return 'تركيز';
      case 'break': return 'استراحة';
      case 'longBreak': return 'استراحة طويلة';
    }
  })();

  return (
    <div className="flex flex-col items-center gap-8 py-6">
      {/* Timer Display (theme-aware) */}
      {displayTheme === 'classic' && (
        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
        >
          <div className="relative w-72 h-72 md:w-80 md:h-80">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 260 260">
              <circle
                cx="130" cy="130" r="120"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-gray-200 dark:text-gray-700"
              />
              <motion.circle
                cx="130" cy="130" r="120"
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                className={modeColor.ring}
                stroke="currentColor"
                strokeDasharray={circumference}
                animate={{ strokeDashoffset }}
                transition={{ duration: 0.5, ease: 'linear' }}
              />
            </svg>

            <motion.div
              className={`absolute inset-4 rounded-full flex flex-col items-center justify-center bg-white dark:bg-dark-card shadow-lg ${isRunning ? `shadow-xl ${modeColor.glow}` : ''}`}
              animate={isRunning ? { boxShadow: [`0 0 20px 0px rgba(0,0,0,0.1)`, `0 0 40px 4px ${currentMode === 'focus' ? 'rgba(59,130,246,0.2)' : currentMode === 'break' ? 'rgba(16,185,129,0.2)' : 'rgba(168,85,247,0.2)'}`, `0 0 20px 0px rgba(0,0,0,0.1)`] } : {}}
              transition={isRunning ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={modeColor.label}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`text-sm font-semibold uppercase tracking-wider ${modeColor.text} mb-1`}
                >
                  {modeLabel}
                </motion.span>
              </AnimatePresence>

              <span className={`font-bold text-gray-800 dark:text-white font-mono tabular-nums ${showHours ? 'text-2xl md:text-3xl' : 'text-5xl md:text-6xl'}`}>
                {formatClock(timeRemaining)}
              </span>

              <span className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {`الجلسة ${Math.min(currentSession + 1, settings.sessionsUntilLongBreak)} من ${settings.sessionsUntilLongBreak}`}
              </span>
            </motion.div>
          </div>
        </motion.div>
      )}

      {displayTheme === 'digital' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, type: 'spring' }}
          className="w-full max-w-md relative"
        >
          <div className="bg-black rounded-3xl shadow-2xl p-8 sm:p-10 flex flex-col items-center select-none">
            <AnimatePresence mode="wait">
              <motion.span
                key={modeColor.label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm font-semibold uppercase tracking-[0.3em] mb-6 text-white/60"
              >
                {modeLabel}
              </motion.span>
            </AnimatePresence>

            <SegmentTimeDisplay
              seconds={timeRemaining}
              size={64}
              color="#ffffff"
            />

            <span className="text-xs text-white/45 mt-6 tabular-nums">
              {`الجلسة ${Math.min(currentSession + 1, settings.sessionsUntilLongBreak)} من ${settings.sessionsUntilLongBreak}`}
            </span>

            {isRunning && (
              <motion.div
                className="mt-4 h-1 rounded-full bg-white/10 overflow-hidden w-full max-w-[220px]"
              >
                <motion.div
                  className="h-full bg-white/40 rounded-full"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'linear' }}
                />
              </motion.div>
            )}
          </div>

          <button
            type="button"
            onClick={openImmersive}
            className="absolute top-3 end-3 p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="ملء الشاشة"
            aria-label="ملء الشاشة"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 00-2 2v3" />
              <path d="M21 8V5a2 2 0 00-2-2h-3" />
              <path d="M3 16v3a2 2 0 002 2h3" />
              <path d="M16 21h3a2 2 0 002-2v-3" />
            </svg>
          </button>
        </motion.div>
      )}

      {displayTheme === 'nature' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, type: 'spring' }}
          className="w-full"
        >
          <div className="relative w-full max-w-3xl mx-auto rounded-3xl overflow-hidden shadow-2xl border border-white/40 dark:border-white/10">
            <img
              src={natureBackground}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />

            <div className="relative flex flex-col items-center gap-4 px-4 py-10 sm:px-8 sm:py-14">
              <div className="relative w-56 h-56 md:w-64 md:h-64">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 260 260">
                  <circle cx="130" cy="130" r="120" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/25" />
                  <motion.circle
                    cx="130" cy="130" r="120"
                    fill="none" strokeWidth="8" strokeLinecap="round"
                    className="text-white"
                    stroke="currentColor"
                    strokeDasharray={circumference}
                    animate={{ strokeDashoffset }}
                    transition={{ duration: 0.5, ease: 'linear' }}
                  />
                </svg>
                <div className="absolute inset-4 rounded-full bg-black/35 backdrop-blur-sm flex flex-col items-center justify-center">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={modeColor.label}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm font-semibold uppercase tracking-wider text-emerald-200 mb-1"
                    >
                      {modeLabel}
                    </motion.span>
                  </AnimatePresence>
                  <span className={`font-bold text-white font-mono tabular-nums drop-shadow-lg ${showHours ? 'text-2xl md:text-3xl' : 'text-5xl md:text-6xl'}`}>
                    {formatClock(timeRemaining)}
                  </span>
                  <span className="text-xs text-white/70 mt-2 tabular-nums">
                    {`الجلسة ${Math.min(currentSession + 1, settings.sessionsUntilLongBreak)} من ${settings.sessionsUntilLongBreak}`}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={openImmersive}
              className="absolute top-3 end-3 p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/15 bg-black/20 backdrop-blur-sm transition-colors"
              title="ملء الشاشة"
              aria-label="ملء الشاشة"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 00-2 2v3" />
                <path d="M21 8V5a2 2 0 00-2-2h-3" />
                <path d="M3 16v3a2 2 0 002 2h3" />
                <path d="M16 21h3a2 2 0 002-2v-3" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}

      {/* Controls */}
      <div className={controlsShown ? '' : 'opacity-0 pointer-events-none'}>
        <motion.div
          className="flex items-center gap-3 flex-wrap justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
        {!isRunning && !isPaused && (
          <Button size="lg" onClick={start}>
            {'ابدأ'}
          </Button>
        )}
        {isRunning && (
          <Button size="lg" variant="secondary" onClick={pause}>
            {'إيقاف مؤقت'}
          </Button>
        )}
        {!isRunning && isPaused && timeRemaining > 0 && (
          <Button size="lg" onClick={resume}>
            {'استئناف'}
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={reset}>
          {'إعادة تعيين'}
        </Button>
        <Button size="lg" variant="ghost" onClick={skip}>
          {'تخطي'}
        </Button>
        <Button size="lg" variant="ghost" onClick={() => setShowSettings(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </Button>
        </motion.div>
      </div>

      {/* Stats */}
      <motion.div
        className="flex items-center gap-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{completedSessions}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{'إجمالي الجلسات'}</p>
        </div>
        <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
        <div>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{formatTotalTime(totalFocusSeconds)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{'إجمالي وقت التركيز'}</p>
        </div>
      </motion.div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-gray-100 dark:bg-dark-surface">
        {(['focus', 'break', 'longBreak'] as PomodoroMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => { if (!isRunning) setMode(mode); }}
            disabled={isRunning}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              currentMode === mode
                ? `bg-white dark:bg-dark-card shadow-md text-gray-800 dark:text-white`
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            } ${isRunning && currentMode !== mode ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {(() => {
              switch (mode) {
                case 'focus': return 'تركيز';
                case 'break': return 'استراحة';
                case 'longBreak': return 'استراحة طويلة';
              }
            })()}
          </button>
        ))}
      </div>

      {/* Settings Modal */}
      <PomodoroSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={handleSaveSettings}
        onSaveTheme={setTheme}
      />

      {/* Immersive (fullscreen) view — Digital & Nature: only theme visuals + exit */}
      {immersive && (displayTheme === 'digital' || displayTheme === 'nature') && (
        createPortal(
          <div
            ref={fullscreen.ref}
            className="fixed inset-0 z-[100] bg-black text-white font-sans"
          >
            {displayTheme === 'digital' && (
              <div
                className="w-full h-full flex flex-col items-center justify-center px-6"
                style={{
                  background: '#000',
                  ['--morven-flip-size' as string]: 'min(calc(100vw / 4.0), calc(92vh / 1.1))',
                }}
              >
                <SegmentTimeDisplay
                  seconds={timeRemaining}
                  size={120}
                  color="#ffffff"
                />

                {/* Small timer controls under the numbers */}
                <div className={`mt-6 flex flex-wrap items-center justify-center gap-2 absolute left-0 right-0 bottom-40 ${controlsShown ? '' : 'opacity-0 pointer-events-none'}`}>
                  {!isRunning && !isPaused && (
                    <button
                      type="button"
                      onClick={start}
                      className="px-8 py-3 text-[17px] rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
                    >
                      {'ابدأ'}
                    </button>
                  )}
                  {isRunning && (
                    <button
                      type="button"
                      onClick={pause}
                      className="px-8 py-3 text-[17px] rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
                    >
                      {'إيقاف مؤقت'}
                    </button>
                  )}
                  {!isRunning && isPaused && timeRemaining > 0 && (
                    <button
                      type="button"
                      onClick={resume}
                      className="px-8 py-3 text-[17px] rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
                    >
                      {'استئناف'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={reset}
                    className="px-8 py-3 text-[17px] rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
                  >
                    {'إعادة تعيين'}
                  </button>
                  <button
                    type="button"
                    onClick={skip}
                    className="px-8 py-3 text-[17px] rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
                  >
                    {'تخطي'}
                  </button>
                </div>
              </div>
            )}

            {displayTheme === 'nature' && (
              <div className="relative w-full h-full">
                <img
                  src={natureBackground}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  draggable={false}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/65" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-64 h-64 md:w-80 md:h-80">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 260 260">
                      <circle cx="130" cy="130" r="120" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/25" />
                      <motion.circle
                        cx="130" cy="130" r="120"
                        fill="none" strokeWidth="8" strokeLinecap="round"
                        className="text-white"
                        stroke="currentColor"
                        strokeDasharray={circumference}
                        animate={{ strokeDashoffset }}
                        transition={{ duration: 0.5, ease: 'linear' }}
                      />
                    </svg>
                    <div className="absolute inset-4 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
                      <span className={`font-bold text-white font-mono tabular-nums drop-shadow-lg ${showHours ? 'text-3xl md:text-4xl' : 'text-6xl md:text-7xl'}`}>
                        {formatClock(timeRemaining)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Same small timer controls as the digital mode */}
                <div className={`absolute left-0 right-0 bottom-40 flex flex-wrap items-center justify-center gap-2 ${controlsShown ? '' : 'opacity-0 pointer-events-none'}`}>
                  {!isRunning && !isPaused && (
                    <button
                      type="button"
                      onClick={start}
                      className="px-8 py-3 text-[17px] rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
                    >
                      {'ابدأ'}
                    </button>
                  )}
                  {isRunning && (
                    <button
                      type="button"
                      onClick={pause}
                      className="px-8 py-3 text-[17px] rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
                    >
                      {'إيقاف مؤقت'}
                    </button>
                  )}
                  {!isRunning && isPaused && timeRemaining > 0 && (
                    <button
                      type="button"
                      onClick={resume}
                      className="px-8 py-3 text-[17px] rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
                    >
                      {'استئناف'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={reset}
                    className="px-8 py-3 text-[17px] rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
                  >
                    {'إعادة تعيين'}
                  </button>
                  <button
                    type="button"
                    onClick={skip}
                    className="px-8 py-3 text-[17px] rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
                  >
                    {'تخطي'}
                  </button>
                </div>
              </div>
            )}

            {/* Exit control */}
            <button
              type="button"
              onClick={closeImmersive}
              className="fixed top-4 end-4 z-10 p-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-colors"
              title="خروج من ملء الشاشة"
              aria-label="خروج من ملء الشاشة"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 01-2 2H3" />
                <path d="M21 8h-3a2 2 0 01-2-2V3" />
                <path d="M3 16h3a2 2 0 012 2v3" />
                <path d="M16 21v-3a2 2 0 012-2h3" />
              </svg>
            </button>
          </div>,
          document.body,
        )
      )}
    </div>
  );
}

function PomodoroSettingsModal({
  
  open, onClose, settings, onSave, onSaveTheme,
}: {
  open: boolean;
  onClose: () => void;
  settings: PomodoroSettings;
  onSave: (s: PomodoroSettings) => void;
  onSaveTheme: (theme: PomodoroTheme) => void;
}) {
  const [local, setLocal] = useState(settings);

  useEffect(() => { setLocal(settings); }, [settings]);

  const themeOptions: { value: PomodoroTheme; label: string; description: string; preview: React.ReactNode }[] = [
    {
      value: 'classic',
      label: 'الأساسية',
      description: 'المظهر الافتراضي',
      preview: (
        <div className="w-full h-full rounded-2xl ring-1 ring-inset ring-gray-300 dark:ring-gray-600 flex items-center justify-center bg-white dark:bg-dark-card overflow-hidden">
          <div className="relative w-14 h-14">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 260 260">
              <circle cx="130" cy="130" r="120" fill="none" stroke="currentColor" strokeWidth="16" className="text-gray-200 dark:text-gray-700" />
              <circle cx="130" cy="130" r="120" fill="none" stroke="currentColor" strokeWidth="16" strokeDasharray="754" strokeDashoffset="380" className="text-blue-500" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[9px] font-mono font-bold text-gray-800 dark:text-white tabular-nums">25</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      value: 'digital',
      label: 'رقمية',
      description: 'ساعة رقمية نظيفة',
      preview: (
        <div className="w-full h-full rounded-2xl bg-black flex flex-col items-center justify-center gap-1 overflow-hidden">
          <span className="text-[7px] uppercase tracking-widest text-white/60">تركيز</span>
          <span className="text-xl font-mono font-bold text-white tabular-nums leading-none" dir="ltr">25:00</span>
        </div>
      ),
    },
    {
      value: 'nature',
      label: 'طبيعة',
      description: 'خلفية هادئة وطبيعية',
      preview: (
        <div className="w-full h-full rounded-2xl overflow-hidden relative bg-emerald-200 flex items-center justify-center">
          <img src={natureBackground} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/35" />
          <div className="relative w-10 h-10">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 260 260">
              <circle cx="130" cy="130" r="120" fill="none" stroke="currentColor" strokeWidth="22" className="text-white/25" />
              <circle cx="130" cy="130" r="120" fill="none" stroke="currentColor" strokeWidth="22" strokeDasharray="754" strokeDashoffset="380" className="text-white" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[8px] font-mono font-bold text-white tabular-nums drop-shadow">25</span>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title={'الإعدادات'} size="sm">
      <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-11rem)]">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {'مظهر المؤقت'}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map((opt) => {
              const selected = local.theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setLocal(p => ({ ...p, theme: opt.value }));
                    onSaveTheme(opt.value);
                  }}
                  className={`group rounded-2xl p-1.5 transition-all duration-200 border-2 ${
                    selected
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-transparent hover:border-gray-200 dark:hover:border-dark-border'
                  }`}
                >
                  <div className="h-16 mb-2">{opt.preview}</div>
                  <p className={`text-xs font-semibold text-center ${selected ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[10px] text-center text-gray-400 dark:text-gray-500 leading-tight">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <Select
          label={'وضع المؤقت'}
          value={local.timerMode}
          options={[
            { value: 'countdown', label: 'عد تنازلي' },
            { value: 'countup', label: 'عد تصاعدي' },
          ]}
          onChange={e => setLocal(p => ({ ...p, timerMode: e.target.value as TimerMode }))}
        />

        <Input
          label={'مدة التركيز (دقائق)'}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          max={120}
          value={local.focusDuration}
          lang={'ar'}
          onChange={e => setLocal(p => ({ ...p, focusDuration: Math.max(1, parseInt(e.target.value) || 1) }))}
        />
        <Input
          label={'مدة الاستراحة (دقائق)'}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          max={60}
          value={local.breakDuration}
          onChange={e => setLocal(p => ({ ...p, breakDuration: Math.max(1, parseInt(e.target.value) || 1) }))}
        />
        <Input
          label={'مدة الاستراحة الطويلة (دقائق)'}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          max={60}
          value={local.longBreakDuration}
          lang={'ar'}
          onChange={e => setLocal(p => ({ ...p, longBreakDuration: Math.max(1, parseInt(e.target.value) || 1) }))}
        />
        <Input
          label={'الجلسات حتى الاستراحة الطويلة'}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          max={20}
          value={local.sessionsUntilLongBreak}
          lang={'ar'}
          onChange={e => setLocal(p => ({ ...p, sessionsUntilLongBreak: Math.max(1, parseInt(e.target.value) || 1) }))}
        />
        <div className="flex gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            {'إلغاء'}
          </Button>
          <Button onClick={() => { onSave(local); onClose(); }} className="flex-1">
            {'حفظ'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// 2. TASK MANAGER
// =============================================================================

type TaskFilter = 'all' | 'active' | 'completed';
type TaskSort = 'date' | 'priority' | 'name';

const priorityColors: Record<Task['priority'], string> = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const priorityBadge: Record<Task['priority'], 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
};

function TaskManager() {
  const { tasks, addTask, updateTask, deleteTask, toggleTask } = useAppStore();

  const [filter, setFilter] = useState<TaskFilter>('all');
  const [sort, setSort] = useState<TaskSort>('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newTaskType, setNewTaskType] = useState<'normal' | 'daily'>('normal');
  const [newDailyTime, setNewDailyTime] = useState('');

  const filteredTasks = tasks
    .filter(task => {
      if (filter === 'active' && task.completed) return false;
      if (filter === 'completed' && !task.completed) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          task.title.toLowerCase().includes(q) ||
          (task.description && task.description.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === 'priority') {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      }
      if (sort === 'name') return a.title.localeCompare(b.title);
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt - a.createdAt;
    });

  const completedCount = tasks.filter(t => t.completed).length;
  const activeCount = tasks.length - completedCount;
  const completionPercent = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

  const handleAddTask = () => {
    if (!newTitle.trim()) return;
    addTask(
      newTitle.trim(),
      newDescription.trim() || undefined,
      newPriority,
      newDueDate || undefined,
      newTaskType,
      newTaskType === 'daily' && newDailyTime ? newDailyTime : undefined,
    );
    setNewTitle('');
    setNewDescription('');
    setNewPriority('medium');
    setNewDueDate('');
    setNewTaskType('normal');
    setNewDailyTime('');
    setShowAddModal(false);
  };

  const handleUpdateTitle = (id: string) => {
    if (editingTitle.trim()) {
      updateTask(id, { title: editingTitle.trim() });
    }
    setEditingId(null);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const current = filteredTasks[index];
    const prev = filteredTasks[index - 1];
    const currentOrigIndex = tasks.findIndex(t => t.id === current.id);
    const prevOrigIndex = tasks.findIndex(t => t.id === prev.id);
    if (currentOrigIndex === -1 || prevOrigIndex === -1) return;
    const newTasks = [...tasks];
    [newTasks[currentOrigIndex], newTasks[prevOrigIndex]] = [newTasks[prevOrigIndex], newTasks[currentOrigIndex]];
    newTasks.forEach(t => updateTask(t.id, t));
  };

  const handleMoveDown = (index: number) => {
    if (index >= filteredTasks.length - 1) return;
    const current = filteredTasks[index];
    const next = filteredTasks[index + 1];
    const currentOrigIndex = tasks.findIndex(t => t.id === current.id);
    const nextOrigIndex = tasks.findIndex(t => t.id === next.id);
    if (currentOrigIndex === -1 || nextOrigIndex === -1) return;
    const newTasks = [...tasks];
    [newTasks[currentOrigIndex], newTasks[nextOrigIndex]] = [newTasks[nextOrigIndex], newTasks[currentOrigIndex]];
    newTasks.forEach(t => updateTask(t.id, t));
  };

  const handleClearCompleted = () => {
    tasks.filter(t => t.completed).forEach(t => deleteTask(t.id));
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date(new Date().toDateString());
  };

  const isToday = (dueDate?: string) => {
    if (!dueDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return dueDate === today;
  };

  const taskFilterOptions = [
    { value: 'all', label: 'جميع المهام' },
    { value: 'active', label: 'المهام النشطة' },
    { value: 'completed', label: 'المهام المكتملة' },
  ];

  const sortOptions = [
    { value: 'date', label: 'حسب التاريخ' },
    { value: 'priority', label: 'حسب الأولوية' },
    { value: 'name', label: 'حسب الاسم' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{'المهام'}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {`${tasks.length} مهام`}
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {'إضافة مهمة'}
          </Button>
        </div>

        {tasks.length > 0 && (
          <Card padding="sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {completedCount}/{tasks.length} {'مكتملة'.toLowerCase()}
              </span>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {Math.round(completionPercent)}%
              </span>
            </div>
            <ProgressBar value={completionPercent} color="gradient" size="sm" />
          </Card>
        )}
      </motion.div>

      {/* Filters and Search */}
      {tasks.length > 0 && (
        <motion.div
          className="flex flex-col sm:flex-row gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Input
            placeholder={'بحث في المهام...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            }
            wrapperClassName="flex-1"
          />
          <Select
            options={taskFilterOptions}
            value={filter}
            onChange={e => setFilter(e.target.value as TaskFilter)}
            wrapperClassName="sm:w-44"
          />
          <Select
            options={sortOptions}
            value={sort}
            onChange={e => setSort(e.target.value as TaskSort)}
            wrapperClassName="sm:w-44"
          />
        </motion.div>
      )}

      {/* Bulk Actions */}
      {completedCount > 0 && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleClearCompleted}>
            {'مسح المكتملة'} ({completedCount})
          </Button>
        </div>
      )}

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-9 h-9" />}
          title={searchQuery
            ? ('لا توجد نتائج')
            : 'لا توجد مهام بعد'
          }
          description={searchQuery
            ? ('جرّب البحث بكلمات مختلفة')
            : 'أضف أول مهمة لك لتبدأ في تنظيم يومك'
          }
          action={!searchQuery ? { label: 'إضافة مهمة', onClick: () => setShowAddModal(true) } : undefined}
        />
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filteredTasks.map((task, index) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card padding="sm" className={`group ${task.completed ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleTask(task.id)}
                      className={`mt-0.5 shrink-0 w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                        task.completed
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-gray-300 dark:border-gray-600 hover:border-primary-500'
                      }`}
                    >
                      {task.completed && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {editingId === task.id ? (
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          onBlur={() => handleUpdateTitle(task.id)}
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdateTitle(task.id); if (e.key === 'Escape') setEditingId(null); }}
                          className="w-full text-sm font-medium bg-transparent border-b border-primary-500 outline-none text-gray-800 dark:text-white pb-0.5"
                        />
                      ) : (
                        <h4
                          onClick={() => { setEditingId(task.id); setEditingTitle(task.title); }}
                          className={`text-sm font-medium cursor-text hover:text-primary-600 dark:hover:text-primary-400 transition-colors ${
                            task.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-white'
                          }`}
                        >
                          {task.title}
                        </h4>
                      )}

                      {task.description && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase ${priorityColors[task.priority]}`}>
                          {task.priority === 'high' ? 'عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                        </span>

                        {task.taskType === 'daily' && (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            task.completed ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500' :
                            'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                          }`}>
                            {!task.dailyTime && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                            )}
                            {task.dailyTime
                              ? new Date(`1970-01-01T${task.dailyTime}`).toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true })
                              : ''}
                          </span>
                        )}

                        {task.dueDate && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            task.completed ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500' :
                            isOverdue(task.dueDate) ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                            isToday(task.dueDate) ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                            'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {isOverdue(task.dueDate) && !task.completed ? '⚠ ' : ''}
                            {new Date(task.dueDate).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Tooltip content={'تحريك لأعلى'}>
                        <button
                          onClick={() => handleMoveUp(index)}
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-dark-hover transition-colors"
                          disabled={index === 0}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                        </button>
                      </Tooltip>
                      <Tooltip content={'تحريك لأسفل'}>
                        <button
                          onClick={() => handleMoveDown(index)}
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-dark-hover transition-colors"
                          disabled={index === filteredTasks.length - 1}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </Tooltip>
                      <Tooltip content={'حذف'}>
                        <button
                          onClick={() => setDeleteConfirmId(task.id)}
                          className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add Task Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={'إضافة مهمة'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label={'عنوان المهمة'}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder={'عنوان المهمة'}
            autoFocus
          />
          <TextArea
            label={'الوصف'}
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            placeholder={'وصف اختياري'}
            rows={2}
          />
          <Select
            label={'نوع المهمة'}
            value={newTaskType}
            onChange={e => {
              const val = e.target.value as 'normal' | 'daily';
              setNewTaskType(val);
              if (val === 'normal') setNewDailyTime('');
            }}
            options={[
              { value: 'normal', label: 'مهمة عادية' },
              { value: 'daily', label: 'مهمة يومية' },
            ]}
          />
          {newTaskType === 'daily' && (
            <Input
              label={'الوقت'}
              type="time"
              value={newDailyTime}
              onChange={e => setNewDailyTime(e.target.value)}
            />
          )}
          <Select
            label={'الأولوية'}
            value={newPriority}
            onChange={e => setNewPriority(e.target.value as Task['priority'])}
            options={[
              { value: 'low', label: 'منخفضة' },
              { value: 'medium', label: 'متوسطة' },
              { value: 'high', label: 'عالية' },
            ]}
          />
          <Input
            label={'تاريخ الاستحقاق'}
            type="date"
            value={newDueDate}
            onChange={e => setNewDueDate(e.target.value)}
          />
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowAddModal(false)} className="flex-1">
              {'إلغاء'}
            </Button>
            <Button onClick={handleAddTask} disabled={!newTitle.trim()} className="flex-1">
              {'إضافة مهمة'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={'حذف المهمة'}
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {'هل أنت متأكد من حذف هذه المهمة؟'}
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setDeleteConfirmId(null)} className="flex-1">
            {'إلغاء'}
          </Button>
          <Button
            variant="danger"
            onClick={() => { if (deleteConfirmId) { deleteTask(deleteConfirmId); setDeleteConfirmId(null); } }}
            className="flex-1"
          >
            {'حذف'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// =============================================================================
// 3. EXAM COUNTDOWN
// =============================================================================

const EXAM_COLORS = [
  { name: 'Blue', value: 'blue', class: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { name: 'Green', value: 'green', class: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  { name: 'Red', value: 'red', class: 'bg-red-500', border: 'border-red-500', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
  { name: 'Purple', value: 'purple', class: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  { name: 'Orange', value: 'orange', class: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  { name: 'Teal', value: 'teal', class: 'bg-teal-500', border: 'border-teal-500', text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20' },
  { name: 'Pink', value: 'pink', class: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/20' },
];

function getExamColorMeta(color: string) {
  return EXAM_COLORS.find(c => c.value === color) || EXAM_COLORS[0];
}

function getDaysRemaining(dateStr: string): number {
  const now = new Date(new Date().toDateString());
  const examDate = new Date(dateStr);
  const diff = examDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getMotivationalMessage(days: number): string {
  if (days < 0) return 'انتهى موعد الامتحان!';
  if (days === 0) return 'الامتحان اليوم! حظاً موفقاً!';
  if (days <= 3) return 'تحضر جيداً! أنت قريب!';
  if (days <= 7) return 'أسبوع واحد متبقٍ - ركّز!';
  if (days <= 14) return 'أسبوعان - حان وقت المراجعة';
  if (days <= 30) return 'وقت كافٍ للتحضير الجيد';
  return 'استمتع بوقتك للاستعداد';
}

function ExamCountdownPage() {
  const { exams, addExam, deleteExam } = useAppStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newColor, setNewColor] = useState('blue');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Re-render periodically to update countdowns in real-time feel
  useEffect(() => {
    const interval = setInterval(() => setTick(prev => prev + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const sortedExams = [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleAddExam = () => {
    if (!newName.trim() || !newDate) return;
    addExam(newName.trim(), newDate, newColor);
    setNewName('');
    setNewDate('');
    setNewColor('blue');
    setShowAddModal(false);
  };

  const examCountLabel = `${exams.length} ${exams.length === 1 ? 'امتحان' : 'امتحانات'}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">{'الامتحانات القادمة'}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{examCountLabel}</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} icon={<Plus className="w-4 h-4" />}>
          {'إضافة امتحان'}
        </Button>
      </motion.div>

      {/* Exam Cards */}
      {sortedExams.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="w-9 h-9" />}
          title={'لا توجد امتحانات بعد'}
          description={'أضف امتحانك الأول لتبدأ العد التنازلي'}
          action={{ label: 'أضف أول امتحان', onClick: () => setShowAddModal(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {sortedExams.map((exam, index) => {
              const days = getDaysRemaining(exam.date);
              const colorMeta = getExamColorMeta(exam.color);
              const message = getMotivationalMessage(days);

              return (
                <motion.div
                  key={exam.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card padding="none" className="overflow-hidden">
                    <div className={`h-2 ${colorMeta.class}`} />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-bold text-gray-800 dark:text-white truncate">
                            {exam.name}
                          </h3>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {new Date(exam.date).toLocaleDateString('ar-SA-u-nu-latn', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                        <button
                          onClick={() => setDeleteConfirmId(exam.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors shrink-0 ms-2"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex items-center gap-3 mb-3">
                        <motion.span
                          key={days}
                          initial={{ scale: 1.2, opacity: 0.5 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className={`text-5xl font-black ${colorMeta.text}`}
                        >
                          {days <= 0 ? 0 : days}
                        </motion.span>
                        <div>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                            {days === 0
                              ? 'اليوم'
                              : days < 0
                                ? 'انتهى الموعد'
                                : `${days} يوم متبقي`
                            }
                          </p>
                        </div>
                      </div>

                      <div className={`text-xs font-medium px-3 py-1.5 rounded-lg ${colorMeta.bg} ${colorMeta.text}`}>
                        {message}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Add Exam Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={'إضافة امتحان'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label={'اسم الامتحان'}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={'اسم الامتحان'}
            autoFocus
          />
          <Input
            label={'تاريخ الامتحان'}
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {'لون الامتحان'}
            </label>
            <div className="flex gap-2 flex-wrap">
              {EXAM_COLORS.map(color => (
                <button
                  key={color.value}
                  onClick={() => setNewColor(color.value)}
                  className={`w-8 h-8 rounded-full ${color.class} transition-all duration-200 ${
                    newColor === color.value ? 'scale-110 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-dark-card' : 'hover:scale-105'
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowAddModal(false)} className="flex-1">
              {'إلغاء'}
            </Button>
            <Button onClick={handleAddExam} disabled={!newName.trim() || !newDate} className="flex-1">
              {'إضافة امتحان'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
                          title="حذف الامتحان"
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {'هل أنت متأكد من حذف هذا الامتحان؟'}
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setDeleteConfirmId(null)} className="flex-1">
            {'إلغاء'}
          </Button>
          <Button
            variant="danger"
            onClick={() => { if (deleteConfirmId) { deleteExam(deleteConfirmId); setDeleteConfirmId(null); } }}
            className="flex-1"
          >
            {'حذف'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
