import { useNavigate } from 'react-router-dom';
import { BookmarkPlus, Lightbulb, FolderKanban, Shield } from 'lucide-react';
import { Card } from '@/components/UI';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { isMainAdminRole } from '@/pages/auth/roles';

const tools = [
  {
    id: 'adhkar',
    title: 'إدارة الأذكار',
    description: 'مراجعة الأذكار المقترحة والموافقة عليها أو رفضها.',
    icon: BookmarkPlus,
    path: '/admin/adhkar',
  },
  {
    id: 'suggestions',
    title: 'إدارة الاقتراحات',
    description: 'عرض الاقتراحات الواردة من المستخدمين وإدارتها.',
    icon: Lightbulb,
    path: '/admin/suggestions',
  },
  {
    id: 'portfolio',
    title: 'إدارة ملفات الـ Portfolio',
    description: 'إدارة قوالب الملفات الجامعية والجامعات والدفعات والمقررات.',
    icon: FolderKanban,
    path: '/admin/portfolio',
    requireMainAdmin: true,
  },
];

export default function AdminToolsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isMainAdmin = user ? isMainAdminRole(user.role) : false;

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-4" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary-500" />
          أدوات الإدارة
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          الوصول إلى أدوات الإدارة المختلفة.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tools.map((t) => {
          if (t.requireMainAdmin && !isMainAdmin) return null;
          const Icon = t.icon;
          return (
            <Card key={t.id} padding="sm" hoverable onClick={() => navigate(t.path)}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">
                    {t.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {t.description}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
