import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Save } from 'lucide-react';
import { Badge, Button, Card, Input, Select } from '@/components/UI';
import { getBatchById, getSubjectById, getUniversityById } from '../data/mock';
import type {
  AdminPortfolioTemplate,
  TemplateStatus,
} from './usePortfolioAdminStore';
import { nextAdminTemplateId, toPdfTemplateDefinition } from './usePortfolioAdminStore';
import type { TemplateFieldDefinition } from '../model';
import PdfTemplateEditor from './PdfTemplateEditor';

interface TemplateEditorPanelProps {
  existing: AdminPortfolioTemplate | null;
  selection: { universityId: string; batchId: string; subjectId: string } | null;
  onBack: () => void;
  onSave: (template: AdminPortfolioTemplate) => void;
}

const kindOptions = [
  { value: 'مقرر دراسي', label: 'مقرر دراسي' },
  { value: 'مشروع تخرج', label: 'مشروع تخرج' },
  { value: 'تدريب ميداني', label: 'تدريب ميداني' },
  { value: 'ملف إنجاز', label: 'ملف إنجاز' },
];

export default function TemplateEditorPanel({ existing, selection, onBack, onSave }: TemplateEditorPanelProps) {
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState(existing?.kind ?? (selection ? getSubjectById(selection.subjectId)?.portfolioKind ?? 'مقرر دراسي' : 'مقرر دراسي'));
  const [status, setStatus] = useState<TemplateStatus>(existing?.status ?? 'draft');
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(existing?.pdfBytes ?? null);
  const [pdfName, setPdfName] = useState(existing?.pdfName ?? '');
  const [fields, setFields] = useState<TemplateFieldDefinition[]>(existing?.fields ?? []);

  const universityId = existing?.universityId ?? selection?.universityId ?? '';
  const batchId = existing?.batchId ?? selection?.batchId ?? '';
  const subjectId = existing?.subjectId ?? selection?.subjectId ?? '';

  const university = getUniversityById(universityId);
  const batch = getBatchById(batchId);
  const subject = getSubjectById(subjectId);

  const canSave = Boolean(university && batch && subject);

  const template = useMemo(
    () =>
      toPdfTemplateDefinition({
        id: existing?.id ?? 'pending',
        name: name.trim() || `${subject?.name ?? 'قالب'} — ${kind}`,
        universityId,
        batchId,
        subjectId,
        kind,
        status,
        pdfName,
        pdfBytes,
        fields,
        createdAt: existing?.createdAt ?? Date.now(),
      }),
    [existing, name, kind, status, universityId, batchId, subjectId, pdfName, pdfBytes, fields, subject],
  );

  const handleSaveTemplate = () => {
    const saved: AdminPortfolioTemplate = {
      id: existing?.id ?? nextAdminTemplateId(),
      name: name.trim() || `${subject?.name ?? 'قالب'} — ${kind}`,
      universityId,
      batchId,
      subjectId,
      kind,
      status,
      pdfName,
      pdfBytes,
      fields,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    onSave(saved);
  };

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card padding="sm">
          <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-3">
            <div className="w-full lg:max-w-md space-y-3">
              <Input
                label="اسم القالب"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${subject?.name ?? ''} — ${kind}`}
                icon={<FileText className="w-4 h-4" />}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="نوع الملف"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  options={kindOptions}
                />
                <div>
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الحالة</span>
                  <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-dark-surface border border-light-border dark:border-dark-border w-fit">
                    {(['draft', 'published'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          status === s
                            ? s === 'published'
                              ? 'bg-emerald-500 text-white'
                              : 'bg-gray-200 dark:bg-dark-hover text-gray-700 dark:text-gray-300'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                      >
                        {s === 'published' ? 'منشور' : 'مسودة'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="primary" size="md">{university?.name ?? '—'}</Badge>
              <Badge variant="secondary" size="md">{batch?.label ?? '—'}</Badge>
              <Badge variant="info" size="md">{subject?.name ?? '—'}</Badge>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-light-border dark:border-dark-border">
            <Button variant="ghost" onClick={onBack} iconRight={<ArrowRight className="w-4 h-4" />}>
              رجوع للوحة
            </Button>
            <Button onClick={handleSaveTemplate} disabled={!canSave} icon={<Save className="w-4 h-4" />}>
              حفظ القالب
            </Button>
          </div>
        </Card>
      </motion.div>

      {!canSave && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
          تحتاج اختيار الجامعة والدفعة والمقرر قبل حفظ القالب.
        </div>
      )}

      <PdfTemplateEditor
        template={template}
        fields={fields}
        onFieldsChange={setFields}
        onPdfChange={(pdf) => {
          setPdfName(pdf.pdfName);
          setPdfBytes(pdf.pdfBytes);
        }}
      />
    </div>
  );
}