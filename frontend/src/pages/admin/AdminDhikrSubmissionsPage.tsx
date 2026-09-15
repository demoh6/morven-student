import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/UI/Card';
import { Button } from '@/components/UI/Button';
import { Badge } from '@/components/UI/Badge';
import { Modal } from '@/components/UI/Modal';
import { Avatar } from '@/pages/connect/Avatar';
import { useAppStore } from '@/store/useAppStore';
import {
  listDhikrSubmissions,
  approveDhikrSubmission,
  rejectDhikrSubmission,
  deleteDhikrSubmission,
  type AdminDhikrSubmission,
} from '@/pages/tools/GeneralTools/Adhkar/adhkarApi';
import { ADHKARS, CATEGORY_META } from '@/pages/tools/GeneralTools/Adhkar/adhkar';
import {
  ChevronRight,
  BookmarkPlus,
  RefreshCw,
  Check,
  X,
  TriangleAlert,
  Clock3,
  Trash2,
} from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

const formatDate = (value: string) => {
  try {
    return new Date(value).toLocaleString('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

/**
 * A submission is considered a duplicate when its text (or title) matches the
 * bundled official content or an already-approved submission. Official adhkar
 * live only in the frontend bundle, so the duplicate check is done client-side
 * here. It only warns — it never blocks the admin's decision.
 */
function useDuplicateCheck(submissions: AdminDhikrSubmission[]) {
  return useMemo(() => {
    const officialTexts = new Set(ADHKARS.map((d) => d.text.trim()));
    const approvedTexts = new Set(
      submissions
        .filter((s) => s.status === 'APPROVED')
        .map((s) => s.text.trim()),
    );
    const map: Record<string, boolean> = {};
    for (const s of submissions) {
      const text = s.text.trim();
      const title = s.title.trim();
      map[s.id] =
        officialTexts.has(text) ||
        approvedTexts.has(text) ||
        ADHKARS.some(
          (d) => d.title?.trim() === title || d.text.trim() === text,
        );
    }
    return map;
  }, [submissions]);
}

export default function AdminDhikrSubmissionsPage() {
  const addNotification = useAppStore((s) => s.addNotification);
  const [submissions, setSubmissions] = useState<AdminDhikrSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDhikrSubmission | null>(null);

  const duplicateMap = useDuplicateCheck(submissions);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDhikrSubmissions();
      setSubmissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (submission: AdminDhikrSubmission) => {
    if (busyId) return;
    setBusyId(submission.id);
    try {
      await approveDhikrSubmission(submission.id);
      addNotification('تم اعتماد الذكر وسيظهر في القسم', 'success', 4000);
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === submission.id ? { ...s, status: 'APPROVED' } : s,
        ),
      );
    } catch (err) {
      addNotification(
        err instanceof Error ? err.message : 'فشل اعتماد الذكر',
        'error',
        4000,
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (submission: AdminDhikrSubmission) => {
    if (busyId) return;
    setBusyId(submission.id);
    try {
      await rejectDhikrSubmission(submission.id);
      addNotification(
        'تم رفض الذكر وإشعار المستخدم بذلك',
        'info',
        4000,
      );
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === submission.id ? { ...s, status: 'REJECTED' } : s,
        ),
      );
    } catch (err) {
      addNotification(
        err instanceof Error ? err.message : 'فشل رفض الذكر',
        'error',
        4000,
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || busyId) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteDhikrSubmission(deleteTarget.id);
      addNotification('تم حذف الذكر نهائياً', 'success', 4000);
      setSubmissions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      addNotification(
        err instanceof Error ? err.message : 'فشل حذف الذكر',
        'error',
        4000,
      );
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = submissions.filter((s) => s.status === 'PENDING').length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
      <motion.div {...fadeUp}>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 mb-6 group"
        >
          <ChevronRight className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span className="text-sm font-medium">العودة للرئيسية</span>
        </button>
      </motion.div>

      <motion.div {...fadeUp}>
        <Card padding="lg" className="mb-6 relative overflow-hidden">
          <div className="absolute -top-10 -end-10 w-40 h-40 rounded-full bg-primary-100/40 dark:bg-primary-900/15 blur-2xl pointer-events-none" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <BookmarkPlus className="w-5 h-5 text-primary-500" />
              أذكار المستخدمين
            </h2>
            <div className="flex items-center gap-2">
              <Badge variant="primary" icon={<Clock3 className="w-3 h-3" />}>
                {pendingCount} قيد المراجعة
              </Badge>
              <Button size="sm" variant="ghost" onClick={load} loading={loading} icon={<RefreshCw className="w-4 h-4" />}>
                تحديث
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      {error && (
        <motion.div {...fadeUp} className="mb-4">
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        </motion.div>
      )}

      <motion.div {...fadeUp}>
        <Card padding="none" className="overflow-hidden">
          {loading && submissions.length === 0 ? (
            <div className="min-h-[40vh] flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-16 px-4">
              <p className="text-gray-500 dark:text-gray-400">لا توجد أذكار مقدمة بعد</p>
            </div>
          ) : (
            <ul className="divide-y divide-light-border dark:divide-dark-border">
              {submissions.map((submission) => {
                const isDuplicate = duplicateMap[submission.id];
                const isPending = submission.status === 'PENDING';
                return (
                  <li key={submission.id} className="px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0 mb-3">
                      <Avatar src={submission.user.avatarUrl} name={submission.user.displayName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate block">
                          {submission.user.displayName}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate block" dir="ltr">
                          {submission.user.email}
                        </span>
                      </div>
                      <StatusBadge status={submission.status} />
                    </div>

                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                      {submission.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap mb-2">
                      {submission.text}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant="secondary" size="sm">
                        القسم: {CATEGORY_META[submission.categoryId]?.title ?? submission.categoryId}
                      </Badge>
                      {submission.source && (
                        <Badge variant="secondary" size="sm">
                          المصدر: {submission.source}
                        </Badge>
                      )}
                      {isDuplicate && (
                        <Badge variant="warning" size="sm" icon={<TriangleAlert className="w-3 h-3" />}>
                          قد يكون مكرراً (مطابق لمحتوى موجود)
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                      تاريخ الإرسال: {formatDate(submission.createdAt)}
                    </p>

                    {isPending ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="success"
                          icon={<Check className="w-4 h-4" />}
                          loading={busyId === submission.id}
                          disabled={!!busyId}
                          onClick={() => handleApprove(submission)}
                        >
                          قبول
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<X className="w-4 h-4" />}
                          loading={busyId === submission.id}
                          disabled={!!busyId}
                          onClick={() => handleReject(submission)}
                        >
                          رفض
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
                          {submission.status === 'APPROVED'
                            ? 'تمت الموافقة على هذا الذكر وهو ظاهر في القسم.'
                            : 'تم رفض هذا الذكر وإشعار المستخدم بذلك.'}
                        </p>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<Trash2 className="w-4 h-4" />}
                          loading={busyId === submission.id}
                          disabled={!!busyId}
                          onClick={() => setDeleteTarget(submission)}
                        >
                          حذف
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </motion.div>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="تأكيد الحذف"
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          هل أنت متأكد من حذف هذا الذكر نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="flex-1">
            إلغاء
          </Button>
          <Button
            variant="danger"
            loading={busyId === deleteTarget?.id}
            onClick={handleDelete}
            className="flex-1"
          >
            حذف
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function StatusBadge({ status }: { status: AdminDhikrSubmission['status'] }) {
  if (status === 'PENDING') {
    return (
      <Badge variant="warning" size="sm" icon={<Clock3 className="w-3 h-3" />}>
        قيد المراجعة
      </Badge>
    );
  }
  if (status === 'APPROVED') {
    return (
      <Badge variant="success" size="sm" icon={<Check className="w-3 h-3" />}>
        مقبول
      </Badge>
    );
  }
  return (
    <Badge variant="danger" size="sm" icon={<X className="w-3 h-3" />}>
      مرفوض
    </Badge>
  );
}