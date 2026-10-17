import { useEffect, useState } from 'react';
import { Modal, Button, Input } from '@/components/UI';
import type { CoursePayload } from '../../api/portfolioApi';
import type { MockBatch, MockSubject } from '../../types';

interface CourseFormModalProps {
  open: boolean;
  existing: MockSubject | null;
  universityId: string;
  cohorts: MockBatch[];
  defaultBatchId?: string | null;
  onClose: () => void;
  onSubmit: (payload: CoursePayload) => Promise<void>;
}

const KIND_OPTIONS = ['مقرر', 'مشروع تخرج', 'ملف إنجاز', 'تدريب ميداني'];

export default function CourseFormModal({
  open,
  existing,
  universityId,
  cohorts,
  defaultBatchId = null,
  onClose,
  onSubmit,
}: CourseFormModalProps) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    portfolioKind: 'مقرر',
    batchIds: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setBusy(false);
    setForm(
      existing
        ? {
            name: existing.name,
            code: existing.code ?? '',
            description: existing.description ?? '',
            portfolioKind: existing.portfolioKind,
            batchIds: [...(existing.batchIds ?? [])],
          }
        : {
            name: '',
            code: '',
            description: '',
            portfolioKind: 'مقرر',
            batchIds: defaultBatchId ? [defaultBatchId] : [],
          },
    );
  }, [open, existing, defaultBatchId]);

  const set = (key: string) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleBatch = (id: string) => {
    setForm((prev) => {
      const has = prev.batchIds.includes(id);
      return {
        ...prev,
        batchIds: has ? prev.batchIds.filter((b) => b !== id) : [...prev.batchIds, id],
      };
    });
  };

  const validate = () => {
    const next: Record<string, string | undefined> = {};
    if (!form.name.trim()) next.name = 'اسم المقرر مطلوب';
    if (!form.portfolioKind.trim()) next.kind = 'نوع الملف مطلوب';
    setErrors(next);
    return Object.keys(next).filter((k) => next[k]).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setBusy(true);
    setServerError(null);
    try {
      await onSubmit({
        universityId,
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim(),
        portfolioKind: form.portfolioKind.trim(),
        batchIds: form.batchIds,
      });
      onClose();
    } catch (err) {
      setServerError((err as Error).message || 'تعذر حفظ المقرر');
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={existing ? 'تعديل المقرر' : 'إضافة مقرر'}
      description="المقرر يُربط بالجامعة ويمكن تخصيصه لدفعات معينة."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="اسم المقرر"
            required
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            error={errors.name}
            placeholder="الطب البشري"
          />
          <Input
            label="الكود (اختياري)"
            value={form.code}
            onChange={(e) => set('code')(e.target.value)}
            placeholder="MED"
          />
          <Input
            label="نوع الملف"
            required
            list="portfolio-kinds"
            value={form.portfolioKind}
            onChange={(e) => set('portfolioKind')(e.target.value)}
            error={errors.kind}
            placeholder="ملف إنجاز"
          />
          <datalist id="portfolio-kinds">
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <div className="sm:col-span-2">
            <Input
              label="وصف (اختياري)"
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
              placeholder="وصف مختصر عن المقرر"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            الدفعات المرتبطة (اختياري)
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            في حال تركها فارغة، يظهر المقرر لجميع دفعات الجامعة.
          </p>
          <div className="space-y-2 max-h-48 overflow-auto rounded-xl border border-light-border dark:border-dark-border p-3">
            {cohorts.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                لا توجد دفعات لهذه الجامعة بعد.
              </p>
            ) : (
              cohorts.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.batchIds.includes(c.id)}
                    onChange={() => toggleBatch(c.id)}
                    className="w-4 h-4 accent-primary-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                    {c.label} — {c.academicYears}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {serverError && (
          <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-3" role="alert">
            {serverError}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button className="flex-1" onClick={handleSubmit} loading={busy}>
            {existing ? 'حفظ التعديلات' : 'إضافة المقرر'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
