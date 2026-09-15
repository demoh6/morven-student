import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { isAdminRole, isMainAdminRole } from '@/pages/auth/roles';
import { useThemeStore } from '@/store/useThemeStore';
import { usePomodoroStore } from '@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore';
import { formatClock } from '@/pages/tools/GeneralTools/Pomodoro/formatTime';
import { useNavigate, Link } from 'react-router-dom';
import { HeaderQuranPlayer } from '@/pages/tools/GeneralTools/Quran/HeaderQuranPlayer';
import { OfflineIndicator } from '@/components/Layout/OfflineIndicator';
import { NotificationsPanel } from '@/components/Layout/Header/Notification/NotificationsPanel';
import { useNotificationStore } from '@/components/Layout/Header/Notification/useNotificationStore';
import { Avatar } from '@/pages/connect/Avatar';
import {
  LogOut,
  Sun,
  Moon,
  Monitor,
  Bell,
  UserCircle,
  Lightbulb,
  Shield as ShieldIcon,
  BookmarkPlus,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const pomodoroRunning = usePomodoroStore((s) => s.isRunning);
  const pomodoroPaused = usePomodoroStore((s) => s.isPaused);
  const pomodoroTimeRemaining = usePomodoroStore((s) => s.timeRemaining);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { theme, setTheme } = useThemeStore();
  const { unreadCount } = useNotificationStore();
  const [now, setNow] = useState(new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const safeFormat = (locale: string, options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, options).format(now);
    } catch {
      return new Intl.DateTimeFormat('ar', options).format(now);
    }
  };

  const gregorianDate = safeFormat('ar-EG-u-nu-latn', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const hijriDate = safeFormat('ar-SA-u-ca-islamic-nu-latn', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const time = safeFormat('ar-EG-u-nu-latn', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <header
      className={[
        'sticky top-0 z-30',
        'bg-white/80 dark:bg-dark-bg/80 backdrop-blur-xl',
        'border-b border-light-border dark:border-dark-border',
      ].join(' ')}
    >
      <OfflineIndicator />
      <div className="flex items-center gap-3 px-4 h-16">
        {/* Mobile Menu */}
        <button
          onClick={toggleSidebar}
          className="xl:hidden p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
          aria-label={'طي القائمة'}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Title */}
        {title && (
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate hidden sm:block">
            {title}
          </h1>
        )}

        <HeaderQuranPlayer />

        <div className="flex-1 flex justify-center md:justify-end">
          <div className="flex flex-col items-center md:items-end text-center md:text-right">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {gregorianDate}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {hijriDate}
              </span>
              <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">
                {time}
              </span>
            </div>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          {(pomodoroRunning || pomodoroPaused) && (
            <button
              onClick={() => navigate('/tool/pomodoro-timer')}
              className="hidden lg:block px-2.5 py-1.5 rounded-xl text-sm font-semibold font-mono tabular-nums text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors"
              title={'مؤقت بومودورو'}
            >
              {formatClock(pomodoroTimeRemaining)}
            </button>
          )}

          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setMenuOpen(false);
              }}
              className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors relative"
              title="الإشعارات"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 end-1.5 w-2 h-2 rounded-full bg-primary-500" />
              )}
            </button>
            <NotificationsPanel
              open={showNotifications}
              onClose={() => setShowNotifications(false)}
            />
          </div>

          {user ? (
            <>
              {/* User menu */}
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => {
                    setMenuOpen(!menuOpen);
                    setShowNotifications(false);
                  }}
                  className="p-1.5 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                  title={user.displayName}
                >
                        <Avatar src={user?.avatarUrl ?? null} name={user.displayName} size="sm" />
                </button>

                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      className="absolute top-full end-0 mt-2 w-56 bg-white dark:bg-dark-card rounded-2xl shadow-elevated border border-light-border dark:border-dark-border overflow-hidden z-50"
                    >
                      {/* User info header */}
                      <div className="px-4 py-3 border-b border-light-border dark:border-dark-border flex items-center gap-3">
                <Avatar src={user?.avatarUrl ?? null} name={user.displayName} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {user.displayName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate" dir="ltr">
                            @{user.username}
                          </p>
                        </div>
                      </div>

                      {/* Menu items */}
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            navigate('/connect/account');
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
                        >
                          <UserCircle className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          الحساب
                        </button>

                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            navigate('/connect/suggestions');
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
                        >
                          <Lightbulb className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          الاقتراحات
                        </button>

                        {isAdminRole(user.role) && (
                          <>
                          {isMainAdminRole(user.role) && (
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              navigate('/admin/users');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
                          >
                            <ShieldIcon className="w-4 h-4 text-primary-500" />
                            إدارة المستخدمين
                          </button>
                          )}

                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              navigate('/admin/suggestions');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
                          >
                            <Lightbulb className="w-4 h-4 text-primary-500" />
                            الاقتراحات
                          </button>

                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              navigate('/admin/adhkar');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
                          >
                            <BookmarkPlus className="w-4 h-4 text-primary-500" />
                            مراجعة الأذكار
                          </button>
                          </>
                        )}

                        {/* Theme submenu */}
                        <div className="px-4 py-2">
                          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                            المظهر
                          </p>
                          <div className="flex gap-1">
                            {[
                              { value: 'light' as const, icon: Sun, label: 'فاتح' },
                              { value: 'dark' as const, icon: Moon, label: 'داكن' },
                              { value: 'system' as const, icon: Monitor, label: 'النظام' },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setTheme(opt.value)}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                  theme === opt.value
                                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover'
                                }`}
                              >
                                <opt.icon className="w-3.5 h-3.5" />
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Logout */}
                      <div className="border-t border-light-border dark:border-dark-border py-1">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          خروج
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <Link
              to="/login"
              className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
              title="دخول"
              aria-label="دخول"
            >
              <UserCircle size={20} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
