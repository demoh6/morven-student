// PDF template + field definition model.
//
// This module is deliberately independent from React and from the specific
// PDF viewer implementation. The structure here is the future basis of the
// Phase 3 backend model: it only contains plain data and pure helpers that
// can be serialized to JSON and exchanged with an API.

export type TemplateFieldType = 'TEXT' | 'TEXTAREA' | 'IMAGE';

/** Rectangle in PDF page units (points), top-left origin, page unrotated. */
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single text run extracted by pdf.js (top-left origin, PDF points). */
export interface PdfTextItem extends PdfRect {
  id: number;
  str: string;
}

export interface TemplateFieldDefinition extends PdfRect {
  id: string;
  label: string;
  type: TemplateFieldType;
  /** 1-based PDF page number the region belongs to. */
  page: number;
  defaultValue: string;
  required: boolean;
  /** The text that was selected when the admin created the field (TEXT fields). */
  originalText?: string;
  /** Optional maximum font size hint for the generated document. */
  fontSize?: number;
}

export type TemplateStatus = 'published' | 'draft';

export interface PdfTemplateDefinition {
  schema: 'morven-portfolio-pdf-template.v1';
  templateId: string;
  name: string;
  universityId: string;
  batchId: string;
  subjectId: string;
  kind: string;
  status: TemplateStatus;
  /** Name of the uploaded original PDF (immutable source of truth reference). */
  pdfName: string;
  /** Original PDF bytes, always kept untouched (source of truth). */
  pdfBytes: Uint8Array;
  fields: TemplateFieldDefinition[];
  createdAt: number;
  updatedAt: number;
}

/** JSON-safe projection of a template (pdfBytes → base64 data URL). */
export interface SerializablePdfTemplate
  extends Omit<PdfTemplateDefinition, 'pdfBytes'> {
  pdfDataUrl: string;
}

let fieldSeq = 0;
export function generateFieldId(): string {
  return `tpl-field-${Date.now().toString(36)}-${(++fieldSeq).toString(36)}`;
}

export function clampRect(rect: PdfRect, pageWidth: number, pageHeight: number): PdfRect {
  const x = Math.max(0, Math.min(rect.x, Math.max(0, pageWidth)));
  const y = Math.max(0, Math.min(rect.y, Math.max(0, pageHeight)));
  const width = Math.max(0, Math.min(rect.width, Math.max(0, pageWidth - x)));
  const height = Math.max(0, Math.min(rect.height, Math.max(0, pageHeight - y)));
  return { x, y, width, height };
}

export function rectsOverlap(a: PdfRect, b: PdfRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Text items whose box overlaps the given selection rectangle. */
export function textItemsInRect(rect: PdfRect, items: PdfTextItem[]): PdfTextItem[] {
  return items.filter((item) => rectsOverlap(item, rect));
}

/** Smallest rectangle covering all given items (null when empty). */
export function boundingRectOf(items: PdfTextItem[]): PdfRect | null {
  if (!items.length) return null;
  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const maxX = Math.max(...items.map((i) => i.x + i.width));
  const maxY = Math.max(...items.map((i) => i.y + i.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Convert an array buffer to a UTF-8-free base64 data URL for a PDF. */
export function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}

export function toSerializablePdfTemplate(
  template: PdfTemplateDefinition,
): SerializablePdfTemplate {
  const { pdfBytes, ...rest } = template;
  return { ...rest, pdfDataUrl: bytesToDataUrl(pdfBytes) };
}

export function hasRtlText(value: string): boolean {
  return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(value);
}