import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ChevronLeft, Settings2 } from 'lucide-react';
import { Badge, Button, Card, Modal, Tabs } from '@/components/UI';
import type { PortfolioField, PortfolioSection } from '../types';
import { portfolioLabels } from '../labels';
import { portfolioSections } from '../data/mock';
import FieldControl from './FieldControls';

export interface EditorSummary {
  university: string;
  batch: string;
  subject: string;
  kind: string;
}

interface PortfolioEditorProps {
  fields: PortfolioField[];
  summary: EditorSummary;
  dirty: boolean;
  activeTab: 'edit' | 'preview';
  onTabChange: (tab: 'edit' | 'preview') => void;
  onFieldChange: (fieldId: string, value: string) => void;
  onResetAll: () => void;
  onBackToSelection: () => void;
  onContinue: () => void;
}

export function isFieldComplete(field: PortfolioField): boolean {
  if (!field.required) return true;
  return field.value.trim().length > 0;
}

export default function PortfolioEditor({
  fields,
  summary,
  dirty,
  activeTab,
  onTabChange,
  onFieldChange,
  onResetAll,
  onBackToSelection,
  onContinue,
}: PortfolioEditorProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const l = portfolioLabels.editor;

  const sections: PortfolioSection[] = useMemo(() => {
    const present = new Set(fields.map((f) => f.sectionId));
    return portfolioSections.filter((s) => present.has(s.id));
  }, [fields]);

  const missingRequired = useMemo(
    () => fields.filter((f) => !isFieldComplete(f)),
    [fields],
  );

  const tabItems = [
    { id: 'edit' as const, label: l.formTab },
    { id: 'preview' as const, label: l.previewTab },
  ];

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card padding="sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary" size="md">{summary.university}</Badge>
              <Badge variant="secondary" size="md">{summary.batch}</Badge>
              <Badge variant="info" size="md">{summary.subject}</Badge>
              <Badge variant="success" size="md">{summary.kind}</Badge>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {dirty ? (
                <Badge variant="warning" size="sm" dot>
                  {l.unsavedLabel}
                </Badge>
              ) : (
                <Badge variant="success" size="sm" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                  {l.savedLabel}
                </Badge>
              )}

              <button
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                {l.resetAll}
              </button>

              <Button variant="ghost" size="sm" onClick={onBackToSelection} iconRight={<ChevronLeft className="w-4 h-4" />}>
                {l.changeSelection}
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="block lg:hidden">
        <Tabs
          tabs={tabItems}
          activeTab={activeTab}
          onChange={(id) => onTabChange(id as 'edit' | 'preview')}
        />
      </div>

      <div className="space-y-4">
        {missingRequired.length > 0 && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {missingRequired.length} من الحقول الإلزامية غير مكتملة. أكملها قبل التصدير.
            </p>
          </div>
        )}

        {sections.map((section) => (
          <Card key={section.id} padding="md">
            <div className="mb-4">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">{section.title}</h3>
              {section.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{section.description}</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              {fields
                .filter((f) => f.sectionId === section.id)
                .map((f) => (
                  <div
                    key={f.id}
                    className={f.type === 'TEXTAREA' || f.type === 'IMAGE' ? 'sm:col-span-2' : 'col-span-1'}
                  >
                    <FieldControl
                      field={f}
                      error={!isFieldComplete(f)}
                      onChange={(value) => onFieldChange(f.id, value)}
                    />
                  </div>
                ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="ghost" onClick={onBackToSelection} iconRight={<ChevronLeft className="w-4 h-4" />}>
          {l.backToSelection}
        </Button>
        <Button onClick={onContinue} disabled={missingRequired.length > 0}>
          {l.next}
        </Button>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        size="sm"
        title={l.resetAll}
        description={l.resetAllConfirm}
      >
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setConfirmReset(false)}>
            {portfolioLabels.common.cancel}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              onResetAll();
              setConfirmReset(false);
            }}
          >
            {portfolioLabels.common.confirm}
          </Button>
        </div>
      </Modal>
    </div>
  );
}