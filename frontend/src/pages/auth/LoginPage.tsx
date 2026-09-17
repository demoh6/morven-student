import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { Button } from '@/components/UI/Button';
import { Input } from '@/components/UI/Input';
import { Card } from '@/components/UI/Card';
import { GoogleSignInButton } from '@/pages/auth/GoogleSignInButton';
import { ChevronLeft } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
      navigate('/');
    } catch {
      // error is set in the store
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center bg-gray-50 dark:bg-dark-bg px-4 py-8 sm:py-12">
      <div className="w-full max-w-md mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 group mb-4"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:ps-1" />
          <span className="font-medium">العودة إلى الرئيسية</span>
        </Link>
        <Card className="w-full" padding="lg">
        <div className="text-center mb-8">
          <img src="/morven.png" alt="مورفن" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            تسجيل الدخول
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            الدخول إلى حسابك في الملتقى
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <Input
            label="البريد الإلكتروني"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="example@email.com"
          />

          <Input
            label="كلمة المرور"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />

          <div className="flex justify-end -mt-2">
            <Link
              to="/forgot-password"
              className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              نسيت كلمة المرور؟
            </Link>
          </div>

          <Button
            type="submit"
            loading={loading}
            className="w-full"
            size="lg"
          >
            دخول
          </Button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <span className="flex-1 h-px bg-light-border dark:bg-dark-border" />
          <span className="text-xs text-gray-400 dark:text-gray-500">أو</span>
          <span className="flex-1 h-px bg-light-border dark:bg-dark-border" />
        </div>

        <GoogleSignInButton mode="login" onSuccess={() => navigate('/')} />

        <div className="mt-6 text-center space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ليس لديك حساب؟{' '}
            <Link
              to="/register"
              className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              إنشاء حساب
            </Link>
          </p>
          <div className="pt-3 border-t border-light-border dark:border-dark-border">
            <Link
              to="/privacy"
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
            >
              سياسة الخصوصية
            </Link>
          </div>
        </div>
      </Card>
      </div>
    </div>
  );
}
