import { useEffect, useState } from 'react';
import { Modal, Button, Input } from '@/components/UI';
import type { UniversityPayload } from '../../api/portfolioApi';
import type { MockUniversity } from '../../types';

interface UniversityFormModalProps {
  open: boolean;
  existing: MockUniversity | null;
  onClose: () => void;
  onSubmit: (payload: UniversityPayload) => Promise<void>;
}

interface FormState {
  name: string;
}

const emptyForm: FormState = {
  name: '',
};

export default function UniversityFormModal({
  open,
  existing,
  onClose,
  onSubmit,
}: UniversityFormModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setBusy(false);
    setForm(existing ? { name: existing.name } : emptyForm);
  }, [open, existing]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = 'اسم الجامعة مطلوب';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setBusy(true);
    setServerError(null);
    try {
      await onSubmit({ name: form.name.trim() });
      onClose();
    } catch (err) {
      setServerError((err as Error).message || 'تعذر حفظ الجامعة');
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={existing ? 'تعديل الجامعة' : 'إضافة جامعة'}
      description="المعلومات التي تظهر للطلاب عند اختيار الجامعة."
    >
      <div className="space-y-4">
        <Input
          label="اسم الجامعة"
          required
          value={form.name}
          onChange={(e) => set('name')(e.target.value)}
          error={errors.name}
          placeholder="جامعة النجاح الوطنية"
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
            {existing ? 'حفظ التعديلات' : 'إضافة الجامعة'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
