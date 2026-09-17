import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/UI/Button';
import { Input } from '@/components/UI/Input';
import { Card } from '@/components/UI/Card';
import { requestPasswordReset } from '@/pages/auth/authApi';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
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
            استعادة كلمة المرور
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين
          </p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm leading-6">
              إذا كان هذا البريد الإلكتروني مسجلاً، فستصلك رسالة تحتوي على رابط إعادة تعيين كلمة
              المرور.
            </div>
            <Button
              as="link"
              to="/login"
              variant="secondary"
              className="w-full mt-6"
              size="lg"
            >
              العودة إلى تسجيل الدخول
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
              label="البريد الإلكتروني"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="example@email.com"
              dir="ltr"
            />

            <Button
              type="submit"
              loading={loading}
              className="w-full"
              size="lg"
            >
              إرسال رابط إعادة التعيين
            </Button>

            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              تذكرت كلمة المرور؟{' '}
              <Link
                to="/login"
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                تسجيل الدخول
              </Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
