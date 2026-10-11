import { describe, expect, it } from 'vitest';
import {
  boundingRectOf,
  bytesToDataUrl,
  clampRect,
  generateFieldId,
  hasRtlText,
  rectsOverlap,
  textItemsInRect,
  toSerializablePdfTemplate,
  type PdfTemplateDefinition,
  type PdfTextItem,
} from './model';

const item = (id: number, x: number, y: number, width: number, height: number, str = ''): PdfTextItem => ({
  id,
  str,
  x,
  y,
  width,
  height,
});

describe('portfolio PDF model', () => {
  it('clamps rectangles to the page bounds', () => {
    expect(clampRect({ x: -5, y: -5, width: 200, height: 200 }, 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(clampRect({ x: 50, y: 50, width: 100, height: 100 }, 100, 100)).toEqual({
      x: 50,
      y: 50,
      width: 50,
      height: 50,
    });
  });

  it('detects overlapping rectangles', () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    expect(rectsOverlap(a, { x: 40, y: 40, width: 30, height: 30 })).toBe(true);
    expect(rectsOverlap(a, { x: 60, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('selects and bounds the text items inside a region', () => {
    const items = [item(0, 10, 10, 20, 10, 'A'), item(1, 40, 10, 20, 10, 'B'), item(2, 200, 200, 20, 10, 'C')];
    const region = { x: 0, y: 0, width: 100, height: 40 };
    const inside = textItemsInRect(region, items);
    expect(inside.map((i) => i.id)).toEqual([0, 1]);
    expect(boundingRectOf(inside)).toEqual({ x: 10, y: 10, width: 50, height: 10 });
    expect(boundingRectOf([])).toBeNull();
  });

  it('flags RTL text and ignores Latin', () => {
    expect(hasRtlText('محمد سامي')).toBe(true);
    expect(hasRtlText('Mohammed Sami')).toBe(false);
  });

  it('generates unique field ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateFieldId()));
    expect(ids.size).toBe(50);
  });

  it('serializes a template into a JSON-safe projection', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const template: PdfTemplateDefinition = {
      schema: 'morven-portfolio-pdf-template.v1',
      templateId: 't1',
      name: 'قالب',
      universityId: 'u1',
      batchId: 'b1',
      subjectId: 's1',
      kind: 'ملف إنجاز',
      status: 'draft',
      pdfName: 'source.pdf',
      pdfBytes: bytes,
      fields: [],
      createdAt: 1,
      updatedAt: 2,
    };
    const serialized = toSerializablePdfTemplate(template);
    expect(serialized.templateId).toBe('t1');
    expect(serialized.schema).toBe('morven-portfolio-pdf-template.v1');
    expect(serialized.pdfDataUrl.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(serialized).not.toHaveProperty('pdfBytes');
    expect(bytesToDataUrl(bytes)).toBe(serialized.pdfDataUrl);
  });
});
