import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { PdfDocProxy } from '../services/pdfjs';

vi.mock('../services/pdfjs', () => ({
  renderPageToCanvas: vi.fn(),
  getPageTextItems: vi.fn(),
}));

import { getPageTextItems, renderPageToCanvas } from '../services/pdfjs';
import PdfCanvasPage from './PdfCanvasPage';

const doc = {} as PdfDocProxy;
const noop = () => {};

function renderCanvasPage() {
  return render(
    <PdfCanvasPage
      doc={doc}
      pageNumber={1}
      zoom={1}
      fields={[]}
      selectedFieldId={null}
      tool="cursor"
      extraPending={null}
      onSelectField={noop}
      onPendingRect={noop}
      onNewSelection={noop}
      onUpdateField={noop}
      onDeleteField={noop}
    />,
  );
}

describe('PdfCanvasPage render lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPageTextItems).mockResolvedValue([]);
  });

  it('keeps the canvas mounted and clears the loading state once the page renders', async () => {
    vi.mocked(renderPageToCanvas).mockResolvedValue({
      width: 595,
      height: 842,
      cssWidth: 595,
      cssHeight: 842,
    });
    const { container } = renderCanvasPage();

    // The canvas must exist during loading, otherwise the effect can never run.
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(screen.getByText('جارٍ تحميل الصفحة...')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByText('جارٍ تحميل الصفحة...')).not.toBeInTheDocument(),
    );
    expect(renderPageToCanvas).toHaveBeenCalledTimes(1);
  });

  it('leaves the loading state and reports an error when rendering fails', async () => {
    vi.mocked(renderPageToCanvas).mockRejectedValue(new Error('boom'));
    renderCanvasPage();

    await waitFor(() => expect(screen.getByText(/تعذر عرض صفحة/)).toBeInTheDocument());
    expect(screen.queryByText('جارٍ تحميل الصفحة...')).not.toBeInTheDocument();
  });
});
