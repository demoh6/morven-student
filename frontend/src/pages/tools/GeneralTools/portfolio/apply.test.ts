import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { applyPdfFields, outputToBlob } from './services/apply';
import { destroyPdfDocument, getPageText, loadPdfDocument } from './services/pdfjs';
import type { PdfTemplateDefinition, TemplateFieldDefinition } from './model';

const PAGE = { width: 595.28, height: 841.89 };
const ORIGINAL_TEXT = 'Original Placeholder Text';
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function makeSourcePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(ORIGINAL_TEXT, { x: 60, y: 700, size: 14, font, color: rgb(0, 0, 0) });
  return doc.save();
}

function field(partial: Partial<TemplateFieldDefinition> & Pick<TemplateFieldDefinition, 'id' | 'type'>): TemplateFieldDefinition {
  return {
    label: partial.id,
    page: 1,
    x: 55,
    y: 120,
    width: 300,
    height: 20,
    defaultValue: '',
    required: false,
    ...partial,
  };
}

function templateWith(bytes: Uint8Array, fields: TemplateFieldDefinition[]): PdfTemplateDefinition {
  return {
    schema: 'morven-portfolio-pdf-template.v1',
    templateId: 'tpl-test',
    name: 'اختبار',
    universityId: 'u1',
    batchId: 'b1',
    subjectId: 's1',
    kind: 'ملف إنجاز',
    status: 'draft',
    pdfName: 'source.pdf',
    pdfBytes: bytes,
    fields,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('applyPdfFields (local PDF generation proof of concept)', () => {
  it('writes changed values to a copy, skips RTL, and never mutates the source', async () => {
    const source = await makeSourcePdf();
    const sourceSnapshot = Array.from(source);

    const fields: TemplateFieldDefinition[] = [
      field({ id: 'f-text', type: 'TEXT', originalText: ORIGINAL_TEXT, defaultValue: ORIGINAL_TEXT }),
      field({ id: 'f-rtl', type: 'TEXT', y: 160, defaultValue: 'مرحبا بالعالم' }),
      field({ id: 'f-para', type: 'TEXTAREA', y: 200, height: 60, defaultValue: 'line one line two line three four five six' }),
      field({ id: 'f-img', type: 'IMAGE', x: 400, y: 120, width: 80, height: 80, defaultValue: PNG_1x1 }),
      field({ id: 'f-same', type: 'TEXT', y: 260, originalText: 'Same', defaultValue: 'Same' }),
    ];

    const output = await applyPdfFields(templateWith(source, fields), {});

    expect(output.bytes).toBeInstanceOf(Uint8Array);
    expect(output.bytes.length).toBeGreaterThan(source.length);
    expect(output.results).toHaveLength(fields.length);

    const byId = new Map(output.results.map((r) => [r.fieldId, r]));
    expect(byId.get('f-text')?.ok).toBe(true);
    expect(byId.get('f-para')?.ok).toBe(true);
    expect(byId.get('f-img')?.ok).toBe(true);
    expect(byId.get('f-same')?.ok).toBe(true);
    expect(byId.get('f-rtl')?.ok).toBe(false);
    expect(byId.get('f-rtl')?.reason).toBe('rtl-not-supported');

    // The original bytes are untouched.
    expect(Array.from(source)).toEqual(sourceSnapshot);

    // The generated document contains the new value.
    const doc = await loadPdfDocument(output.bytes);
    try {
      const text = await getPageText(doc, 1);
      expect(text).toContain('line one line two');
    } finally {
      destroyPdfDocument(doc);
    }
  });

  it('produces a downloadable PDF blob', () => {
    const blob = outputToBlob(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(4);
  });
});
