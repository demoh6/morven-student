import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { Button } from '@/components/UI/Button';
import { Input } from '@/components/UI/Input';
import { Card } from '@/components/UI/Card';
import { GoogleSignInButton } from '@/pages/auth/GoogleSignInButton';
import { ChevronLeft } from 'lucide-react';

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const { register, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError('');

    if (password !== confirmPassword) {
      setLocalError('كلمتا المرور غير متطابقتين');
      return;
    }

    try {
      await register(email, username, password, displayName);
      navigate('/');
    } catch {
      // error is set in the store
    }
  };

  const displayError = localError || error;

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
            إنشاء حساب
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            انضم إلى الملتقى التعليمي
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {displayError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {displayError}
            </div>
          )}

          <Input
            label="الاسم المعروض"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
            placeholder="محمد "
          />

          <Input
            label="اسم المستخدم"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            placeholder="mohammed"
            dir="ltr"
          />

          <Input
            label="البريد الإلكتروني"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="example@email.com"
            dir="ltr"
          />

          <Input
            label="كلمة المرور"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="8 أحرف على الأقل"
            dir="ltr"
          />

          <Input
            label="تأكيد كلمة المرور"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="••••••••"
            dir="ltr"
          />

          <Button
            type="submit"
            loading={loading}
            className="w-full"
            size="lg"
          >
            إنشاء حساب
          </Button>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center leading-6">
            بإنشاء حساب، يمكنك الاطلاع على{' '}
            <Link
              to="/privacy"
              className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              سياسة الخصوصية
            </Link>
            .
          </p>
        </form>

        <div className="flex items-center gap-3 my-6">
          <span className="flex-1 h-px bg-light-border dark:bg-dark-border" />
          <span className="text-xs text-gray-400 dark:text-gray-500">أو</span>
          <span className="flex-1 h-px bg-light-border dark:bg-dark-border" />
        </div>

        <GoogleSignInButton mode="register" onSuccess={() => navigate('/')} />

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            لديك حساب بالفعل؟{' '}
            <Link
              to="/login"
              className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              تسجيل الدخول
            </Link>
          </p>
        </div>
      </Card>
      </div>
    </div>
  );
}
