import { useRef, type ChangeEvent } from 'react';
import { ImagePlus, RotateCcw, Trash2 } from 'lucide-react';
import { Input, TextArea } from '@/components/UI';
import type { PortfolioField } from '../types';
import { portfolioLabels } from '../labels';

interface FieldControlProps {
  field: PortfolioField;
  error: boolean;
  onChange: (value: string) => void;
}

function FieldHeader({ field, onChange }: { field: PortfolioField; onChange: (value: string) => void }) {
  const hasReset = field.value !== field.defaultValue;
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {field.label}
        {field.required && <span className="text-red-500 ms-0.5">*</span>}
      </p>
      {hasReset && (
        <button
          type="button"
          onClick={() => onChange(field.defaultValue)}
          className="inline-flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors shrink-0"
          title={portfolioLabels.editor.resetField}
        >
          <RotateCcw className="w-3 h-3" />
          {portfolioLabels.editor.resetField}
        </button>
      )}
    </div>
  );
}

function FieldError({ error }: { error: boolean }) {
  if (!error) return null;
  return (
    <p className="mt-1 text-xs text-red-500" role="alert">
      هذا الحقل إلزامي ويجب تعبئته قبل التصدير.
    </p>
  );
}

export function TextFieldControl({ field, error, onChange }: FieldControlProps) {
  return (
    <div>
      <FieldHeader field={field} onChange={onChange} />
      <Input
        value={field.value}
        placeholder={field.placeholder}
        helperText={field.helperText}
        error={error ? 'هذا الحقل إلزامي.' : undefined}
        required={field.required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
      <FieldError error={error} />
    </div>
  );
}

export function TextAreaFieldControl({ field, error, onChange }: FieldControlProps) {
  return (
    <div>
      <FieldHeader field={field} onChange={onChange} />
      <TextArea
        value={field.value}
        placeholder={field.placeholder}
        helperText={field.helperText}
        error={error ? 'هذا الحقل إلزامي.' : undefined}
        required={field.required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
      <FieldError error={error} />
    </div>
  );
}

export function ImageFieldControl({ field, error, onChange }: FieldControlProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <FieldHeader field={field} onChange={onChange} />
      {field.value ? (
        <div className="mt-1 flex items-end gap-3">
          <div className="w-24 h-28 rounded-xl overflow-hidden border border-light-border dark:border-dark-border bg-gray-50 dark:bg-dark-surface shrink-0">
            <img src={field.value} alt={field.label} className="w-full h-full object-cover" />
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 transition-colors mb-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            إزالة الصورة
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`mt-1 w-full rounded-xl border-2 border-dashed px-4 py-5 flex flex-col items-center gap-2 transition-colors ${
            error
              ? 'border-red-400 bg-red-50/50 dark:bg-red-900/10'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500'
          }`}
        >
          <span className="text-gray-400 dark:text-gray-500">
            <ImagePlus className="w-5 h-5" />
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {field.placeholder ?? 'ارفع صورة'}
          </span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
        aria-label={field.label}
      />
      {field.helperText && <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{field.helperText}</p>}
      <FieldError error={error} />
    </div>
  );
}

export default function FieldControl(props: FieldControlProps) {
  switch (props.field.type) {
    case 'TEXT':
      return <TextFieldControl {...props} />;
    case 'TEXTAREA':
      return <TextAreaFieldControl {...props} />;
    case 'IMAGE':
      return <ImageFieldControl {...props} />;
    default:
      return null;
  }
}