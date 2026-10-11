import { useEffect, useState } from 'react';
import { CircleAlert, Save, Trash2, X } from 'lucide-react';
import { Button, Input, Select, TextArea } from '@/components/UI';
import type { PdfRect, TemplateFieldDefinition, TemplateFieldType } from '../model';
import { fieldTypeLabels } from '../labels';

interface PendingSelection {
  page: number;
  rect: PdfRect;
  text: string;
}

interface FieldConfigPanelProps {
  selectedField: TemplateFieldDefinition | null;
  pending: PendingSelection | null;
  onSave: (definition: TemplateFieldDefinition) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}

const typeOptions = [
  { value: 'TEXT', label: `${fieldTypeLabels.TEXT} — نص قصير` },
  { value: 'TEXTAREA', label: `${fieldTypeLabels.TEXTAREA} — فقرة` },
  { value: 'IMAGE', label: fieldTypeLabels.IMAGE },
];

export default function FieldConfigPanel({
  selectedField,
  pending,
  onSave,
  onDelete,
  onCancel,
}: FieldConfigPanelProps) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<TemplateFieldType>('TEXT');
  const [defaultValue, setDefaultValue] = useState('');
  const [required, setRequired] = useState(false);

  const editing = selectedField !== null;
  const active = editing || pending !== null;

  const page = selectedField?.page ?? pending?.page ?? 1;
  const rect = selectedField ?? pending?.rect ?? { x: 0, y: 0, width: 0, height: 0 };
  const selectedText = pending?.text ?? selectedField?.originalText ?? '';

  useEffect(() => {
    if (selectedField) {
      setLabel(selectedField.label);
      setType(selectedField.type);
      setDefaultValue(selectedField.defaultValue);
      setRequired(selectedField.required);
    } else if (pending) {
      setLabel(pending.text.trim().slice(0, 60) || 'حقل جديد');
      setType(pending.text.trim() && !/[\u0600-\u06FF]/.test(pending.text) ? 'TEXT' : pending.text.trim() ? 'TEXTAREA' : 'IMAGE');
      setDefaultValue(pending.text);
      setRequired(false);
    }
  }, [selectedField, pending]);

  if (!active) {
    return (
      <div className="text-center py-8 text-gray-400 dark:text-gray-500">
        <p className="text-sm font-medium">اختر أو أنشئ منطقة على المستند</p>
        <p className="text-xs mt-1 leading-relaxed">
          استخدم «تحديد نص» لاختيار نص، أو «رسم منطقة» لتحديد صورة أو مقطع عام، ثم احفظه كحقل.
        </p>
      </div>
    );
  }

  const isRtl = (value: string) => /[\u0600-\u06FF]/.test(value);

  const handleSave = () => {
    const base: TemplateFieldDefinition = {
      id: selectedField?.id ?? '',
      label: label.trim() || 'حقل بلا اسم',
      type,
      page,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      defaultValue,
      required,
      originalText: selectedText,
    };
    onSave(base);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white truncate">
            {editing ? 'تعديل الحقل' : 'إنشاء حقل'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            الصفحة {page} — الموقع (نقاط PDF): x {rect.x.toFixed(1)} • y {rect.y.toFixed(1)} • {rect.width.toFixed(1)}×{rect.height.toFixed(1)}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-surface"
          aria-label="إلغاء التحديد"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {selectedText && (
        <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 mb-1">النص المحدد من المستند</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed break-words">{selectedText}</p>
        </div>
      )}

      <Select
        label="نوع الحقل"
        value={type}
        onChange={(e) => setType(e.target.value as TemplateFieldType)}
        options={typeOptions}
      />

      <Input
        label="اسم الحقل / التسمية"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="مثال: اسم الطالب"
      />

      <TextArea
        label={`${type === 'IMAGE' ? 'الصورة الافتراضية' : 'القيمة الافتراضية (اختياري)'}`}
        value={defaultValue}
        onChange={(e) => setDefaultValue(e.target.value)}
        placeholder={type === 'IMAGE' ? 'لا حاجة لرابط صورة في هذه المرحلة' : 'النص الذي سيعرضه الطالب في المستند'}
        className="min-h-[64px]"
      />

      {!editing && isRtl(defaultValue) && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          النص العربي يُحفظ بترتيبه المنطقي. توليد PDF بعربية صحيحة يتطلب معالجة تشكيل على الخادم في المرحلة الثالثة.
        </p>
      )}

      <label className="flex items-center gap-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        حقل إلزامي (يمنع التصدير قبل تعبئته)
      </label>

      <div className="flex flex-col gap-2 pt-1">
        <Button
          onClick={handleSave}
          icon={<Save className="w-4 h-4" />}
          className="w-full"
        >
          {editing ? 'حفظ التغييرات' : 'حفظ كحقل'}
        </Button>
        {editing && (
          <Button
            variant="ghost"
            onClick={() => onDelete(selectedField.id)}
            icon={<Trash2 className="w-4 h-4" />}
            className="w-full text-red-500 hover:text-red-600"
          >
            حذف الحقل
          </Button>
        )}
      </div>
    </div>
  );
}