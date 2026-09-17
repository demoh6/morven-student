import { useState, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/UI/Button';
import { Input } from '@/components/UI/Input';
import { Card } from '@/components/UI/Card';
import { resetPassword } from '@/pages/auth/authApi';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    if (!token) {
      setError('رابط إعادة التعيين غير صالح');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg px-4">
      <Card className="w-full max-w-md" padding="lg">
        <div className="text-center mb-8">
          <img src="/morven.png" alt="مورفن" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            إعادة تعيين كلمة المرور
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            أدخل كلمة مرور جديدة
          </p>
        </div>

        {!token && !done && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm leading-6">
            رابط إعادة التعيين غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد.
          </div>
        )}

        {done ? (
          <div className="text-center">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm leading-6">
              تم إعادة تعيين كلمة المرور بنجاح
            </div>
            <Button
              as="link"
              to="/login"
              className="w-full mt-6"
              size="lg"
            >
              تسجيل الدخول
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <Input
              label="كلمة المرور الجديدة"
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
              إعادة تعيين كلمة المرور
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
