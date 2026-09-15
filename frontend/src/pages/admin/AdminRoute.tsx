import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { isAdminRole, isMainAdminRole } from '@/pages/auth/roles';

interface AdminRouteProps {
  children: React.ReactNode;
  /** Only the main ADMIN may enter (administrative role management). */
  requireMainAdmin?: boolean;
}

export function AdminRoute({ children, requireMainAdmin = false }: AdminRouteProps) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const allowed = user
    ? requireMainAdmin
      ? isMainAdminRole(user.role)
      : isAdminRole(user.role)
    : false;

  useEffect(() => {
    if (user && !allowed) {
      const t = setTimeout(() => navigate('/', { replace: true }), 4000);
      return () => clearTimeout(t);
    }
  }, [user, allowed, navigate]);

  if (!user || !allowed) {
    return (
      <ProtectedRoute>
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
            غير مصرح
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            هذه الصفحة متاحة للمشرفين فقط. سيتم تحويلك إلى الصفحة الرئيسية...
          </p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </ProtectedRoute>
    );
  }

  return <>{children}</>;
}