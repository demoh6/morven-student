import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  destroyPdfDocument,
  getPageLayout,
  loadPdfDocument,
  renderPageToCanvas,
  type PdfDocProxy,
  type PdfRenderTask,
} from '../services/pdfjs';
import type { TemplateFieldDefinition } from '../model';
import { portfolioLabels } from '../labels';

interface PdfPortfolioPreviewProps {
  /** The exact PDF uploaded by the admin (immutable template source). */
  pdfBytes: Uint8Array;
  /** The admin-defined editable regions. */
  fields: TemplateFieldDefinition[];
  /** Current student values keyed by field id. */
  values: Record<string, string>;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;

/**
 * One student value rendered inside its admin-defined PDF region. The white
 * backdrop covers the original placeholder glyphs, mirroring how the apply
 * engine paints over the source region.
 */
function FieldOverlay({
  field,
  value,
  zoom,
}: {
  field: TemplateFieldDefinition;
  value: string;
  zoom: number;
}) {
  if (!value.trim()) return null;

  const style = {
    left: field.x * zoom,
    top: field.y * zoom,
    width: field.width * zoom,
    height: field.height * zoom,
  };

  if (field.type === 'IMAGE') {
    return (
      <div className="absolute overflow-hidden bg-white" style={style}>
        <img src={value} alt={field.label} className="w-full h-full object-cover" />
      </div>
    );
  }

  const fontSize = (field.fontSize ?? Math.max(6, Math.min(18, field.height * 0.7))) * zoom;

  return (
    <div
      className={`absolute overflow-hidden bg-white text-gray-900 ${
        field.type === 'TEXTAREA' ? 'flex items-start' : 'flex items-center'
      }`}
      style={style}
    >
      <span className="w-full px-[2px] whitespace-pre-wrap" style={{ fontSize, lineHeight: 1.2, direction: 'rtl' }}>
        {value}
      </span>
    </div>
  );
}

function PreviewPage({
  doc,
  pageNumber,
  fields,
  values,
  zoom,
}: {
  doc: PdfDocProxy;
  pageNumber: number;
  fields: TemplateFieldDefinition[];
  values: Record<string, string>;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const taskRef = useRef<PdfRenderTask | null>(null);
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    setError(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPageToCanvas(doc, pageNumber, canvas, zoom, (task) => {
      if (cancelled) {
        task.cancel();
        return;
      }
      taskRef.current = task;
    })
      .then((pageLayout) => {
        if (!cancelled) setLayout({ width: pageLayout.width, height: pageLayout.height });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if ((err as { name?: string } | null)?.name === 'RenderingCancelledException') return;
        if (import.meta.env.DEV) console.error('PDF preview page render failed:', err);
        setError(true);
      });
    return () => {
      cancelled = true;
      taskRef.current?.cancel();
      taskRef.current = null;
    };
  }, [doc, pageNumber, zoom]);

  const pageFields = fields.filter((f) => f.page === pageNumber);

  return (
    <div
      className="relative mx-auto bg-white shadow-lg"
      style={
        layout
          ? { width: layout.width * zoom, height: layout.height * zoom }
          : { width: '100%', minHeight: 400 }
      }
    >
      <canvas ref={canvasRef} className={layout ? 'block' : 'hidden'} />

      {!layout && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-red-600 dark:text-red-400">
          {portfolioLabels.studentPreview.loadFailed}
        </div>
      )}

      {layout &&
        pageFields.map((field) => (
          <FieldOverlay key={field.id} field={field} value={values[field.id] ?? ''} zoom={zoom} />
        ))}
    </div>
  );
}

export default function PdfPortfolioPreview({ pdfBytes, fields, values }: PdfPortfolioPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PdfDocProxy | null>(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError(false);
    loadPdfDocument(pdfBytes)
      .then((loaded) => {
        if (cancelled) {
          destroyPdfDocument(loaded);
          return;
        }
        setDoc(loaded);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (import.meta.env.DEV) console.error('PDF preview load failed:', err);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  // Fit the first page to the available preview width (existing zoom system).
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    getPageLayout(doc, 1, 1)
      .then((layout) => {
        if (cancelled) return;
        const width = containerRef.current?.clientWidth ?? 0;
        if (width > 0 && layout.width > 0) {
          setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (width - 16) / layout.width)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(
    () => () => {
      if (doc) destroyPdfDocument(doc);
    },
    [doc],
  );

  if (error) {
    return (
      <div className="py-10 text-center text-xs text-red-600 dark:text-red-400">
        {portfolioLabels.studentPreview.loadFailed}
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
        <Loader2 className="w-6 h-6 mx-auto text-primary-500 animate-spin mb-2" />
        {portfolioLabels.studentPreview.loading}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full space-y-4">
      {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((pageNumber) => (
        <PreviewPage
          key={pageNumber}
          doc={doc}
          pageNumber={pageNumber}
          fields={fields}
          values={values}
          zoom={zoom}
        />
      ))}
    </div>
  );
}
