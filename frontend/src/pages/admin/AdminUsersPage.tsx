import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card } from '@/components/UI/Card';
import { Button } from '@/components/UI/Button';
import { Badge } from '@/components/UI/Badge';
import { Avatar } from '@/pages/connect/Avatar';
import { listUsers, updateUserRole, type AdminUser } from '@/pages/admin/adminApi';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { ROLE_ADMIN, ROLE_SUB_ADMIN, ROLE_USER } from '@/pages/auth/roles';
import { ChevronLeft, Shield, User, RefreshCw } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

type SystemRole = 'ADMIN' | 'SUB_ADMIN' | 'USER';

const ROLE_BADGE: Record<SystemRole, { label: string; variant: 'primary' | 'info' | 'secondary' }> = {
  [ROLE_ADMIN]: { label: 'مشرف', variant: 'primary' },
  [ROLE_SUB_ADMIN]: { label: 'مشرف فرعي', variant: 'info' },
  [ROLE_USER]: { label: 'مستخدم', variant: 'secondary' },
};

export default function AdminUsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (user: AdminUser, role: SystemRole) => {
    setBusyId(user.id);
    setError(null);
    try {
      const updated = await updateUserRole(user.id, role);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setBusyId(null);
    }
  };

  const roleCount = (role: SystemRole) => users.filter((u) => u.role === role).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
      <motion.div {...fadeUp}>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 mb-6 group"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:ps-1" />
          <span className="text-sm font-medium">العودة للرئيسية</span>
        </Link>
      </motion.div>

      <motion.div {...fadeUp}>
        <Card padding="lg" className="mb-6 relative overflow-hidden">
          <div className="absolute -top-10 -end-10 w-40 h-40 rounded-full bg-primary-100/40 dark:bg-primary-900/15 blur-2xl pointer-events-none" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary-500" />
              إدارة المستخدمين والأدوار
            </h2>
            <div className="flex items-center gap-2">
              <Badge variant="primary" icon={<Shield className="w-3 h-3" />}>
                {roleCount(ROLE_ADMIN)} مشرف
              </Badge>
              <Badge variant="info" icon={<Shield className="w-3 h-3" />}>
                {roleCount(ROLE_SUB_ADMIN)} مشرف فرعي
              </Badge>
              <Badge variant="secondary" icon={<User className="w-3 h-3" />}>
                {roleCount(ROLE_USER)} مستخدم
              </Badge>
              <Button size="sm" variant="ghost" onClick={loadUsers} loading={loading} icon={<RefreshCw className="w-4 h-4" />}>
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
          {loading && users.length === 0 ? (
            <div className="min-h-[40vh] flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 px-4">
              <p className="text-gray-500 dark:text-gray-400">لا يوجد مستخدمون بعد</p>
            </div>
          ) : (
            <ul className="divide-y divide-light-border dark:divide-dark-border">
              {users.map((user) => {
                const role = (user.role in ROLE_BADGE ? user.role : ROLE_USER) as SystemRole;
                const badge = ROLE_BADGE[role];
                const isSelf = user.id === currentUser?.id;
                const everBusy = busyId === user.id;
                const isSubAdmin = role === ROLE_SUB_ADMIN;
                const isMainAdmin = role === ROLE_ADMIN;
                return (
                  <li
                    key={user.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar src={user.avatarUrl} name={user.displayName} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {user.displayName}
                          </span>
                          {isSelf && (
                            <Badge variant="info" size="sm">أنت</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate" dir="ltr">
                          @{user.username} · {user.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={badge.variant} dot>
                        {badge.label}
                      </Badge>

                      {isMainAdmin ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleRoleChange(user, ROLE_USER)}
                          loading={everBusy}
                          disabled={isSelf}
                          title={isSelf ? 'لا يمكنك إزالة صلاحية نفسك' : 'تحويل إلى مستخدم'}
                        >
                          تحويل إلى مستخدم
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleRoleChange(user, ROLE_ADMIN)}
                            loading={everBusy}
                          >
                            ترقية إلى مشرف
                          </Button>
                          {isSubAdmin ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleRoleChange(user, ROLE_USER)}
                              loading={everBusy}
                            >
                              تحويل إلى مستخدم
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleRoleChange(user, ROLE_SUB_ADMIN)}
                              loading={everBusy}
                            >
                              ترقية إلى مشرف فرعي
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </motion.div>
    </div>
  );
}