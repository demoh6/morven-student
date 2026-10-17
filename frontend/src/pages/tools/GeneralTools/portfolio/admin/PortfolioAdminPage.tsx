import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, FolderOpen, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Modal } from '@/components/UI';
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
import { portfolioLabels } from '../labels';
import SelectionGrid from '../steps/SelectionGrid';
import CohortFormModal from './catalog/CohortFormModal';
import CourseFormModal from './catalog/CourseFormModal';
import UniversityFormModal from './catalog/UniversityFormModal';
import { usePortfolioAdminStore, type AdminPortfolioTemplate, type TemplateStatus } from './usePortfolioAdminStore';
import TemplateEditorPanel from './TemplateEditorPanel';

type AdminView = 'dashboard' | 'wizard' | 'editor';
type WizardStep = 'university' | 'batch' | 'subject';
type AddKind = 'university' | 'cohort' | 'course' | null;

function TemplateRow({
  template,
  onEdit,
  onRemove,
}: {
  template: AdminPortfolioTemplate;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const setStatus = usePortfolioAdminStore((s) => s.setStatus);
  const addNotification = useAppStore((s) => s.addNotification);

  const university = getUniversityById(template.universityId);
  const batch = getBatchById(template.batchId);
  const subject = getSubjectById(template.subjectId);

  const toggleStatus = async () => {
    const next: TemplateStatus = template.status === 'published' ? 'draft' : 'published';
    try {
      await setStatus(template.id, next);
      addNotification(next === 'published' ? 'تم نشر القالب' : 'تم تحويل القالب إلى مسودة', 'success');
    } catch (err) {
      addNotification((err as Error).message || 'تعذر تحديث حالة القالب', 'error');
    }
  };

  return (
    <Card padding="sm">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-800 dark:text-white text-sm">{template.name}</h3>
            <Badge variant={template.status === 'published' ? 'success' : 'warning'} size="sm" dot>
              {template.status === 'published' ? 'منشور' : 'مسودة'}
            </Badge>
            <Badge variant="secondary" size="sm">{template.kind}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <Building2 className="w-3 h-3" />{university?.name ?? '—'}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />{batch?.label ?? '—'}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <GraduationCap className="w-3 h-3" />{subject?.name ?? '—'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="info" size="sm">{template.fields.length} حقول</Badge>
          <Button variant="secondary" size="sm" onClick={toggleStatus} disabled={template.fields.length === 0}>
            {template.status === 'published' ? 'إلغاء النشر' : 'نشر'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit} icon={<Pencil className="w-3.5 h-3.5" />}>
            تعديل
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            icon={<Trash2 className="w-3.5 h-3.5" />}
            className="text-red-500 hover:text-red-600"
            aria-label="حذف القالب"
            children=""
          />
        </div>
      </div>
    </Card>
  );
}

export default function PortfolioAdminPage() {
  const { templates, loading, error, load, add, update, remove } = usePortfolioAdminStore();
  const addNotification = useAppStore((s) => s.addNotification);
  const universities = usePortfolioCatalogStore((s) => s.universities);

  const [view, setView] = useState<AdminView>('dashboard');
  const [wizardStep, setWizardStep] = useState<WizardStep>('university');
  const [wizardUniId, setWizardUniId] = useState<string | null>(null);
  const [wizardBatchId, setWizardBatchId] = useState<string | null>(null);
  const [wizardSubjectId, setWizardSubjectId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPortfolioTemplate | null>(null);
  const [addKind, setAddKind] = useState<AddKind>(null);

  useEffect(() => {
    load();
    usePortfolioCatalogStore.getState().load();
  }, [load]);

  const editingTemplate = useMemo(
    () => (editingId ? templates.find((t) => t.id === editingId) ?? null : null),
    [editingId, templates],
  );

  const startCreate = () => {
    setView('wizard');
    setWizardStep('university');
    setWizardUniId(null);
    setWizardBatchId(null);
    setWizardSubjectId(null);
  };

  const startEdit = (id: string) => {
    setEditingId(id);
    setView('editor');
  };

  const handleSave = async (template: AdminPortfolioTemplate) => {
    try {
      if (editingId) {
        await update(editingId, template);
        addNotification('تم تحديث القالب بنجاح', 'success');
      } else {
        await add(template);
        addNotification('تم إنشاء القالب بنجاح', 'success');
      }
      setView('dashboard');
      setEditingId(null);
    } catch (err) {
      addNotification((err as Error).message || 'تعذر حفظ القالب', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.id);
      addNotification('تم حذف القالب', 'success');
      setDeleteTarget(null);
    } catch (err) {
      addNotification((err as Error).message || 'تعذر حذف القالب', 'error');
    }
  };

  const goBack = () => {
    setEditingId(null);
    setView('dashboard');
  };

  const handleQuickAdd = (kind: Exclude<AddKind, null>) => {
    if (kind === 'cohort' && !wizardUniId) return;
    if (kind === 'course' && (!wizardUniId || !wizardBatchId)) return;
    setAddKind(kind);
  };

  const submitQuickAddUniversity = async (payload: UniversityPayload) => {
    const created = await createAdminUniversity(payload);
    await usePortfolioCatalogStore.getState().load(true);
    setWizardUniId(created.id);
    setWizardStep('batch');
    addNotification('تم إضافة الجامعة بنجاح', 'success');
  };

  const submitQuickAddCohort = async (payload: CohortPayload) => {
    const created = await createAdminCohort(payload);
    await usePortfolioCatalogStore.getState().load(true);
    setWizardBatchId(created.id);
    setWizardSubjectId(null);
    setWizardStep('subject');
    addNotification('تم إضافة الدفعة بنجاح', 'success');
  };

  const submitQuickAddCourse = async (payload: CoursePayload) => {
    const created = await createAdminCourse(payload);
    await usePortfolioCatalogStore.getState().load(true);
    setWizardSubjectId(created.id);
    addNotification('تم إضافة المادة بنجاح', 'success');
  };

  const wizardContinueDisabled = () => {
    if (wizardStep === 'university') return !wizardUniId;
    if (wizardStep === 'batch') return !wizardBatchId;
    return !wizardSubjectId;
  };

  let content: React.ReactNode;

  if (view === 'dashboard') {
    content = loading && templates.length === 0 ? (
      <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">جارٍ تحميل القوالب...</div>
    ) : error && templates.length === 0 ? (
      <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">{error}</div>
    ) : templates.length === 0 ? (
      <EmptyState
        icon={<FolderOpen className="w-9 h-9" />}
        title="لا توجد قوالب بعد"
        description="أنشئ أول قالب ملف جامعي لجامعتك."
        action={{ label: 'إنشاء قالب', onClick: startCreate }}
      />
    ) : (
      <div className="space-y-3">
        {templates.map((t) => (
          <TemplateRow
            key={t.id}
            template={t}
            onEdit={() => startEdit(t.id)}
            onRemove={() => setDeleteTarget(t)}
          />
        ))}
      </div>
    );
  }

  if (view === 'wizard') {
    const options =
      wizardStep === 'university'
        ? universities.map((u) => ({
            id: u.id,
            title: u.name,
            subtitle: u.city,
            badge: `${getBatchesForUniversity(u.id).length} دفعات`,
            initials: u.shortCode,
            accent: u.color,
          }))
        : wizardStep === 'batch' && wizardUniId
        ? getBatchesForUniversity(wizardUniId).map((b) => ({
            id: b.id,
            title: b.label,
            subtitle: b.academicYears,
            badge: b.description,
            initials: String(b.order),
            accent: '#64748b',
          }))
        : wizardBatchId
        ? getSubjectsFor(wizardUniId ?? '', wizardBatchId).map((s) => ({
            id: s.id,
            title: s.name,
            subtitle: s.description,
            badge: s.code,
            initials: s.name.charAt(0),
            accent: '#0ea5e9',
          }))
        : [];

    const title =
      wizardStep === 'university' ? 'اختر الجامعة' : wizardStep === 'batch' ? 'اختر الدفعة' : 'اختر المقرر';
    const description =
      wizardStep === 'university'
        ? 'الجامعة التي سيُستخدم فيها القالب.'
        : wizardStep === 'batch'
        ? 'الدُفعة الدراسية المرتبطة بالقالب.'
        : 'المقرر الذي سيرتبط به القالب.';

    content = (
      <SelectionGrid
        options={options}
        title={title}
        description={description}
        searchPlaceholder="ابحث..."
        emptyLabel="لا توجد خيارات مطابقة."
        addNewLabel={
          wizardStep === 'university'
            ? '+ إضافة جامعة جديدة'
            : wizardStep === 'batch'
            ? '+ إضافة دفعة جديدة'
            : '+ إضافة مادة جديدة'
        }
        onAddNew={() =>
          handleQuickAdd(
            wizardStep === 'university' ? 'university' : wizardStep === 'batch' ? 'cohort' : 'course',
          )
        }
        selectedId={
          wizardStep === 'university'
            ? wizardUniId
            : wizardStep === 'batch'
            ? wizardBatchId
            : wizardSubjectId
        }
        onSelect={(id) => {
          if (wizardStep === 'university') {
            setWizardUniId(id);
            setWizardBatchId(null);
            setWizardSubjectId(null);
          } else if (wizardStep === 'batch') {
            setWizardBatchId(id);
            setWizardSubjectId(null);
          } else {
            setWizardSubjectId(id);
          }
        }}
        onContinue={() => {
          if (wizardStep === 'university') setWizardStep('batch');
          else if (wizardStep === 'batch') setWizardStep('subject');
          else if (wizardSubjectId) {
            setEditingId(null);
            setView('editor');
          }
        }}
        continueDisabled={wizardContinueDisabled()}
        onBack={() => {
          if (wizardStep === 'batch') setWizardStep('university');
          else if (wizardStep === 'subject') setWizardStep('batch');
          else startCreate();
        }}
        backLabel={wizardStep === 'university' ? 'إلغاء' : 'رجوع'}
        continueLabel={wizardStep === 'subject' ? 'الانتقال إلى المستند الأصلي' : 'متابعة'}
      />
    );
  }

  if (view === 'editor') {
    content = (
      <TemplateEditorPanel
        existing={editingTemplate}
        selection={editingTemplate ? null : { universityId: wizardUniId ?? '', batchId: wizardBatchId ?? '', subjectId: wizardSubjectId ?? '' }}
        onBack={goBack}
        onSave={handleSave}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5 py-4" dir="rtl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary-500" />
            مدير قوالب الملفات الجامعية
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            ربط حقول المستند الأصلي بالقالب الخاص بكل جامعة ودفعة ومقرر.
          </p>
        </div>
        {view === 'dashboard' && (
          <Button onClick={startCreate} icon={<Plus className="w-4 h-4" />}>
            إنشاء قالب جديد
          </Button>
        )}
      </div>

      {content}

      <UniversityFormModal
        open={addKind === 'university'}
        existing={null}
        onClose={() => setAddKind(null)}
        onSubmit={submitQuickAddUniversity}
      />
      <CohortFormModal
        open={addKind === 'cohort'}
        existing={null}
        universityId={wizardUniId ?? ''}
        onClose={() => setAddKind(null)}
        onSubmit={submitQuickAddCohort}
      />
      <CourseFormModal
        open={addKind === 'course'}
        existing={null}
        universityId={wizardUniId ?? ''}
        cohorts={wizardUniId ? getBatchesForUniversity(wizardUniId) : []}
        defaultBatchId={wizardBatchId}
        onClose={() => setAddKind(null)}
        onSubmit={submitQuickAddCourse}
      />

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title="حذف القالب"
        description={`سيتم حذف «${deleteTarget?.name ?? ''}» نهائياً من القائمة.`}
      >
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>
            {portfolioLabels.common.cancel}
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleDelete}>
            {portfolioLabels.common.delete}
          </Button>
        </div>
      </Modal>
    </div>
  );
}