import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { destroyPdfDocument, getPageText, loadPdfDocument } from './pdfjs';

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Hello Portfolio', { x: 40, y: 800, size: 12, font });
  return doc.save();
}

describe('loadPdfDocument', () => {
  it('loads a document without detaching the caller source bytes', async () => {
    const bytes = await makePdf();
    const snapshot = Array.from(bytes);

    const doc = await loadPdfDocument(bytes);
    try {
      // pdf.js transfers the buffer it is handed; the original must survive.
      expect(bytes.length).toBe(snapshot.length);
      expect(Array.from(bytes)).toEqual(snapshot);
      expect(await getPageText(doc, 1)).toContain('Hello Portfolio');
    } finally {
      destroyPdfDocument(doc);
    }
  });
});
