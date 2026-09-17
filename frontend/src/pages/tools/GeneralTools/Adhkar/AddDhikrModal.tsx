import { useEffect, useState } from 'react';
import { Modal } from '@/components/UI/Modal';
import { Input, TextArea } from '@/components/UI/Input';
import { Button } from '@/components/UI/Button';
import { useAppStore } from '@/store/useAppStore';
import { useAdhkarApprovedStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarApprovedStore';
import {
  submitDhikrSubmission,
  updateDhikrSubmission,
  updateOfficialDhikr,
} from '@/pages/tools/GeneralTools/Adhkar/adhkarApi';
import { isNetworkError } from '@/services/apiError';
import type { DhikrCategory } from '@/pages/tools/GeneralTools/Adhkar/adhkar';

const NOT_LOGGED_IN_MESSAGE = 'غير مصرح';

/** A dhikr being edited by an admin. `id` is the API id (official dhikr id or
 * submission uuid) — for approved content it is the `sub-<uuid>` prefix stripped. */
export type EditedDhikr = {
  kind: 'official' | 'approved';
  id: string;
  category: DhikrCategory;
  title: string;
  text: string;
  source: string;
};

type AddDhikrModalProps = {
  open: boolean;
  onClose: () => void;
  categoryId: DhikrCategory;
  categoryTitle: string;
  editing?: EditedDhikr | null;
};

type FieldErrors = Partial<Record<'title' | 'text', string>>;

function AddDhikrModal({
  open,
  onClose,
  categoryId,
  categoryTitle,
  editing = null,
}: AddDhikrModalProps) {
  const addNotification = useAppStore((s) => s.addNotification);
  const reloadApproved = useAdhkarApprovedStore((s) => s.load);

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const isEditing = editing !== null;

  // Prefill the form whenever the modal is opened for an existing dhikr.
  useEffect(() => {
    if (open && editing) {
      setTitle(editing.title ?? '');
      setText(editing.text ?? '');
      setSource(editing.source ?? '');
      setErrors({});
    }
  }, [open, editing]);

  const handleClose = () => {
    if (submitting) return;
    setErrors({});
    setTitle('');
    setText('');
    setSource('');
    onClose();
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    
    if (!text.trim()) next.text = 'يرجى إدخال محتوى الذكر';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const content = {
        title: title.trim(),
        text: text.trim(),
        source: source.trim(),
      };
      if (editing) {
        if (editing.kind === 'official') {
          await updateOfficialDhikr(editing.id, content);
        } else {
          await updateDhikrSubmission(editing.id, content);
        }
        addNotification('تم حفظ تعديلات الذكر', 'success', 4000);
      } else {
        await submitDhikrSubmission({ categoryId, ...content });
        addNotification('تم إرسال الذكر وسيظهر بعد مراجعة الإدارة', 'success', 4000);
      }
      // Approved/edited content may have changed; refresh silently. Also
      // clears any previous network failure flag so the next submit can retry.
      void reloadApproved();
      setTitle('');
      setText('');
      setSource('');
      setErrors({});
      onClose();
    } catch (err) {
      if (isNetworkError(err)) {
        addNotification(
          editing
            ? 'تعذر حفظ التعديلات، تحقق من اتصالك بالإنترنت'
            : 'تعذر إرسال الذكر، تحقق من اتصالك بالإنترنت',
          'error',
          4000,
        );
      } else if (err instanceof Error && err.message === NOT_LOGGED_IN_MESSAGE) {
        addNotification(
          editing ? 'يجب تسجيل الدخول لتحرير الأذكار' : 'يجب تسجيل الدخول لإضافة ذكر',
          'warning',
          4000,
        );
      } else {
        addNotification(
          err instanceof Error ? err.message : 'حدث خطأ غير متوقع',
          'error',
          4000,
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={editing ? 'تعديل الذكر' : 'إضافة ذكر'}
      description={
        editing
          ? 'سيتم حفظ التعديلات وستظهر مباشرة لجميع المستخدمين.'
          : `سيُرسل الذكر للمراجعة ولن يظهر في قسم ${categoryTitle} إلا بعد اعتماده من الإدارة.`
      }
      size="sm"
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      showClose={!submitting}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
       

        <TextArea
          label="محتوى الذكر"
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب نص الذكر هنا..."
          error={errors.text}
          disabled={submitting}
          aria-label="محتوى الذكر"
        />

        <Input
          label="المصدر"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="مثال: متفق عليه، أو مرجع موثوق (اختياري)"
          disabled={submitting}
          aria-label="المصدر"
        />

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
            إلغاء
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {editing ? 'حفظ التعديلات' : 'إرسال للمراجعة'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export { AddDhikrModal };
export type { AddDhikrModalProps };