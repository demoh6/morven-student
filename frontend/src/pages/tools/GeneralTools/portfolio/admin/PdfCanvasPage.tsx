import { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, MousePointerClick, Move, PenLine, Trash2 } from 'lucide-react';
import { clampRect, type PdfRect, type PdfTextItem, type TemplateFieldDefinition } from '../model';
import {
  getPageTextItems,
  renderPageToCanvas,
  type PdfDocProxy,
  type PdfRenderTask,
} from '../services/pdfjs';

export type EditorTool = 'cursor' | 'text' | 'rect';

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const HANDLE_STYLE: Record<ResizeDir, string> = {
  n: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-n-resize',
  s: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-s-resize',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-e-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-w-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-ne-resize',
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-se-resize',
  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-sw-resize',
};

interface PdfCanvasPageProps {
  doc: PdfDocProxy;
  pageNumber: number;
  zoom: number;
  fields: TemplateFieldDefinition[];
  selectedFieldId: string | null;
  tool: EditorTool;
  extraPending: PdfRect | null;
  onSelectField: (id: string | null) => void;
  onPendingRect: (rect: PdfRect | null) => void;
  onNewSelection: (selection: { page: number; rect: PdfRect; text: string } | null) => void;
  onUpdateField: (id: string, patch: Partial<TemplateFieldDefinition>) => void;
  onDeleteField: (id: string) => void;
}

export default function PdfCanvasPage({
  doc,
  pageNumber,
  zoom,
  fields,
  selectedFieldId,
  tool,
  extraPending,
  onSelectField,
  onPendingRect,
  onNewSelection,
  onUpdateField,
  onDeleteField,
}: PdfCanvasPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const [textItems, setTextItems] = useState<PdfTextItem[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);

  const pageFields = fields.filter((f) => f.page === pageNumber);

  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    setTextItems([]);
    setRenderError(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    Promise.all([
      renderPageToCanvas(doc, pageNumber, canvas, zoom, (task) => {
        if (cancelled) {
          task.cancel();
          return;
        }
        renderTaskRef.current = task;
      }),
      getPageTextItems(doc, pageNumber),
    ])
      .then(([pageLayout, items]) => {
        if (cancelled) return;
        setLayout({ width: pageLayout.width, height: pageLayout.height });
        setTextItems(items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = (err as { name?: string } | null)?.name;
        if (name === 'RenderingCancelledException') return;
        if (import.meta.env.DEV) console.error('PDF page render failed:', err);
        setRenderError('تعذر عرض صفحة PDF. حاول تحديث الصفحة أو إعادة رفع الملف.');
      });
    return () => {
      cancelled = true;
      // Cancel any in-flight render so it cannot hold the canvas and leave the
      // viewer stuck on the loading state (pdf.js frees the canvas on cancel).
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [doc, pageNumber, zoom]);

  // ── Pointer helpers (screen → CSS → PDF points) ─────────────────────
  const toCssPoint = useCallback((clientX: number, clientY: number) => {
    const box = boxRef.current;
    if (!box) return null;
    const rect = box.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const toPdfPoint = useCallback(
    (clientX: number, clientY: number) => {
      const css = toCssPoint(clientX, clientY);
      return css ? { x: css.x / zoom, y: css.y / zoom } : null;
    },
    [toCssPoint, zoom],
  );

  // ── Rect draw mode ───────────────────────────────────────────────────
  const drawRef = useRef<{ start: { x: number; y: number } } | null>(null);

  const handleRectPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const point = toPdfPoint(e.clientX, e.clientY);
    if (!point) return;
    drawRef.current = { start: point };
    onPendingRect(null);
    onNewSelection(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleRectPointerMove = (e: React.PointerEvent) => {
    const drag = drawRef.current;
    if (!drag) return;
    const point = toPdfPoint(e.clientX, e.clientY);
    if (!point) return;
    const rect: PdfRect = {
      x: Math.min(drag.start.x, point.x),
      y: Math.min(drag.start.y, point.y),
      width: Math.abs(point.x - drag.start.x),
      height: Math.abs(point.y - drag.start.y),
    };
    onPendingRect(rect);
  };

  const handleRectPointerUp = (e: React.PointerEvent) => {
    const drag = drawRef.current;
    drawRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const point = toPdfPoint(e.clientX, e.clientY);
    if (!drag || !point) return;
    const rect: PdfRect = {
      x: Math.min(drag.start.x, point.x),
      y: Math.min(drag.start.y, point.y),
      width: Math.abs(point.x - drag.start.x),
      height: Math.abs(point.y - drag.start.y),
    };
    if (rect.width < 2 || rect.height < 2) {
      onPendingRect(null);
      return;
    }
    const clamped = layout ? clampRect(rect, layout.width, layout.height) : rect;
    onNewSelection({ page: pageNumber, rect: clamped, text: '' });
    onPendingRect(null);
  };

  // ── Text-selection mode (DOM selection over invisible text layer) ────
  const handlePageMouseUp = () => {
    if (tool !== 'text') return;
    const box = boxRef.current;
    if (!box || !layout) {
      onNewSelection(null);
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      onNewSelection(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const selectedText = range.toString().replace(/\s+/g, ' ').trim();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;
    for (const clientRect of Array.from(range.getClientRects())) {
      const p1 = toCssPoint(clientRect.left, clientRect.top);
      const p2 = toCssPoint(clientRect.right, clientRect.bottom);
      if (!p1 || !p2) continue;
      minX = Math.min(minX, p1.x, p2.x);
      minY = Math.min(minY, p1.y, p2.y);
      maxX = Math.max(maxX, p1.x, p2.x);
      maxY = Math.max(maxY, p1.y, p2.y);
      found = true;
    }
    if (!found || selectedText.length === 0) {
      onNewSelection(null);
      return;
    }
    const rect: PdfRect = {
      x: minX / zoom,
      y: minY / zoom,
      width: (maxX - minX) / zoom,
      height: (maxY - minY) / zoom,
    };
    const clamped = layout ? clampRect(rect, layout.width, layout.height) : rect;
    onNewSelection({ page: pageNumber, rect: clamped, text: selectedText });
  };

  // ── Field drag / resize (cursor mode) ────────────────────────────────
  const dragState = useRef<{
    mode: 'move' | ResizeDir;
    start: { x: number; y: number };
    rect: PdfRect;
  } | null>(null);

  const persistDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragState.current;
      if (!drag || !layout) return;
      const point = toPdfPoint(clientX, clientY);
      if (!point) return;
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      let next: PdfRect = { ...drag.rect };
      if (drag.mode === 'move') {
        next = { ...next, x: next.x + dx, y: next.y + dy };
      } else if (drag.mode.includes('e')) {
        next.width = next.width + dx;
      } else if (drag.mode.includes('w')) {
        next.x = next.x + dx;
        next.width = next.width - dx;
      }
      if (drag.mode.includes('s')) {
        next.height = next.height + dy;
      } else if (drag.mode.includes('n')) {
        next.y = next.y + dy;
        next.height = next.height - dy;
      }
      const min = 2;
      if (next.width < min) next.width = min;
      if (next.height < min) next.height = min;
      next = clampRect(next, layout.width, layout.height);
      onUpdateField(selectedFieldId ?? '', next);
    },
    [layout, onUpdateField, selectedFieldId, toPdfPoint],
  );

  const handleFieldPointerDown = (e: React.PointerEvent, mode: 'move' | ResizeDir) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const selected = pageFields.find((f) => f.id === selectedFieldId);
    if (!selected) return;
    const point = toPdfPoint(e.clientX, e.clientY);
    if (!point) return;
    dragState.current = { mode, start: point, rect: { x: selected.x, y: selected.y, width: selected.width, height: selected.height } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleFieldPointerMove = (e: React.PointerEvent) => {
    if (dragState.current) persistDrag(e.clientX, e.clientY);
  };

  const handleFieldPointerUp = (e: React.PointerEvent) => {
    dragState.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    if (tool === 'cursor') {
      window.getSelection()?.removeAllRanges();
    }
  }, [tool]);

  const localCss = layout ? { width: layout.width * zoom, height: layout.height * zoom } : null;

  const fieldLabel =
    tool === 'cursor' ? 'تحرير الحقل' : tool === 'text' ? 'تحديد نص' : 'رسم منطقة';

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={boxRef}
        className={`relative ${
          layout
            ? 'bg-white shadow-2xl rounded-sm overflow-hidden'
            : 'bg-white/60 dark:bg-white/5 rounded-xl border border-dashed border-gray-300 dark:border-dark-border flex items-center justify-center'
        }`}
        style={{ ...(localCss ?? { width: '100%', height: 440 }), userSelect: tool === 'text' ? 'text' : 'none' }}
        onMouseUp={handlePageMouseUp}
      >
        {/* The canvas must stay mounted while loading: the render effect draws
            into it before the page layout (and thus the viewer) is revealed. */}
        <canvas ref={canvasRef} className={layout ? 'block' : 'hidden'} />

        {!layout && !renderError && (
          <span className="text-xs text-gray-400 dark:text-gray-500">جارٍ تحميل الصفحة...</span>
        )}

        {renderError && (
          <span className="px-4 text-center text-xs text-red-600 dark:text-red-400">{renderError}</span>
        )}

        {/* Invisible selectable text layer (text tool only) */}
        {layout && tool === 'text' && (
          <div className="absolute inset-0" style={{ color: 'transparent' }}>
            {textItems.map((item) => (
              <span
                key={item.id}
                className="absolute whitespace-pre"
                style={{
                  left: item.x * zoom,
                  top: item.y * zoom,
                  width: item.width * zoom,
                  height: item.height * zoom,
                  fontSize: item.height * zoom,
                  lineHeight: 1,
                }}
              >
                {item.str}
              </span>
            ))}
          </div>
        )}

        {/* Live selection rectangle */}
        {layout && extraPending && (
          <div
            className="absolute border-2 border-primary-500 bg-primary-500/10 pointer-events-none"
            style={{ left: extraPending.x * zoom, top: extraPending.y * zoom, width: extraPending.width * zoom, height: extraPending.height * zoom }}
          />
        )}

        {/* Field overlays */}
        {layout && pageFields.map((field) => {
          const selected = field.id === selectedFieldId;
          const interactive = tool === 'cursor';
          return (
            <div
              key={field.id}
              onPointerDown={(e) => {
                if (!interactive) return;
                onSelectField(field.id);
                handleFieldPointerDown(e, 'move');
              }}
              onPointerMove={handleFieldPointerMove}
              onPointerUp={handleFieldPointerUp}
              onClick={(e) => {
                if (!interactive) return;
                e.stopPropagation();
                onSelectField(field.id);
              }}
              className={`absolute rounded border-[1.5px] transition-colors ${
                selected
                  ? 'border-primary-600 bg-primary-500/15 ring-2 ring-primary-500/30'
                  : 'border-emerald-500/80 bg-emerald-400/10 hover:border-emerald-600'
              } ${interactive ? 'cursor-move' : 'pointer-events-none'}`}
              style={{ left: field.x * zoom, top: field.y * zoom, width: field.width * zoom, height: field.height * zoom }}
              title={interactive ? `${field.label} — اسحب للتحريك` : undefined}
            >
              {interactive && (
                <span
                  className={`absolute top-0 right-1.5 -translate-y-1/2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] font-semibold whitespace-nowrap ${
                    selected ? 'bg-primary-600 text-white' : 'bg-emerald-500 text-white'
                  }`}
                >
                  {field.type === 'IMAGE' ? <Fingerprint className="w-2.5 h-2.5" /> : null}
                  {field.label}
                </span>
              )}

              {selected && interactive && (
                <>
                  {(
                    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeDir[]
                  ).map((dir) => (
                    <span
                      key={dir}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        handleFieldPointerDown(e, dir);
                      }}
                      onPointerMove={handleFieldPointerMove}
                      onPointerUp={handleFieldPointerUp}
                      className={`absolute w-3 h-3 bg-white border-2 border-primary-600 rounded-full ${HANDLE_STYLE[dir]}`}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteField(field.id);
                    }}
                    className="absolute -top-2.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-red-500 text-white text-[9px] font-semibold hover:bg-red-600"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* Rect drawing surface */}
        {layout && tool === 'rect' && (
          <div
            className="absolute inset-0 cursor-crosshair z-10"
            style={{ touchAction: 'none' }}
            onPointerDown={handleRectPointerDown}
            onPointerMove={handleRectPointerMove}
            onPointerUp={handleRectPointerUp}
          />
        )}
      </div>

      {layout && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            {tool === 'cursor' ? <MousePointerClick className="w-3.5 h-3.5" /> : tool === 'text' ? <PenLine className="w-3.5 h-3.5" /> : <Move className="w-3.5 h-3.5" />}
            {fieldLabel}
          </span>
          {tool === 'text' && textItems.length === 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
              هذه الصفحة لا تحتوي نصاً قابلاً للتحديد
            </span>
          )}
        </div>
      )}
    </div>
  );
}