import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card } from '@/components/UI/Card';
import { Button } from '@/components/UI/Button';
import { Input, TextArea } from '@/components/UI/Input';
import { submitSuggestion } from '@/services/suggestionApi';
import { useAppStore } from '@/store/useAppStore';
import { ChevronLeft, Lightbulb, Send, EyeOff } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export default function SuggestionsPage() {
  const addNotification = useAppStore((s) => s.addNotification);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      addNotification('يرجى إدخال اسم الاقتراح', 'warning');
      return;
    }
    if (!content.trim()) {
      addNotification('يرجى إدخال الموضوع', 'warning');
      return;
    }

    setSaving(true);
    try {
      await submitSuggestion({ title: title.trim(), content: content.trim(), anonymous });
      setTitle('');
      setContent('');
      setAnonymous(false);
      addNotification('تم إرسال الاقتراح بنجاح', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ';
      setError(message);
      addNotification(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" dir="rtl">
      <motion.div {...fadeUp}>
        <Link
          to="/connect"
          className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 mb-6 group"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:ps-1" />
          <span className="text-sm font-medium">العودة</span>
        </Link>
      </motion.div>

      <motion.div {...fadeUp}>
        <Card padding="lg" className="relative overflow-hidden">
          <div className="absolute -top-10 -end-10 w-40 h-40 rounded-full bg-primary-100/40 dark:bg-primary-900/15 blur-2xl pointer-events-none" />
          <div className="relative">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary-500" />
              الاقتراحات
            </h2>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              شاركنا اقتراحاتك وأفكارك لتحسين مورفن، سنقرأ كل اقتراح بعناية.
            </p>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm mb-5">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <Input
                label="اسم الاقتراح"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: إضافة وضع الحفظ التلقائي"
                required
              />

              <TextArea
                label="الموضوع"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="اكتب تفاصيل اقتراحك هنا..."
                rows={6}
                required
              />

              <label className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 dark:bg-dark-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                  className="w-4 h-4 accent-primary-600"
                />
                <EyeOff className="w-5 h-5 text-gray-400 shrink-0" />
                <div className="flex-1">
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    إرسال بشكل متخفٍ
                  </span>
                  
                </div>
              </label>

              <Button
                type="submit"
                loading={saving}
                className="w-full"
                size="lg"
                icon={<Send className="w-4 h-4" />}
              >
                إرسال الاقتراح
              </Button>
            </form>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}