// Thin wrapper around pdf.js: loading, page rendering and text extraction.
// Mirrors the worker-setup convention already used in src/utils/file.ts so the
// library never runs twice and coordinates stay in PDF point space.

import * as pdfjsLib from 'pdfjs-dist';
import type { PdfRect, PdfTextItem } from '../model';

// In the browser the worker is bundled by Vite. Under Vitest the test setup
// points workerSrc at the real worker file on disk, so only set a default when
// nothing has been configured yet.
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString();
}

export type PdfDocProxy = pdfjsLib.PDFDocumentProxy;
export type PdfRenderTask = pdfjsLib.RenderTask;

export interface PageLayout {
  /** Page size in PDF points. */
  width: number;
  height: number;
  /** CSS size of the rendered canvas at the given zoom. */
  cssWidth: number;
  cssHeight: number;
}

export function loadPdfDocument(
  data: ArrayBuffer | Uint8Array,
): Promise<PdfDocProxy> {
  // pdf.js transfers (detaches) the underlying buffer to its worker, which
  // would empty the caller's bytes. Copy first so the original PDF stays the
  // untouched source of truth for later rendering/apply/export.
  const safe = data instanceof Uint8Array ? data.slice() : data.slice(0);
  return pdfjsLib.getDocument({ data: safe }).promise;
}

export function destroyPdfDocument(doc: PdfDocProxy): void {
  void doc.destroy();
}

/** 1-based pageNumber like pdf.js itself. */
async function getPage(doc: PdfDocProxy, pageNumber: number) {
  return doc.getPage(pageNumber);
}

export async function getPageLayout(
  doc: PdfDocProxy,
  pageNumber: number,
  zoom: number,
): Promise<PageLayout> {
  const page = await getPage(doc, pageNumber);
  const base = page.getViewport({ scale: 1 });
  return {
    width: base.width,
    height: base.height,
    cssWidth: base.width * zoom,
    cssHeight: base.height * zoom,
  };
}

/**
 * Render a page into a canvas. Canvas backing store uses devicePixelRatio so
 * the page stays crisp while CSS dimensions equal (page points × zoom), which
 * keeps the mapping screen→CSS→PDF points independent of zoom and DPR.
 */
export async function renderPageToCanvas(
  doc: PdfDocProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  zoom: number,
  onRenderTask?: (task: PdfRenderTask) => void,
): Promise<PageLayout> {
  const page = await getPage(doc, pageNumber);
  const base = page.getViewport({ scale: 1 });
  // Guard the scale so a bad zoom can never produce a 0/NaN/Infinity canvas.
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const renderScale = safeZoom * dpr;
  const viewport = page.getViewport({ scale: renderScale });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  canvas.style.width = `${base.width * safeZoom}px`;
  canvas.style.height = `${base.height * safeZoom}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  const task = page.render({ canvasContext: ctx, viewport });
  onRenderTask?.(task);
  await task.promise;
  return {
    width: base.width,
    height: base.height,
    cssWidth: base.width * safeZoom,
    cssHeight: base.height * safeZoom,
  };
}

/**
 * Extract positioned text runs. Every run is converted into the same
 * top-left-origin PDF point space used by the field model.
 */
export async function getPageTextItems(
  doc: PdfDocProxy,
  pageNumber: number,
): Promise<PdfTextItem[]> {
  const page = await getPage(doc, pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: PdfTextItem[] = [];
  let seq = 0;
  for (const raw of content.items) {
    if (!('str' in raw)) continue;
    const run = raw as { str?: string; width?: number; height?: number; transform?: number[] };
    const text = run.str ?? '';
    const width = Number(run.width) || 0;
    const height = Number(run.height) || 0;
    const [px, py] = viewport.convertToViewportPoint(
      run.transform?.[4] ?? 0,
      run.transform?.[5] ?? 0,
    );
    items.push({ id: seq++, str: text, x: px, y: py - height, width, height });
  }
  return items;
}

export async function getPageText(doc: PdfDocProxy, pageNumber: number): Promise<string> {
  const items = await getPageTextItems(doc, pageNumber);
  return items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * True when a page has no usable text layer (scanned / image-only page).
 */
export async function isPageScanned(doc: PdfDocProxy, pageNumber: number): Promise<boolean> {
  const text = await getPageText(doc, pageNumber);
  return text.length === 0;
}

/** Validate a raw rect against page bounds (clamps + sanity guards). */
export function snapTextSelection(
  rect: PdfRect,
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  const maxW = Math.max(0, pageWidth);
  const maxH = Math.max(0, pageHeight);
  return {
    x: Math.max(0, Math.min(rect.x, maxW)),
    y: Math.max(0, Math.min(rect.y, maxH)),
    width: Math.max(0, Math.min(rect.width, maxW - Math.max(0, Math.min(rect.x, maxW)))),
    height: Math.max(0, Math.min(rect.height, maxH - Math.max(0, Math.min(rect.y, maxH)))),
  };
}