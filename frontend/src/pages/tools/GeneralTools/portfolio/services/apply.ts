// Local proof-of-concept engine that applies student values to a COPY of the
// original template PDF.
//
// The original bytes are never mutated: PDFDocument.load() parses a snapshot
// and the output is a brand new byte array. Fields are only painted when the
// committed value actually differs from the captured original text, which
// keeps unchanged regions visually identical to the source document.
//
// Known limits (deliberately surfaced, not hidden):
//  - pdf-lib ships no shaping engine and no Arabic-capable standard font, so
//    RTL values are reported and skipped instead of being written badly.
//  - The old glyphs under a region are visually covered by a white rectangle
//    but remain in the content stream (they are not deleted), which is
//    acceptable for Phase 2 and the basis for a server-side Phase 3 engine.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { hasRtlText, type PdfTemplateDefinition, type TemplateFieldDefinition } from '../model';

export interface ApplyResult {
  fieldId: string;
  ok: boolean;
  reason?: string;
}

export interface ApplyOutput {
  bytes: Uint8Array;
  results: ApplyResult[];
}

const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.05, 0.05, 0.05);

export function fontLineHeight(fontSize: number): number {
  return fontSize * 1.15;
}

export function estimateFontSize(rectHeight: number, textWidth: number, maxWidth: number): number {
  const byHeight = Math.max(6, Math.min(28, rectHeight * 0.72));
  if (textWidth <= maxWidth) return byHeight;
  return Math.max(4, byHeight * (maxWidth / textWidth));
}

function splitLines(value: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, maxWidth: number, size: number): string[] {
  const rawLines = value.split(/\r?\n/);
  const lines: string[] = [];
  for (const raw of rawLines) {
    const words = raw.split(' ');
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines.filter((l) => l.length > 0 || rawLines.length > 1);
}

function drawTextValue(
  page: import('pdf-lib').PDFPage,
  font: import('pdf-lib').PDFFont,
  value: string,
  size: number,
  x: number,
  yTop: number,
  width: number,
  height: number,
): void {
  const lineHeight = fontLineHeight(size);
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  const lines = splitLines(value, font, Math.max(1, width), size).slice(0, maxLines);
  lines.forEach((line, index) => {
    const baseline = yTop + height - (size * 0.8) - index * lineHeight;
    page.drawText(line, { x, y: baseline, size, font, color: BLACK });
  });
}

type ImageKind = 'png' | 'jpg' | null;

function decodeDataUrl(value: string): { bytes: Uint8Array; kind: ImageKind } | null {
  const match = value.match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/s);
  if (!match) return null;
  const kind: ImageKind = match[2] === 'png' ? 'png' : 'jpg';
  const binary = atob(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, kind };
}

/**
 * Build a cover-fit draw rect: keeps the aspect ratio of the source and
 * crops instead of distorting (like `background-size: cover`).
 */
function coverRectOf(
  regionWidth: number,
  regionHeight: number,
  imageWidth: number,
  imageHeight: number,
): { width: number; height: number; offsetY: number } {
  const regionRatio = regionWidth / regionHeight;
  const imageRatio = imageWidth / imageHeight;
  let width: number;
  let height: number;
  if (imageRatio > regionRatio) {
    height = regionHeight;
    width = height * imageRatio;
  } else {
    width = regionWidth;
    height = width / imageRatio;
  }
  const offsetY = (regionHeight - height) / 2;
  return { width, height, offsetY };
}

export async function applyPdfFields(
  template: PdfTemplateDefinition,
  values: Record<string, string>,
): Promise<ApplyOutput> {
  const doc = await PDFDocument.load(template.pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const results: ApplyResult[] = [];

  for (const field of template.fields) {
    const value = values[field.id] ?? field.defaultValue;
    const original = field.originalText?.replace(/\s+/g, ' ').trim() ?? '';
    const committed = value.replace(/\s+/g, ' ').trim();
    const changedText = field.type !== 'IMAGE' && committed !== original;
    const hasImageValue = field.type === 'IMAGE' && value.trim().length > 0;

    const resultBase: ApplyResult = { fieldId: field.id, ok: true };

    if (!changedText && !hasImageValue) {
      results.push(resultBase);
      continue;
    }

    const pageIndex = field.page - 1;
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
      results.push({ fieldId: field.id, ok: false, reason: `page-out-of-range (${field.page})` });
      continue;
    }

    const page = doc.getPage(pageIndex);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const x = Math.max(0, Math.min(field.x, pageWidth));
    const yBottom = pageHeight - Math.max(0, Math.min(field.y + field.height, pageHeight));
    const width = Math.max(0, Math.min(field.width, pageWidth - x));
    const height = Math.max(0, Math.min(field.height, pageHeight - (field.y + field.height)));

    page.drawRectangle({ x, y: yBottom, width, height, color: WHITE });

    if (field.type === 'IMAGE') {
      const decoded = decodeDataUrl(value);
      if (!decoded) {
        results.push({ fieldId: field.id, ok: false, reason: 'invalid-image-value' });
        continue;
      }
      try {
        const image =
          decoded.kind === 'png'
            ? await doc.embedPng(decoded.bytes)
            : await doc.embedJpg(decoded.bytes);
        const cover = coverRectOf(width, height, image.width, image.height);
        const imageY = yBottom + (height - cover.height) / 2;
        page.drawImage(image, { x, y: imageY, width: cover.width, height: cover.height });
        results.push(resultBase);
      } catch {
        results.push({ fieldId: field.id, ok: false, reason: 'image-embed-failed' });
      }
      continue;
    }

    if (hasRtlText(committed)) {
      // pdf-lib + standard fonts cannot encode/shape Arabic reliably.
      results.push({ fieldId: field.id, ok: false, reason: 'rtl-not-supported' });
      continue;
    }

    try {
      const maxWidth = Math.max(1, width);
      const size = estimateFontSize(height, font.widthOfTextAtSize(committed, 12), maxWidth);
      drawTextValue(page, font, committed, size, x, yBottom, width, height);
      results.push(resultBase);
    } catch {
      results.push({ fieldId: field.id, ok: false, reason: 'text-decode-failed' });
    }
  }

  const bytes = await doc.save();
  return { bytes, results };
}

/** Serialized download of the output (used by the admin PoC previews). */
export function outputToBlob(output: Uint8Array): Blob {
  return new Blob([output as unknown as ArrayBuffer], { type: 'application/pdf' });
}