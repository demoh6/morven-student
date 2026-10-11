import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Maximize, Minus, Move, PenLine, Plus, Save, Undo2, Upload, X, ZoomIn } from 'lucide-react';
import { Badge, Button } from '@/components/UI';
import { saveAs } from 'file-saver';
import type { PdfRect, PdfTemplateDefinition, TemplateFieldDefinition } from '../model';
import { bytesToDataUrl, generateFieldId, toSerializablePdfTemplate } from '../model';
import { portfolioLabels } from '../labels';
import {
  destroyPdfDocument,
  getPageLayout,
  isPageScanned,
  loadPdfDocument,
  type PdfDocProxy,
} from '../services/pdfjs';
import { applyPdfFields, outputToBlob } from '../services/apply';
import PdfCanvasPage, { type EditorTool } from './PdfCanvasPage';
import FieldConfigPanel from './FieldConfigPanel';

interface PdfTemplateEditorProps {
  template: PdfTemplateDefinition;
  fields: TemplateFieldDefinition[];
  onFieldsChange: (fields: TemplateFieldDefinition[]) => void;
  onPdfChange: (pdf: { pdfBytes: Uint8Array | null; pdfName: string }) => void;
}

type ApplyStatus = 'idle' | 'running' | 'done';

const fitClamp = (value: number) => Math.max(0.4, Math.min(2, value));

export default function PdfTemplateEditor({
  template,
  fields,
  onFieldsChange,
  onPdfChange,
}: PdfTemplateEditorProps) {
  const l = portfolioLabels.pdfEditor;

  const [doc, setDoc] = useState<PdfDocProxy | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [renderZoom, setRenderZoom] = useState(1);
  const [tool, setTool] = useState<EditorTool>('cursor');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ page: number; rect: PdfRect; text: string } | null>(null);
  const [pendingRect, setPendingRect] = useState<PdfRect | null>(null);
  const [scannedPages, setScannedPages] = useState<Set<number>>(new Set());
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>('idle');
  const [applySummary, setApplySummary] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef<PdfDocProxy | null>(null);
  const historyRef = useRef<TemplateFieldDefinition[][]>([]);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyDepth, setHistoryDepth] = useState(0);
  const hasPdf = template.pdfBytes.length > 0;

  // ── Document lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (!hasPdf) {
      setDoc(null);
      setPageCount(0);
      setPageNumber(1);
      setScannedPages(new Set());
      return;
    }
    let cancelled = false;
    setUploading(true);
    setDocError(null);
    loadPdfDocument(template.pdfBytes)
      .then((loaded) => {
        if (cancelled) {
          destroyPdfDocument(loaded);
          return;
        }
        docRef.current = loaded;
        setDoc(loaded);
        setPageCount(loaded.numPages);
        setPageNumber(1);
      })
      .catch(() => {
        if (!cancelled) setDocError(l.loadFailed);
      })
      .finally(() => {
        if (!cancelled) setUploading(false);
      });
    return () => {
      cancelled = true;
      // Release the previous document so replacing the PDF does not leak workers.
      if (docRef.current) {
        destroyPdfDocument(docRef.current);
        docRef.current = null;
      }
    };
  }, [template.pdfBytes, hasPdf]);

  // Background scan for image-only pages.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const scan = async () => {
      const scanned = new Set<number>();
      try {
        for (let p = 1; p <= doc.numPages; p += 1) {
          if (cancelled) return;
          if (await isPageScanned(doc, p)) scanned.add(p);
        }
      } catch {
        return;
      }
      if (!cancelled) setScannedPages(scanned);
    };
    void scan();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => () => {
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
  }, []);

  // Debounced zoom → re-render canvas.
  useEffect(() => {
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => setRenderZoom(zoom), 120);
    return () => {
      if (zoomTimer.current) clearTimeout(zoomTimer.current);
    };
  }, [zoom]);

  // ── Upload handling ─────────────────────────────────────────────────
  const handleFile = async (file: File | null) => {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setDocError(l.invalidFile);
      return;
    }
    setUploading(true);
    setDocError(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    onPdfChange({ pdfBytes: bytes, pdfName: file.name });
  };

  // ── Navigation / zoom ───────────────────────────────────────────────
  const goTo = (page: number) => setPageNumber(Math.max(1, Math.min(page, pageCount || 1)));

  const fitToWidth = async () => {
    if (!doc) return;
    const el = viewportRef.current;
    if (!el) return;
    const layout = await getPageLayout(doc, pageNumber, 1);
    const available = el.clientWidth - 24;
    setZoom(fitClamp(available / (layout.width || 1)));
  };

  const changeZoom = (delta: number) => setZoom((z) => fitClamp(z + delta));

  // ── Selection / field ops ───────────────────────────────────────────
  const clearSelection = useCallback(() => {
    setPendingSelection(null);
    setPendingRect(null);
    setSelectedFieldId(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleNewSelection = (sel: { page: number; rect: PdfRect; text: string } | null) => {
    if (!sel) {
      setPendingSelection(null);
      return;
    }
    setSelectedFieldId(null);
    setPendingSelection(sel);
    setTool('cursor');
  };

  const pushHistory = (snapshot: TemplateFieldDefinition[]) => {
    historyRef.current = [...historyRef.current.slice(-19), snapshot];
    setHistoryDepth(historyRef.current.length);
  };

  const handleUndo = () => {
    const previous = historyRef.current.pop();
    setHistoryDepth(historyRef.current.length);
    if (!previous) return;
    onFieldsChange(previous);
    clearSelection();
  };

  const handleSaveField = (definition: TemplateFieldDefinition) => {
    pushHistory(fields);
    if (definition.id) {
      onFieldsChange(fields.map((f) => (f.id === definition.id ? definition : f)));
      setSelectedFieldId(null);
    } else {
      const id = generateFieldId();
      onFieldsChange([
        ...fields,
        { ...definition, id, page: pendingSelection?.page ?? 1, x: pendingSelection?.rect.x ?? 0, y: pendingSelection?.rect.y ?? 0, width: pendingSelection?.rect.width ?? 0, height: pendingSelection?.rect.height ?? 0 },
      ]);
    }
    clearSelection();
  };

  const handleDeleteField = (id: string) => {
    pushHistory(fields);
    onFieldsChange(fields.filter((f) => f.id !== id));
    setSelectedFieldId(null);
  };

  const handleUpdateField = (id: string, patch: Partial<TemplateFieldDefinition>) => {
    // Coalesce a whole drag/resize gesture into a single undo step.
    if (!updateTimer.current) {
      pushHistory(fields);
      updateTimer.current = setTimeout(() => {
        updateTimer.current = null;
      }, 600);
    }
    onFieldsChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  // ── Apply / serialize (PoC) ─────────────────────────────────────────
  const handleApply = async () => {
    if (!hasPdf) return;
    setApplyStatus('running');
    setApplySummary(null);
    const values: Record<string, string> = {};
    for (const f of fields) values[f.id] = f.defaultValue;
    const output = await applyPdfFields({ ...template, fields }, values);
    const applied = output.results.filter((r) => r.ok).length;
    const skipped = output.results.length - applied;
    setApplySummary(l.applyResults(applied, skipped));
    setApplyStatus('done');
    saveAs(outputToBlob(output.bytes), (template.pdfName || 'portfolio')?.replace(/\.pdf$/i, '') + '-filled.pdf');
  };

  const handleExportJson = () => {
    const serializable = toSerializablePdfTemplate({ ...template, fields });
    const blob = new Blob([JSON.stringify(serializable, null, 2)], { type: 'application/json' });
    saveAs(blob, `${template.name || 'template'}.template.json`);
  };

  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;

  const currentPageScanned = scannedPages.has(pageNumber);

  return (
    <div className="space-y-4">
      {/* Header // upload + meta */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <FileText className="w-4 h-4 text-primary-500" />
          <span className="font-medium">{template.pdfName || 'بدون ملف'}</span>
          <Badge variant={hasPdf ? 'success' : 'warning'} size="sm">
            {hasPdf ? `${pageCount} صفحات` : 'بانتظار الرفع'}
          </Badge>
          <Badge variant="secondary" size="sm">{l.fieldsCount(fields.length)}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-xl px-3 py-1.5 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
              {hasPdf ? <Move className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
              {hasPdf ? l.replace : l.uploadButton}
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportJson}
            icon={<Save className="w-3 h-3" />}
            disabled={!hasPdf}
          >
            {l.jsonLabel}
          </Button>
        </div>
      </div>

      {/* Upload / loading / error states */}
      {docError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
          {docError}
          <button type="button" className="ml-2 underline" onClick={() => setDocError(null)}>إغلاق</button>
        </div>
      )}

      {!hasPdf && !uploading && (
        <label className="block rounded-2xl border-2 border-dashed border-gray-300 dark:border-dark-border bg-white/60 dark:bg-white/5 hover:border-primary-400 transition-colors cursor-pointer p-8 text-center">
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <Upload className="w-8 h-8 mx-auto text-primary-500 mb-2" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{l.uploadTitle}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-md mx-auto leading-relaxed">{l.uploadHint}</p>
          <span className="inline-block mt-3 text-xs font-medium text-primary-600 dark:text-primary-400">{l.uploadButton}</span>
        </label>
      )}

      {uploading && (
        <div className="rounded-2xl border border-light-border dark:border-dark-border bg-white/60 dark:bg-white/5 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="w-6 h-6 mx-auto text-primary-500 animate-spin mb-2" />
          {l.uploading}
        </div>
      )}

      {doc && viewportRef && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
          {/* Viewer */}
          <div className="min-w-0">
            <div className="rounded-2xl bg-gray-100 dark:bg-gray-900 p-3">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: 'cursor' as const, label: l.toolCursor, icon: Move },
                      { id: 'text' as const, label: l.toolText, icon: PenLine },
                      { id: 'rect' as const, label: l.toolRect, icon: Plus },
                    ]
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setTool(id);
                        if (id !== 'cursor') clearSelection();
                      }}
                      disabled={id !== 'cursor' && currentPageScanned && id === 'text'}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        tool === id
                          ? 'bg-primary-600 text-white'
                          : 'bg-white text-gray-600 dark:bg-dark-surface dark:text-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                  {pendingSelection && (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100"
                    >
                      <X className="w-3.5 h-3.5" />
                      {l.cancelSelection}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={historyDepth === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white text-gray-600 dark:bg-dark-surface dark:text-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    {l.undo}
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => goTo(pageNumber - 1)}
                    disabled={pageNumber <= 1}
                    className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-dark-surface text-gray-600 dark:text-gray-300 text-xs font-medium disabled:opacity-40 hover:bg-gray-50"
                  >
                    السابق
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {l.page}{' '}
                    <input
                      type="number"
                      className="w-12 text-center bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg py-1 text-xs"
                      min={1}
                      max={pageCount}
                      value={pageNumber}
                      onChange={(e) => goTo(Number(e.target.value) || 1)}
                    />
                    {' '}{l.of} {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => goTo(pageNumber + 1)}
                    disabled={pageNumber >= pageCount}
                    className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-dark-surface text-gray-600 dark:text-gray-300 text-xs font-medium disabled:opacity-40 hover:bg-gray-50"
                  >
                    التالي
                  </button>

                  <span className="mx-1 w-px h-5 bg-gray-200 dark:bg-dark-border" />

                  <button
                    type="button"
                    onClick={() => changeZoom(-0.1)}
                    title={l.zoomOut}
                    className="px-2 py-1.5 rounded-lg bg-white dark:bg-dark-surface text-gray-600 dark:text-gray-300 hover:bg-gray-50"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-center">{Math.round(renderZoom * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => setZoom(1)}
                    title={l.originalSize}
                    className="px-2 py-1.5 rounded-lg bg-white dark:bg-dark-surface text-gray-600 dark:text-gray-300 hover:bg-gray-50"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeZoom(0.1)}
                    title={l.zoomIn}
                    className="px-2 py-1.5 rounded-lg bg-white dark:bg-dark-surface text-gray-600 dark:text-gray-300 hover:bg-gray-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void fitToWidth()}
                    title={l.fit}
                    className="px-2 py-1.5 rounded-lg bg-white dark:bg-dark-surface text-gray-600 dark:text-gray-300 hover:bg-gray-50"
                  >
                    <Maximize className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {currentPageScanned && (
                <div className="mb-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400">
                  {l.scannedNotice}
                </div>
              )}

              <div ref={viewportRef} className="min-h-[420px] overflow-auto rounded-xl p-3">
                <PdfCanvasPage
                  doc={doc}
                  pageNumber={pageNumber}
                  zoom={renderZoom}
                  fields={fields}
                  selectedFieldId={selectedFieldId}
                  tool={tool}
                  extraPending={pendingRect}
                  onSelectField={(id) => {
                    setSelectedFieldId(id);
                    setPendingSelection(null);
                  }}
                  onPendingRect={setPendingRect}
                  onNewSelection={handleNewSelection}
                  onUpdateField={handleUpdateField}
                  onDeleteField={handleDeleteField}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  الإحداثيات المحفوظة بنقاط PDF (بغض النظر عن التكبير وحجم الشاشة).
                </span>
                <div className="flex items-center gap-2">
                  {scannedPages.size > 0 && (
                    <Badge variant="warning" size="sm">{l.scannedPagesHint(scannedPages.size)}</Badge>
                  )}
                  <Button
                    size="sm"
                    onClick={handleApply}
                    disabled={!hasPdf || applyStatus === 'running'}
                    icon={applyStatus === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  >
                    {applyStatus === 'running' ? l.applyRunning : l.applyLabel}
                  </Button>
                </div>
              </div>
              {applySummary && (
                <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">{applySummary}</div>
              )}
            </div>
          </div>

          {/* Config panel */}
          <div className="lg:sticky lg:top-4 self-start w-full">
            <FieldConfigPanel
              selectedField={selectedField}
              pending={pendingSelection}
              onSave={handleSaveField}
              onDelete={handleDeleteField}
              onCancel={clearSelection}
            />
          </div>
        </div>
      )}
    </div>
  );
}