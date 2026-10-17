import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Plus, Save } from 'lucide-react';
import { Button, Card, Input, Select } from '@/components/UI';
import { useAppStore } from '@/store/useAppStore';
import {
  createAdminCohort,
  createAdminCourse,
  createAdminUniversity,
  type CohortPayload,
  type CoursePayload,
  type UniversityPayload,
} from '../api/portfolioApi';
import {
  getBatchById,
  getBatchesForUniversity,
  getSubjectById,
  getSubjectsFor,
  getUniversityById,
  usePortfolioCatalogStore,
} from '../data/catalog';
import type {
  AdminPortfolioTemplate,
  TemplateStatus,
} from './usePortfolioAdminStore';
import { nextAdminTemplateId, toPdfTemplateDefinition } from './usePortfolioAdminStore';
import type { TemplateFieldDefinition } from '../model';
import CohortFormModal from './catalog/CohortFormModal';
import CourseFormModal from './catalog/CourseFormModal';
import UniversityFormModal from './catalog/UniversityFormModal';
import PdfTemplateEditor from './PdfTemplateEditor';

interface TemplateEditorPanelProps {
  existing: AdminPortfolioTemplate | null;
  selection: { universityId: string; batchId: string; subjectId: string } | null;
  onBack: () => void;
  onSave: (template: AdminPortfolioTemplate) => void;
}

type AddKind = 'university' | 'cohort' | 'course' | null;

const ADD_UNIVERSITY = '__add_university__';
const ADD_COHORT = '__add_cohort__';
const ADD_COURSE = '__add_course__';

const kindOptions = [
  { value: 'مقرر دراسي', label: 'مقرر دراسي' },
  { value: 'مشروع تخرج', label: 'مشروع تخرج' },
  { value: 'تدريب ميداني', label: 'تدريب ميداني' },
  { value: 'ملف إنجاز', label: 'ملف إنجاز' },
];

export default function TemplateEditorPanel({ existing, selection, onBack, onSave }: TemplateEditorPanelProps) {
  const universities = usePortfolioCatalogStore((s) => s.universities);
  usePortfolioCatalogStore((s) => s.batches);
  usePortfolioCatalogStore((s) => s.subjects);
  const addNotification = useAppStore((s) => s.addNotification);

  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState(existing?.kind ?? (selection ? getSubjectById(selection.subjectId)?.portfolioKind ?? 'مقرر دراسي' : 'مقرر دراسي'));
  const [specialty, setSpecialty] = useState(existing?.specialty ?? '');
  const [status, setStatus] = useState<TemplateStatus>(existing?.status ?? 'draft');
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(existing?.pdfBytes ?? null);
  const [pdfName, setPdfName] = useState(existing?.pdfName ?? '');
  const [fields, setFields] = useState<TemplateFieldDefinition[]>(existing?.fields ?? []);

  const [universityId, setUniversityId] = useState(existing?.universityId ?? selection?.universityId ?? '');
  const [batchId, setBatchId] = useState(existing?.batchId ?? selection?.batchId ?? '');
  const [subjectId, setSubjectId] = useState(existing?.subjectId ?? selection?.subjectId ?? '');
  const [addKind, setAddKind] = useState<AddKind>(null);

  const university = getUniversityById(universityId);
  const batch = getBatchById(batchId);
  const subject = getSubjectById(subjectId);

  const canSave = Boolean(universityId && batchId && subjectId && university && batch && subject);

  const universityOptions = [
    ...universities.map((u) => ({ value: u.id, label: u.name })),
    { value: ADD_UNIVERSITY, label: '+ إضافة جامعة جديدة' },
  ];

  const cohortOptions = universityId
    ? [
        ...getBatchesForUniversity(universityId).map((b) => ({ value: b.id, label: `${b.label} — ${b.academicYears}` })),
        { value: ADD_COHORT, label: '+ إضافة دفعة جديدة' },
      ]
    : [{ value: '', label: 'اختر الجامعة أولاً', disabled: true }];

  const courseOptions =
    universityId && batchId
      ? [
          ...getSubjectsFor(universityId, batchId).map((s) => ({ value: s.id, label: s.name })),
          { value: ADD_COURSE, label: '+ إضافة مادة جديدة' },
        ]
      : [{ value: '', label: 'اختر الدفعة أولاً', disabled: true }];

  const handleUniversityChange = (value: string) => {
    if (value === ADD_UNIVERSITY) {
      setAddKind('university');
      return;
    }
    setUniversityId(value);
    setBatchId('');
    setSubjectId('');
  };

  const handleCohortChange = (value: string) => {
    if (value === ADD_COHORT) {
      setAddKind('cohort');
      return;
    }
    setBatchId(value);
    setSubjectId('');
  };

  const handleCourseChange = (value: string) => {
    if (value === ADD_COURSE) {
      setAddKind('course');
      return;
    }
    setSubjectId(value);
  };

  const submitQuickAddUniversity = async (payload: UniversityPayload) => {
    const created = await createAdminUniversity(payload);
    await usePortfolioCatalogStore.getState().load(true);
    setUniversityId(created.id);
    setBatchId('');
    setSubjectId('');
    addNotification('تم إضافة الجامعة بنجاح', 'success');
  };

  const submitQuickAddCohort = async (payload: CohortPayload) => {
    const created = await createAdminCohort(payload);
    await usePortfolioCatalogStore.getState().load(true);
    setBatchId(created.id);
    setSubjectId('');
    addNotification('تم إضافة الدفعة بنجاح', 'success');
  };

  const submitQuickAddCourse = async (payload: CoursePayload) => {
    const created = await createAdminCourse(payload);
    await usePortfolioCatalogStore.getState().load(true);
    setSubjectId(created.id);
    addNotification('تم إضافة المادة بنجاح', 'success');
  };

  const template = useMemo(
    () =>
      toPdfTemplateDefinition({
        id: existing?.id ?? 'pending',
        name: name.trim() || `${subject?.name ?? 'قالب'} — ${kind}`,
        universityId,
        batchId,
        subjectId,
        kind,
        specialty,
        status,
        pdfName,
        pdfBytes,
        fields,
        createdAt: existing?.createdAt ?? Date.now(),
      }),
    [existing, name, kind, specialty, status, universityId, batchId, subjectId, pdfName, pdfBytes, fields, subject],
  );

  const handleSaveTemplate = () => {
    const saved: AdminPortfolioTemplate = {
      id: existing?.id ?? nextAdminTemplateId(),
      name: name.trim() || `${subject?.name ?? 'قالب'} — ${kind}`,
      universityId,
      batchId,
      subjectId,
      kind,
      specialty,
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
                <Input
                  label="التخصص"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="مثال: طب الأطفال، الجراحة العامة"
                />
              </div>
            </div>

            <div className="w-full lg:max-w-sm space-y-3">
              <Select
                label="الجامعة"
                value={universityId}
                onChange={(e) => handleUniversityChange(e.target.value)}
                options={universityOptions}
                placeholder="اختر الجامعة"
              />
              <Select
                label="الدفعة"
                value={batchId}
                onChange={(e) => handleCohortChange(e.target.value)}
                options={cohortOptions}
                placeholder="اختر الدفعة"
                disabled={!universityId}
              />
              <Select
                label="المقرر"
                value={subjectId}
                onChange={(e) => handleCourseChange(e.target.value)}
                options={courseOptions}
                placeholder="اختر المقرر"
                disabled={!batchId}
              />
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

      <UniversityFormModal
        open={addKind === 'university'}
        existing={null}
        onClose={() => setAddKind(null)}
        onSubmit={submitQuickAddUniversity}
      />
      <CohortFormModal
        open={addKind === 'cohort'}
        existing={null}
        universityId={universityId}
        onClose={() => setAddKind(null)}
        onSubmit={submitQuickAddCohort}
      />
      <CourseFormModal
        open={addKind === 'course'}
        existing={null}
        universityId={universityId}
        cohorts={getBatchesForUniversity(universityId)}
        defaultBatchId={batchId}
        onClose={() => setAddKind(null)}
        onSubmit={submitQuickAddCourse}
      />
    </div>
  );
}