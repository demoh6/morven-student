import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, File, FileText, RefreshCw, XCircle } from 'lucide-react';
import { Badge, Button, Card, Modal, ProgressBar } from '@/components/UI';
import type { PortfolioField } from '../types';
import type { EditorSummary } from '../editor/PortfolioEditor';
import { isFieldComplete } from '../editor/PortfolioEditor';
import { portfolioLabels } from '../labels';

interface ExportAreaProps {
  fields: PortfolioField[];
  summary: EditorSummary;
  onBackToEditor: () => void;
  onRestart: () => void;
}

export default function ExportArea({ fields, summary, onBackToEditor, onRestart }: ExportAreaProps) {
  const l = portfolioLabels.export;
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [openFormat, setOpenFormat] = useState<'word' | 'pdf' | null>(null);

  const requiredFields = useMemo(() => fields.filter((f) => f.required), [fields]);
  const completed = useMemo(() => requiredFields.filter((f) => isFieldComplete(f)).length, [requiredFields]);
  const allComplete = completed === requiredFields.length;
  const percent = requiredFields.length > 0 ? (completed / requiredFields.length) * 100 : 100;

  const openMock = (format: 'word' | 'pdf') => {
    setOpenFormat(format);
    setShowComingSoon(true);
  };

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card padding="lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">{l.title}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{l.subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-6">
            <Badge variant="primary" size="md">{summary.university}</Badge>
            <Badge variant="secondary" size="md">{summary.batch}</Badge>
            <Badge variant="info" size="md">{summary.subject}</Badge>
            <Badge variant="success" size="md">{summary.kind}</Badge>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{l.completion}</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {l.completedCount(completed, requiredFields.length)}
              </span>
            </div>
            <ProgressBar value={percent} color={allComplete ? 'success' : 'primary'} size="md" />
          </div>

          {allComplete ? (
            <div className="flex items-start gap-2.5 p-3 mb-6 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400">اكتملت جميع الحقول الإلزامية. مستندك جاهز للتصدير.</p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 mb-6 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <XCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {l.missingRequired(requiredFields.length - completed)}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => openMock('word')}
              className="group rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 p-5 transition-colors text-center"
            >
              <div className="text-3xl mb-2">📄</div>
              <p className="font-semibold text-gray-800 dark:text-white text-sm">{l.wordButton}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">توليد مستند قابل للتعديل</p>
            </button>
            <button
              onClick={() => openMock('pdf')}
              className="group rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 p-5 transition-colors text-center"
            >
              <div className="text-3xl mb-2">📕</div>
              <p className="font-semibold text-gray-800 dark:text-white text-sm">{l.pdfButton}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">نسخة للطباعة بتنسيق ثابت</p>
            </button>
          </div>

          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-4 text-center leading-relaxed">{l.banknote}</p>
        </Card>
      </motion.div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBackToEditor}>
          {l.backToEditor}
        </Button>
        <Button variant="secondary" onClick={onRestart} icon={<RefreshCw className="w-4 h-4" />}>
          {l.restart}
        </Button>
      </div>

      <Modal
        open={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        size="md"
        title={l.comingSoonTitle}
        description={l.comingSoonBody}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-dark-surface rounded-xl px-3 py-2.5 border border-light-border dark:border-dark-border">
            <File className="w-4 h-4 shrink-0" />
            {openFormat === 'word' ? l.wordButton : l.pdfButton} — قيد التطوير (المرحلة القادمة)
          </div>
          <Button onClick={() => setShowComingSoon(false)} className="w-full">
            {portfolioLabels.common.confirm}
          </Button>
        </div>
      </Modal>
    </div>
  );
}