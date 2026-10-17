import { useEffect, useState } from 'react';
import { Modal, Button, Input } from '@/components/UI';
import type { CohortPayload } from '../../api/portfolioApi';
import type { MockBatch } from '../../types';

interface CohortFormModalProps {
  open: boolean;
  existing: MockBatch | null;
  universityId: string;
  onClose: () => void;
  onSubmit: (payload: CohortPayload) => Promise<void>;
}

export default function CohortFormModal({
  open,
  existing,
  universityId,
  onClose,
  onSubmit,
}: CohortFormModalProps) {
  const [form, setForm] = useState({
    label: '',
    order: '',
    academicYears: '',
    description: '',
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
            label: existing.label,
            order: String(existing.order),
            academicYears: existing.academicYears,
            description: existing.description ?? '',
          }
        : {
            label: '',
            order: '1',
            academicYears: new Date().getFullYear().toString(),
            description: '',
          },
    );
  }, [open, existing]);

  const set = (key: string) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    const next: Record<string, string | undefined> = {};
    if (!form.label.trim()) next.label = 'اسم الدفعة مطلوب';
    if (!form.academicYears.trim()) next.academicYears = 'السنوات الأكاديمية مطلوبة';
    const order = Number(form.order);
    if (!form.order.trim() || !Number.isInteger(order) || order < 1) {
      next.order = 'ترتيب صالحة أكبر من 0';
    }
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
        label: form.label.trim(),
        order: Number(form.order),
        academicYears: form.academicYears.trim(),
        description: form.description.trim() || null,
      });
      onClose();
    } catch (err) {
      setServerError((err as Error).message || 'تعذر حفظ الدفعة');
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={existing ? 'تعديل الدفعة' : 'إضافة دفعة'}
      description="إضافة دفعة أو فرقة لجامعة مختارة."
    >
      <div className="space-y-4">
        <Input
          label="اسم الدفعة"
          required
          value={form.label}
          onChange={(e) => set('label')(e.target.value)}
          error={errors.label}
          placeholder="السنة الرابعة"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="ترتيب العرض"
            required
            type="number"
            inputMode="numeric"
            value={form.order}
            onChange={(e) => set('order')(e.target.value)}
            error={errors.order}
            placeholder="4"
          />
          <Input
            label="السنوات الأكاديمية"
            required
            value={form.academicYears}
            onChange={(e) => set('academicYears')(e.target.value)}
            error={errors.academicYears}
            placeholder="2022/2023"
          />
        </div>
        <Input
          label="وصف (اختياري)"
          value={form.description}
          onChange={(e) => set('description')(e.target.value)}
          placeholder="مرحلة التخرج"
        />
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
            {existing ? 'حفظ التعديلات' : 'إضافة الدفعة'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
