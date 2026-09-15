import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationStore, type Notification } from '@/components/Layout/Header/Notification/useNotificationStore';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { isAdminRole } from '@/pages/auth/roles';
import { useAppStore } from '@/store/useAppStore';
import { Bell, Megaphone, RefreshCw, Info, X, Plus, Trash2 } from 'lucide-react';

function typeIcon(type: Notification['type']) {
  switch (type) {
    case 'announcement':
      return <Megaphone className="w-4 h-4 text-primary-500" />;
    case 'update':
      return <RefreshCw className="w-4 h-4 text-sky-500" />;
    case 'info':
      return <Info className="w-4 h-4 text-amber-500" />;
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

const typeLabels: Record<Notification['type'], string> = {
  announcement: 'إعلان',
  update: 'تحديث',
  info: 'معلومة',
};

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: NotificationsPanelProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, dismissNotification, fetchNotifications, createNotification, deleteNotification } =
    useNotificationStore();
  const user = useAuthStore((s) => s.user);
  const addToast = useAppStore((s) => s.addNotification);

  const isAdmin = isAdminRole(user?.role);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<Notification['type']>('announcement');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) {
      addToast('يرجى تعبئة العنوان والنص', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await createNotification({
        title: title.trim(),
        body: body.trim(),
        type,
      });
      setTitle('');
      setBody('');
      setType('announcement');
      setShowCreate(false);
      addToast('تمت إضافة الإشعار بنجاح', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'حدث خطأ في إضافة الإشعار', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteNotification(id);
      addToast('تم حذف الإشعار بنجاح', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'حدث خطأ في حذف الإشعار', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="absolute top-full end-0 mt-2 w-80 sm:w-96 bg-white dark:bg-dark-card rounded-2xl shadow-elevated border border-light-border dark:border-dark-border overflow-hidden z-50"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  الإشعارات
                </span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary-500 text-white rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                  قراءة الكل
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  لا توجد إشعارات
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`relative flex gap-3 px-4 py-3 border-b border-light-border/50 dark:border-dark-border/50 last:border-0 transition-colors ${
                      !n.read ? 'bg-primary-50/30 dark:bg-primary-900/10' : ''
                    }`}
                    onClick={() => markAsRead(n.id)}
                  >
                    {!n.read && (
                      <div className="absolute top-4 end-4 w-2 h-2 rounded-full bg-primary-500" />
                    )}
                    <div className="shrink-0 mt-0.5">{typeIcon(n.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    {isAdmin && deleteMode ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(n.id);
                        }}
                        disabled={deletingId === n.id}
                        className="shrink-0 p-1 rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
                        title="حذف الإشعار"
                        aria-label="حذف الإشعار"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissNotification(n.id);
                        }}
                        className="shrink-0 p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                        title="إزالة"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {isAdmin && (
              <div className="border-t border-light-border dark:border-dark-border">
                <div className="flex gap-2 px-4 py-2.5">
                  <button
                    onClick={() => {
                      setShowCreate((v) => !v);
                      setDeleteMode(false);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      showCreate
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                        : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-hover/80'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة إشعار
                  </button>
                  <button
                    onClick={() => {
                      setDeleteMode((v) => !v);
                      setShowCreate(false);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      deleteMode
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                        : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-hover/80'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف إشعار
                  </button>
                </div>

                {showCreate && (
                  <div className="px-4 py-3 border-t border-light-border/50 dark:border-dark-border/50 space-y-2.5">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="عنوان الإشعار"
                      className="w-full px-3 py-2 rounded-xl text-sm bg-gray-50 dark:bg-dark-bg border border-light-border dark:border-dark-border text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="نص الإشعار"
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl text-sm bg-gray-50 dark:bg-dark-bg border border-light-border dark:border-dark-border text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as Notification['type'])}
                        className="px-2.5 py-2 rounded-xl text-xs bg-gray-50 dark:bg-dark-bg border border-light-border dark:border-dark-border text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {(Object.keys(typeLabels) as Notification['type'][]).map((t) => (
                          <option key={t} value={t}>
                            {typeLabels[t]}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowCreate(false)}
                          className="px-3 py-2 rounded-xl text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                        >
                          إلغاء
                        </button>
                        <button
                          onClick={handleCreate}
                          disabled={submitting}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary-500 hover:bg-primary-600 text-white transition-colors disabled:opacity-60"
                        >
                          {submitting ? 'إضافة...' : 'إضافة'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {deleteMode && (
                  <p className="px-4 pb-2.5 text-[11px] text-red-500 dark:text-red-400">
                    اضغط على أيقونة الحذف بجانب الإشعار لإزالته لجميع المستخدمين
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}