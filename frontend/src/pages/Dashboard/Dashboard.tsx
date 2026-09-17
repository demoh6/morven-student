import { useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { useNotesStore, sortNotes } from '@/pages/tools/GeneralTools/Notes/useNotesStore';
import { usePomodoroStore } from '@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore';
import { formatClock, hasClockHours } from '@/pages/tools/GeneralTools/Pomodoro/formatTime';
import { useFileStorage } from '@/hooks/useFileStorage';
import AchievementsPanel from '@/pages/Dashboard/Achievements/AchievementsPanel';
import { formatFileSize } from '@/utils/file';
import { APP_DISPLAY_LOCALE } from '@/utils/displayLocale';
import type { Task } from '@/types';
import {
  CheckSquare,
  FolderOpen,
  GraduationCap,
  StickyNote,
  ListChecks,
  FileStack,
  Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ─── Shared Components ─── */

function PanelHeader({ title, action, icon: Icon, accent }: { title: string; action?: React.ReactNode; icon?: LucideIcon; accent?: string }) {
  return (
    <div className="relative flex items-center justify-center mb-8">
      {Icon && (
        <div className={`absolute start-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl ${accent || 'bg-primary-50'} dark:bg-white/10 flex items-center justify-center`}>
          <Icon className={`w-[18px] h-[18px] ${accent ? accent.replace('bg-', 'text-').replace('50', '600') : 'text-primary-600 dark:text-primary-400'}`} strokeWidth={1.8} />
        </div>
      )}
      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 text-center tracking-tight">{title}</h2>
      {action && <div className="absolute end-0 top-1/2 -translate-y-1/2">{action}</div>}
    </div>
  );
}

function EmptyState({ icon: Icon, text, hint, accent }: { icon: LucideIcon; text: string; hint: string; accent?: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 py-10 text-center">
      <div className={`w-14 h-14 rounded-2xl ${accent || 'bg-gray-100'} dark:bg-white/10 flex items-center justify-center mb-4`}>
        <Icon className={`w-7 h-7 ${accent ? accent.replace('bg-', 'text-').replace('50', '500').replace('100', '400') : 'text-gray-300 dark:text-gray-400'}`} strokeWidth={1.4} />
      </div>
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">{text}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>
    </div>
  );
}

/* ─── Quick Summary ─── */
function QuickSummary() {
  const tasks = useAppStore((s) => s.tasks);
  const { files } = useFileStorage();
  const totalFocusSeconds = usePomodoroStore((s) => s.totalFocusSeconds);

  const today = new Date().toISOString().split('T')[0];
  const tasksDueToday = useMemo(
    () => tasks.filter((tk) => tk.dueDate === today && !tk.completed).length,
    [tasks, today],
  );
  const filesCount = files.length;
  const pomodoroHours = useMemo(() => {
    const h = totalFocusSeconds / 3600;
    return h >= 1 ? `${h.toFixed(1)}س` : `${Math.round(totalFocusSeconds / 60)}د`;
  }, [totalFocusSeconds]);

  const stats = [
    { icon: ListChecks, label: 'مهام مستحقة اليوم', value: tasksDueToday, bg: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/30', text: 'text-emerald-600', ring: 'ring-emerald-100', ringDark: 'dark:ring-emerald-800/40', compact: false },
    { icon: Clock, label: 'ساعات بومودورو اليوم', value: pomodoroHours, bg: 'bg-amber-50', bgDark: 'dark:bg-amber-900/30', text: 'text-amber-600', ring: 'ring-amber-100', ringDark: 'dark:ring-amber-800/40', compact: false },
    { icon: FileStack, label: 'ملفات محفوظة', value: filesCount, bg: 'bg-sky-50', bgDark: 'dark:bg-sky-900/30', text: 'text-sky-600', ring: 'ring-sky-100', ringDark: 'dark:ring-sky-800/40', compact: true },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-4 lg:gap-6 mb-6 sm:mb-10">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`flex items-center rounded-2xl border border-light-border bg-white shadow-card dark:bg-dark-surface dark:border-dark-border dark:shadow-card-dark hover:shadow-soft dark:hover:shadow-card-dark hover:-translate-y-0.5 transition-all duration-200 gap-2 px-3 py-3.5 sm:gap-4 sm:px-6 sm:py-5 ${s.compact ? 'sm:gap-2.5 sm:px-4 sm:py-3' : ''}`}
        >
          <div className={`rounded-xl ${s.bg} ${s.bgDark} ring-1 ${s.ring} ${s.ringDark} flex items-center justify-center shrink-0 w-9 h-9 sm:w-12 sm:h-12 ${s.compact ? 'sm:w-9 sm:h-9' : ''}`}>
            <s.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${s.text} ${s.compact ? 'sm:w-4 sm:h-4' : ''}`} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className={`font-bold text-gray-900 dark:text-gray-100 leading-tight tabular-nums text-lg sm:text-2xl ${s.compact ? 'sm:text-xl' : ''}`}>{s.value}</p>
            <p className={`font-medium text-gray-500 dark:text-gray-400 text-[11px] sm:text-xs mt-0 ${s.compact ? 'sm:text-[10px]' : 'sm:mt-0.5'}`}>{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Tasks Panel ─── */
function TasksPanel() {
  const tasks = useAppStore((s) => s.tasks);
  const toggleTask = useAppStore((s) => s.toggleTask);

  const today = new Date().toISOString().split('T')[0];

  const activeTasks = useMemo(() => {
    return tasks
      .filter((tk) => !tk.completed)
      .sort((a, b) => {
        if (a.dueDate === today && b.dueDate !== today) return -1;
        if (a.dueDate !== today && b.dueDate === today) return 1;
        const aOverdue = a.dueDate && a.dueDate < today ? 0 : 1;
        const bOverdue = b.dueDate && b.dueDate < today ? 0 : 1;
        if (aOverdue !== bOverdue) return aOverdue - bOverdue;
        const po = { high: 0, medium: 1, low: 2 };
        return po[a.priority] - po[b.priority];
      })
      .slice(0, 5);
  }, [tasks, today]);

  const activeCount = tasks.filter((tk) => !tk.completed).length;
  const completedCount = tasks.filter((tk) => tk.completed).length;

  const priorityColor = (p: Task['priority']) => {
    if (p === 'high') return 'bg-red-400';
    if (p === 'medium') return 'bg-amber-400';
    return 'bg-green-400';
  };

  return (
    <div className="w-full flex flex-col">
      <PanelHeader
        title={'المهام'}
        icon={CheckSquare}
        accent="bg-emerald-50"
        action={
          <span className="text-xs font-medium text-gray-400 bg-gray-100 dark:bg-white/10 px-2.5 py-1 rounded-full">
            {activeCount}/{activeCount + completedCount}
          </span>
        }
      />
      {activeTasks.length === 0 ? (
        <EmptyState icon={CheckSquare} text={'لا توجد مهام بعد'} hint={'أضف مهمة للبدء'} accent="bg-emerald-50" />
      ) : (
        <div className="space-y-1">
          {activeTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors group"
            >
              <button
                onClick={() => toggleTask(task.id)}
                className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-600 hover:border-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-colors shrink-0 flex items-center justify-center"
                aria-label={'وضع عامة مكتملة'}
              >
                {task.completed && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary-500">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <div className={`w-2 h-2 rounded-full shrink-0 ${priorityColor(task.priority)}`} />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{task.title}</span>
              {task.taskType === 'daily' && task.dailyTime && (
                <span className="text-xs font-medium shrink-0 px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                  {new Date(`1970-01-01T${task.dailyTime}`).toLocaleTimeString(APP_DISPLAY_LOCALE, { hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              )}
              {task.dueDate && (
                <span className={`text-xs font-medium shrink-0 px-2 py-0.5 rounded-full ${task.dueDate < today ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : task.dueDate === today ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}>
                  {task.dueDate === today
                    ? 'اليوم'
                    : task.dueDate < today
                      ? 'متأخر'
                      : new Date(task.dueDate).toLocaleDateString(APP_DISPLAY_LOCALE)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <Link
        to="/tool/task-manager"
        className="block mt-4 text-center text-xs font-semibold text-primary-600 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 py-2 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
      >
        {'عرض الكل'} →
      </Link>
    </div>
  );
}

/* ─── Files Panel ─── */
function FilesPanel() {
  const { files, upload, remove, downloadFileData } = useFileStorage();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    for (const file of Array.from(fileList)) {
      const buffer = await file.arrayBuffer();
      await upload(file.name, file.type, buffer);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  // Remote-only records (bytes on another device) are fetched from the server
  // and cached locally before opening.
  const handleDownload = async (f: typeof files[0]) => {
    const data = await downloadFileData(f.id);
    if (!data) return;
    const blob = new Blob([data], { type: f.type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const recentFiles = files.slice(0, 5);

  return (
    <div className="w-full flex flex-col">
      <PanelHeader
        title={'الملفات'}
        icon={FolderOpen}
        accent="bg-sky-50"
        action={
          <>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={handleUpload} />
            <button
              onClick={() => inputRef.current?.click()}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-colors"
            >
              {'رفع ملف'}
            </button>
          </>
        }
      />
      {recentFiles.length === 0 ? (
        <EmptyState icon={FolderOpen} text={'لا توجد ملفات محفوظة'} hint={'ارفع ملفاً للبدء'} accent="bg-sky-100" />
      ) : (
        <div className="space-y-1">
          {recentFiles.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center text-sky-500 shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{f.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{formatFileSize(f.size)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleDownload(f)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-colors"
                  aria-label={'تنزيل'}
                  title={'تنزيل'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                <button
                  onClick={() => remove(f.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 transition-colors"
                  aria-label={'حذف'}
                  title={'حذف'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Pomodoro Panel ─── */
function PomodoroPanel() {
  const mode = usePomodoroStore((s) => s.mode);
  const timeRemaining = usePomodoroStore((s) => s.timeRemaining);
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const isPaused = usePomodoroStore((s) => s.isPaused);
  const currentSession = usePomodoroStore((s) => s.currentSession);
  const settings = usePomodoroStore((s) => s.settings);
  const start = usePomodoroStore((s) => s.start);
  const pause = usePomodoroStore((s) => s.pause);
  const resume = usePomodoroStore((s) => s.resume);
  const reset = usePomodoroStore((s) => s.reset);

  const isCountUp = settings.timerMode === 'countup';
  const showHours = hasClockHours(timeRemaining);
  const totalDuration = mode === 'focus'
    ? settings.focusDuration * 60
    : mode === 'break'
      ? settings.breakDuration * 60
      : settings.longBreakDuration * 60;
  // Count Up has no target duration, so its progress ring stays empty (0%).
  const progress = isCountUp ? 0 : totalDuration > 0 ? ((totalDuration - timeRemaining) / totalDuration) * 100 : 0;

  const modeLabel = mode === 'focus' ? 'تركيز' : mode === 'break' ? 'استراحة' : 'استراحة طويلة';
  const circumference = 2 * Math.PI * 44;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const modeRingColor = mode === 'focus' ? 'text-blue-500' : mode === 'break' ? 'text-emerald-500' : 'text-purple-500';

  return (
    <div className="w-full flex flex-col">
      <PanelHeader title={'بومودورو'} icon={Clock} accent="bg-blue-50" />
      <div className="flex items-center gap-6">
        <div className="relative w-28 h-28 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="5" className="text-gray-100 dark:text-gray-800" />
            <circle
              cx="50" cy="50" r="44"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              stroke="currentColor"
              className={modeRingColor}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.5s linear', animation: 'none' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-bold text-gray-800 dark:text-gray-100 tabular-nums tracking-tight ${showHours ? 'text-sm' : 'text-2xl'}`} aria-live="polite" aria-atomic="true">
              {formatClock(timeRemaining)}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold mb-1 ${
            mode === 'focus' ? 'text-blue-600' :
            mode === 'break' ? 'text-emerald-600' :
            'text-purple-600'
          }`}>
            {modeLabel}
          </p>
          <p className="text-xs text-gray-400 mb-4">
            {`الجلسة ${currentSession + 1} من ${settings.sessionsUntilLongBreak}`}
          </p>
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button
                onClick={isPaused && timeRemaining > 0 ? resume : start}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold shadow-sm shadow-primary-600/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-all"
                aria-label={isPaused && timeRemaining > 0 ? 'استئناف' : 'بدء'}
              >
                {isPaused && timeRemaining > 0 ? 'استئناف' : 'بدء'}
              </button>
            ) : (
              <button
                onClick={pause}
                className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-gray-300 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-all"
                aria-label={'إيقاف مؤقت'}
              >
                {'إيقاف مؤقت'}
              </button>
            )}
            <button
              onClick={reset}
              className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-gray-300 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-all"
              aria-label={'إعادة تعيين'}
            >
              {'إعادة تعيين'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Exams Panel ─── */
function ExamsPanel() {
  const exams = useAppStore((s) => s.exams);
  const navigate = useNavigate();

  const sortedExams = useMemo(() => {
    return [...exams]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 4);
  }, [exams]);

  const getDays = (dateStr: string) => {
    const now = new Date(new Date().toDateString());
    const d = new Date(dateStr);
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const colorBar = (color: string) => {
    const map: Record<string, string> = {
      blue: 'bg-blue-500',
      green: 'bg-emerald-500',
      red: 'bg-red-500',
      purple: 'bg-purple-500',
      orange: 'bg-orange-500',
      teal: 'bg-teal-500',
      pink: 'bg-pink-500',
    };
    return map[color] || map.blue;
  };

  return (
    <div className="w-full flex flex-col">
      <PanelHeader
        title={'عداد الامتحانات'}
        icon={GraduationCap}
        accent="bg-purple-50"
        action={
          <button
            onClick={() => navigate('/tool/exam-countdown')}
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-colors"
          >
            {'إضافة امتحان'}
          </button>
        }
      />
      {sortedExams.length === 0 ? (
        <EmptyState icon={GraduationCap} text={'لا توجد امتحانات مجدولة'} hint={'أضف امتحاناً لتتبع العداد'} accent="bg-purple-100" />
      ) : (
        <div className="space-y-2">
          {sortedExams.map((exam) => {
            const days = getDays(exam.date);
            return (
              <div key={exam.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                <div className={`w-1.5 h-10 rounded-full shrink-0 ${colorBar(exam.color)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">{exam.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(exam.date).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <span className={`text-xs font-semibold shrink-0 px-2.5 py-1 rounded-full ${
                  days < 0
                    ? 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400'
                    : days <= 3
                      ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      : days <= 7
                        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                        : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400'
                }`}>
                  {days < 0
                    ? 'متأخر'
                    : days === 0
                      ? 'اليوم'
                      : days === 1
                        ? 'غدًا'
                        : `${days} أيام متبقية`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Notes Panel ─── */
function NotesPanel() {
  const notes = useNotesStore((s) => s.notes);
  const navigate = useNavigate();

  const recentNotes = useMemo(() => sortNotes(notes).slice(0, 4), [notes]);

  return (
    <div className="w-full flex flex-col">
      <PanelHeader
        title={'الملاحظات'}
        icon={StickyNote}
        accent="bg-amber-50"
        action={
          <button
            onClick={() => navigate('/tool/notes')}
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-colors"
          >
            {'عرض الكل'}
          </button>
        }
      />
      {recentNotes.length === 0 ? (
        <EmptyState icon={StickyNote} text={'لا توجد ملاحظات بعد'} hint={'أنشئ ملاحظة للبدء'} accent="bg-amber-100" />
      ) : (
        <div className="space-y-1">
          {recentNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => navigate('/tool/notes')}
              className="w-full text-right flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-dark-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-colors"
            >
              {note.pinned && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400 shrink-0">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z" />
                </svg>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                  {note.title || 'الأخيرة'}
                </p>
                {note.content && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{note.content.slice(0, 60)}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}



/* ─── Dashboard ─── */
export default function Dashboard() {
  const card = 'p-7 lg:p-9 min-h-[320px] lg:min-h-[380px] flex flex-col rounded-2xl border border-light-border bg-white shadow-card dark:bg-dark-card dark:border-dark-border dark:shadow-card-dark';

  return (
    <div className="px-4 md:px-8 lg:px-10 py-8 flex flex-col">
      {/* Welcome Heading */}
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
          {'يا طالبَ العلمِ، أهلًا بمَقدَمِكَ، وطيبًا بمُقامِكَ'}
        </h1>
      </div>

      {/* Quick Summary */}
      <QuickSummary />

      {/* Row 1: Tasks | Achievements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6 mb-5 lg:mb-6">
        <div className={card}>
          <TasksPanel />
        </div>
        <div className={card}>
          <AchievementsPanel />
        </div>
      </div>

      {/* Row 2: Pomodoro | Exams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6 mb-5 lg:mb-6">
        <div className={card}>
          <PomodoroPanel />
        </div>
        <div className={card}>
          <ExamsPanel />
        </div>
      </div>

      {/* Row 3: Notes | Files */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
        <div className={card}>
          <NotesPanel />
        </div>
        <div className={card}>
          <FilesPanel />
        </div>
      </div>
    </div>
  );
}
