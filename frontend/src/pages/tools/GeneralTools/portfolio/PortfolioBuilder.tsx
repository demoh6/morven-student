import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, CalendarDays, Eye, FileDown, GraduationCap, PenLine } from 'lucide-react';
import { Badge, Button, Card } from '@/components/UI';
import type { PortfolioField } from './types';
import { buildPortfolioFields, getBatchById, getBatchesForUniversity, getSubjectById, getSubjectsFor, getTemplateForSubject, getUniversityById, mockUniversities, SECTION } from './data/mock';
import { portfolioLabels } from './labels';
import { usePortfolioAdminStore, type AdminPortfolioTemplate } from './admin/usePortfolioAdminStore';

/**
 * The admin-uploaded PDF is the source of truth. A published admin template is
 * only usable when it has both field definitions and the original PDF bytes;
 * otherwise the Phase 1 mock document remains the fallback.
 */
function findPublishedAdminTemplate(selection: {
  universityId: string;
  batchId: string;
  subjectId: string;
}): AdminPortfolioTemplate | null {
  return (
    usePortfolioAdminStore
      .getState()
      .templates.find(
        (t) =>
          t.status === 'published' &&
          t.universityId === selection.universityId &&
          t.batchId === selection.batchId &&
          t.subjectId === selection.subjectId &&
          t.fields.length > 0 &&
          (t.pdfBytes?.length ?? 0) > 0,
      ) ?? null
  );
}

function buildFieldsFromAdminTemplate(template: AdminPortfolioTemplate): PortfolioField[] {
  return template.fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    value: f.defaultValue,
    defaultValue: f.defaultValue,
    required: f.required,
    placeholder: f.type === 'IMAGE' ? 'أرفق صورة هنا' : `أدخل ${f.label}...`,
    sectionId: SECTION.STUDENT,
  }));
}
import PortfolioLanding from './steps/PortfolioLanding';
import SelectionGrid, { type SelectionOption } from './steps/SelectionGrid';
import PortfolioEditor, { type EditorSummary } from './editor/PortfolioEditor';
import PortfolioPreview from './preview/PortfolioPreview';
import PdfPortfolioPreview from './preview/PdfPortfolioPreview';
import ExportArea from './export/ExportArea';

type FlowStep = 'university' | 'batch' | 'subject' | 'editor' | 'export';

const stepMeta: { id: Exclude<FlowStep, 'export'>; label: string; icon: typeof Building2 }[] = [
  { id: 'university', label: 'الجامعة', icon: Building2 },
  { id: 'batch', label: 'الدفعة', icon: CalendarDays },
  { id: 'subject', label: 'المقرر', icon: GraduationCap },
  { id: 'editor', label: 'التحرير', icon: PenLine },
];

export default function PortfolioBuilder() {
  const [entered, setEntered] = useState(false);
  const [step, setStep] = useState<FlowStep>('university');
  const [universityId, setUniversityId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [fields, setFields] = useState<PortfolioField[]>([]);
  const [adminTemplate, setAdminTemplate] = useState<AdminPortfolioTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  const l = portfolioLabels;

  const selectedUniversity = universityId ? getUniversityById(universityId) : undefined;
  const selectedBatch = batchId ? getBatchById(batchId) : undefined;
  const selectedSubject = subjectId ? getSubjectById(subjectId) : undefined;
  const template = selectedSubject ? getTemplateForSubject(selectedSubject) : undefined;

  const dirty = useMemo(
    () => fields.some((f) => f.value !== f.defaultValue),
    [fields],
  );

  const studentValues = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of fields) map[f.id] = f.value;
    return map;
  }, [fields]);

  const summary: EditorSummary = {
    university: selectedUniversity?.name ?? '',
    batch: `${selectedBatch?.label ?? ''} — ${selectedBatch?.academicYears ?? ''}`,
    subject: selectedSubject?.name ?? '',
    kind: selectedSubject?.portfolioKind ?? '',
  };

  const enterFlow = () => setEntered(true);

  const selectSubject = (id: string) => {
    const subject = getSubjectById(id);
    const uni = selectedUniversity;
    const batch = selectedBatch;
    if (!subject || !uni || !batch) return;
    const realTemplate = findPublishedAdminTemplate({
      universityId: uni.id,
      batchId: batch.id,
      subjectId: subject.id,
    });
    if (realTemplate) {
      setFields(buildFieldsFromAdminTemplate(realTemplate));
    } else {
      setFields(
        buildPortfolioFields({
          universityName: uni.name,
          academicYear: `${batch.label} — ${batch.academicYears}`,
          course: subject.name,
        }),
      );
    }
    setAdminTemplate(realTemplate);
    setSubjectId(id);
    setStep('editor');
    setActiveTab('edit');
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, value } : f)));
  };

  const handleResetAll = () => {
    setFields((prev) => prev.map((f) => ({ ...f, value: f.defaultValue })));
  };

  const handleRestart = () => {
    setUniversityId(null);
    setBatchId(null);
    setSubjectId(null);
    setFields([]);
    setAdminTemplate(null);
    setStep('university');
  };

  const continueDisabled = (): boolean => {
    if (step === 'university') return !universityId;
    if (step === 'batch') return !batchId;
    if (step === 'subject') return !subjectId;
    return false;
  };

  const handleContinue = () => {
    if (step === 'university') setStep('batch');
    else if (step === 'batch') setStep('subject');
    else if (step === 'subject') return;
  };

  const stepIndex = ['university', 'batch', 'subject', 'editor'].indexOf(step);

  if (!entered) {
    return <PortfolioLanding onStart={enterFlow} />;
  }

  let content: React.ReactNode;
  if (step === 'university') {
    content = (
      <SelectionGrid
        options={mockUniversities.map<SelectionOption>((u) => ({
          id: u.id,
          title: u.name,
          subtitle: u.city,
          badge: `${getBatchesForUniversity(u.id).length} دفعات`,
          meta: l.steps.university.established(u.established),
          initials: u.shortCode,
          accent: u.color,
        }))}
        title={l.steps.university.title}
        description={l.steps.university.subtitle}
        searchPlaceholder={l.steps.university.searchPlaceholder}
        emptyLabel={l.steps.university.empty}
        selectedId={universityId}
        onSelect={setUniversityId}
        onContinue={handleContinue}
        continueDisabled={continueDisabled()}
        onBack={() => setEntered(false)}
        backLabel={l.steps.university.back}
        continueLabel={l.steps.university.continue}
      />
    );
  } else if (step === 'batch') {
    const options = (universityId ? getBatchesForUniversity(universityId) : []).map<SelectionOption>((b) => ({
      id: b.id,
      title: b.label,
      subtitle: b.academicYears,
      badge: b.description,
      meta: '',
      initials: String(b.order),
      accent: '#64748b',
    }));
    content = (
      <SelectionGrid
        options={options}
        title={l.steps.batch.title}
        description={l.steps.batch.subtitle}
        searchPlaceholder={l.steps.batch.searchPlaceholder}
        emptyLabel={l.steps.batch.empty}
        selectedId={batchId}
        onSelect={setBatchId}
        onContinue={handleContinue}
        continueDisabled={continueDisabled()}
        onBack={() => setStep('university')}
        backLabel={l.steps.batch.back}
        continueLabel={l.steps.batch.continue}
      />
    );
  } else if (step === 'subject' && universityId) {
    const options = getSubjectsFor(universityId, batchId ?? '').map<SelectionOption>((s) => ({
      id: s.id,
      title: s.name,
      subtitle: s.description,
      badge: s.code,
      badgeVariant: 'info',
      meta: s.portfolioKind,
      initials: s.name.charAt(0),
      accent: '#0ea5e9',
    }));
    content = (
      <SelectionGrid
        options={options}
        title={l.steps.subject.title}
        description={l.steps.subject.subtitle}
        searchPlaceholder={l.steps.subject.searchPlaceholder}
        emptyLabel={l.steps.subject.empty}
        selectedId={subjectId}
        onSelect={(id) => setSubjectId(id)}
        onContinue={() => subjectId && selectSubject(subjectId)}
        continueDisabled={continueDisabled()}
        onBack={() => setStep('batch')}
        backLabel={l.steps.subject.back}
        continueLabel={l.steps.subject.continue}
      />
    );
  } else if (step === 'editor' && selectedSubject && selectedUniversity && selectedBatch && template) {
    content = (
      <div className="flex flex-col lg:flex-row gap-5">
        <motion.div
          className={`w-full lg:w-1/2 ${activeTab === 'edit' ? 'block' : 'hidden lg:block'}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <PortfolioEditor
            fields={fields}
            summary={summary}
            dirty={dirty}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onFieldChange={handleFieldChange}
            onResetAll={handleResetAll}
            onBackToSelection={() => {
              setSubjectId(null);
              setStep('subject');
            }}
            onContinue={() => setStep('export')}
          />
        </motion.div>

        <motion.div
          className={`w-full lg:w-1/2 ${activeTab === 'preview' ? 'block' : 'hidden lg:block'}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="sticky top-4">
            <Card padding="none" className="overflow-hidden">
              <div className="p-3 border-b border-light-border dark:border-dark-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary-500" />
                    {l.editor.previewHeading}
                  </h3>
                  <Badge variant="secondary" size="sm">{l.editor.previewHint}</Badge>
                </div>
              </div>
              <div className="bg-gray-100 dark:bg-gray-900 p-4 overflow-auto" style={{ maxHeight: '82vh' }}>
                {adminTemplate && adminTemplate.pdfBytes ? (
                  <PdfPortfolioPreview
                    pdfBytes={adminTemplate.pdfBytes}
                    fields={adminTemplate.fields}
                    values={studentValues}
                  />
                ) : (
                  <div
                    className="mx-auto shadow-lg bg-white rounded-sm"
                    style={{ transform: 'scale(0.52)', transformOrigin: 'top center', width: '210mm' }}
                  >
                    <PortfolioPreview
                      fields={fields}
                      template={template}
                      university={selectedUniversity}
                      subject={selectedSubject}
                      batch={selectedBatch}
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>
        </motion.div>
      </div>
    );
  } else {
    content = <ExportArea fields={fields} summary={summary} onBackToEditor={() => setStep('editor')} onRestart={handleRestart} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1 text-sm">
        <FileDown className="w-4 h-4 text-primary-500" />
        <span>{l.toolName}</span>
      </div>

      {step !== 'export' ? (
        <div className="flex items-center gap-1">
          {stepMeta.map((s, i) => {
            const Icon = s.icon;
            const current = stepIndex === i;
            const done = stepIndex > i;
            return (
              <div key={s.id} className="flex items-center flex-1 gap-1">
                <div className="flex flex-col items-center gap-1.5 flex-1">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                      current
                        ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30'
                        : done
                        ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400'
                        : 'bg-gray-100 text-gray-400 dark:bg-dark-surface dark:text-gray-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[11px] font-medium ${current ? 'text-primary-600 dark:text-primary-400' : done ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>
                    {s.label}
                  </span>
                </div>
                {i < stepMeta.length - 1 && (
                  <div className={`h-0.5 flex-1 rounded-full ${done ? 'bg-primary-300 dark:bg-primary-800' : 'bg-gray-200 dark:bg-dark-border'}`} />
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {content}
    </div>
  );
}