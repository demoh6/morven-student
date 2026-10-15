import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResourceDetailMobile } from './ResourceDetailMobile';
import type { Resource } from './resources';

const baseResource: Resource = {
  id: 'r1',
  title: 'ملخص الفيزياء',
  description: 'ملخص الوحدة الأولى',
  type: 'file',
  ownerId: 'me',
  uploadedBy: 'د. أحمد',
  uploadedAt: '',
  createdAt: '',
  updatedAt: '',
  isPrivate: false,
};

const baseFile = { id: 'f1', name: 'summary.pdf', type: 'application/pdf', size: 1024, createdAt: 1717000000000 };
const baseNote = { id: 'n1', title: 'مراجعة سريعة', content: 'أقوى نقطتين', createdAt: 1717000000000 };
const baseLink = { id: 'l1', title: 'موقع المراجعات', url: 'https://example.com', createdAt: 1717000000000 };

const noop = () => {};

function renderMobile(props: Partial<Parameters<typeof ResourceDetailMobile>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ResourceDetailMobile
        resource={baseResource}
        files={[]}
        notes={[]}
        links={[]}
        canManage
        maxFiles={10}
        copiedAccessCode={false}
        actionError={null}
        onCopyAccessCode={noop}
        onEdit={noop}
        onDelete={noop}
        onFilesSelected={noop}
        onDownloadFile={noop}
        onRemoveFile={noop}
        onAddNote={noop}
        onViewNote={noop}
        onRemoveNote={noop}
        onAddLink={noop}
        onOpenLink={noop}
        onRemoveLink={noop}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('ResourceDetailMobile', () => {
  it('renders the compact RTL header with identity, uploader and type chips', () => {
    const { container } = renderMobile();

    expect(screen.getByRole('heading', { name: 'ملخص الفيزياء' })).toBeInTheDocument();
    expect(screen.getByText('ملخص الوحدة الأولى')).toBeInTheDocument();
    expect(screen.getByText('د. أحمد')).toBeInTheDocument();
    expect(screen.getByText('ملف')).toBeInTheDocument();

    // Back navigation returns to the Resources listing.
    const back = screen.getByRole('link', { name: /الموارد/ });
    expect(back).toHaveAttribute('href', '/connect/resources');

    // The mobile root carries the Group-Detail phone wrapper classes.
    expect(screen.getByRole('heading', { name: 'ملخص الفيزياء' }).closest('[dir="rtl"]')).not.toBeNull();
    expect(container.querySelector('[class*="-mx-4 px-3"]')).not.toBeNull();
    expect(container.querySelector('[class*="pb-10"]')).not.toBeNull();
    // No desktop root — the desktop wrapper (max-w-2xl) must not appear.
    expect(container.querySelector('[class*="max-w-2xl"]')).toBeNull();

    // The resource type icon sits in the amber gradient tile beside the name.
    expect(container.querySelector('[class*="from-amber-400"]')).not.toBeNull();
    // Header ↔ content boundary uses the lightweight amber section rule.
    expect(container.querySelector('[class*="via-amber-400/50"]')).not.toBeNull();
  });

  it('places management actions as icon-only controls on the title line', () => {
    renderMobile();
    expect(screen.getByRole('button', { name: 'تعديل المورد' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف المورد' })).toBeInTheDocument();
  });

  it('hides management actions from users who cannot manage the resource', () => {
    renderMobile({ canManage: false });
    expect(screen.queryByRole('button', { name: 'تعديل المورد' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف المورد' })).not.toBeInTheDocument();
    // Read-only viewers still see who uploaded the resource.
    expect(screen.getByText('د. أحمد')).toBeInTheDocument();
  });

  it('shows the private lock inline and the owner-only access code chip', () => {
    const { container } = renderMobile({
      resource: { ...baseResource, isPrivate: true, accessCode: '123456' },
    });
    // Private marker beside the title (like the crown on the group page).
    expect(container.querySelector('[aria-label="خاص"]')).not.toBeNull();
    // The code itself is the chip's content; the control keeps an aria-label.
    const copy = screen.getByRole('button', { name: 'نسخ رمز الوصول' });
    expect(copy).toHaveTextContent('123456');
    // The descriptive label is hidden, mirroring the join-code presentation.
    expect(screen.queryByText('رمز الوصول')).not.toBeInTheDocument();
  });

  it('does not expose the access code to non-managers', () => {
    renderMobile({
      resource: { ...baseResource, isPrivate: true, accessCode: '123456' },
      canManage: false,
    });
    expect(screen.queryByRole('button', { name: 'نسخ رمز الوصول' })).not.toBeInTheDocument();
    expect(screen.queryByText('123456')).not.toBeInTheDocument();
  });

  it('marks a copied access code with the success state', () => {
    renderMobile({
      resource: { ...baseResource, isPrivate: true, accessCode: '123456' },
      copiedAccessCode: true,
    });
    const copy = screen.getByRole('button', { name: 'نسخ رمز الوصول' });
    expect(copy.querySelector('svg.lucide-check')).not.toBeNull();
  });

  it('surfaces action errors as a visible alert', () => {
    renderMobile({ actionError: 'حدث خطأ في الرفع' });
    expect(screen.getByRole('alert')).toHaveTextContent('حدث خطأ في الرفع');
  });

  describe('file resources', () => {
    it('renders each file with its name, size and download control', () => {
      renderMobile({ files: [baseFile] });
      expect(screen.getByText('summary.pdf')).toBeInTheDocument();
      expect(screen.getByText(/1\.0 KB/)).toBeInTheDocument();
      const download = screen.getByRole('button', { name: 'تحميل summary.pdf' });
      expect(download).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'حذف summary.pdf' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'الملفات' })).toBeInTheDocument();
    });

    it('hides file deletion from non-managers', () => {
      renderMobile({ files: [baseFile], canManage: false });
      expect(screen.getByRole('button', { name: 'تحميل summary.pdf' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'حذف summary.pdf' })).not.toBeInTheDocument();
    });

    it('offers the upload control to managers', () => {
      renderMobile({ files: [baseFile] });
      expect(screen.getByRole('button', { name: /رفع ملفات/ })).toBeInTheDocument();
    });

    it('hides the upload control from non-managers', () => {
      renderMobile({ files: [baseFile], canManage: false });
      expect(screen.queryByRole('button', { name: /رفع ملفات/ })).not.toBeInTheDocument();
    });

    it('hides the upload control once the file limit is reached', () => {
      const ten = Array.from({ length: 10 }, (_, i) => ({ ...baseFile, id: `f${i}` }));
      renderMobile({ files: ten });
      expect(screen.queryByRole('button', { name: /رفع ملفات/ })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /تحميل summary\.pdf/ })).toHaveLength(10);
    });

    it('hands picked files to the parent without reading their bytes', () => {
      const onFilesSelected = vi.fn();
      const { container } = renderMobile({ files: [baseFile], onFilesSelected });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const picked = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
      fireEvent.change(input, { target: { files: [picked] } });
      expect(onFilesSelected).toHaveBeenCalledWith([{ file: picked, data: '' }]);
    });

    it('renders the file-upload card with the exact note/link card styling', () => {
      // The upload trigger must be visually identical to the "إضافة" cards, so
      // compare its class strings against the real cards rendered by the same
      // component instead of hard-coding the expected values.
      const file = renderMobile({ files: [baseFile] });
      const fileCard = screen.getByRole('button', { name: /رفع ملفات/ });
      const cardClass = fileCard.className;
      const iconBoxClass = fileCard.querySelector('div')?.className;
      file.unmount();

      const note = renderMobile({ resource: { ...baseResource, type: 'note' } });
      const noteCard = screen.getByRole('button', { name: /إضافة ملاحظة/ });
      expect(noteCard.className).toBe(cardClass);
      expect(noteCard.querySelector('div')?.className).toBe(iconBoxClass);
      note.unmount();

      renderMobile({ resource: { ...baseResource, type: 'link' } });
      const linkCard = screen.getByRole('button', { name: /إضافة رابط/ });
      expect(linkCard.className).toBe(cardClass);
    });

    it('separates the added files from the upload card with a heading and spacing', () => {
      const { container } = renderMobile({ files: [baseFile] });
      const heading = screen.getByRole('heading', { name: 'المحتوى المضاف' });
      const list = container.querySelector('ul');
      expect(list).not.toBeNull();
      // The heading sits above the items.
      expect(heading.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // A spacing wrapper lifts the block off the upload card.
      expect(heading.closest('[class*="mt-6"]')).not.toBeNull();
    });

    it('shows an empty state when the resource has no files', () => {
      renderMobile();
      expect(screen.getByText('لا توجد ملفات بعد')).toBeInTheDocument();
      // No content heading is introduced for an empty section.
      expect(screen.queryByRole('heading', { name: 'المحتوى المضاف' })).not.toBeInTheDocument();
    });
  });

  describe('note resources', () => {
    it('lists notes and lets managers add or remove them', () => {
      const onAddNote = vi.fn();
      const onRemoveNote = vi.fn();
      renderMobile({
        resource: { ...baseResource, type: 'note' },
        notes: [baseNote],
        onAddNote,
        onRemoveNote,
      });
      expect(screen.getByRole('heading', { name: 'الملاحظات' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /إضافة ملاحظة/ }));
      expect(onAddNote).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'حذف مراجعة سريعة' }));
      expect(onRemoveNote).toHaveBeenCalledWith(baseNote);
    });

    it('opens the note viewer when its row is tapped', () => {
      const onViewNote = vi.fn();
      renderMobile({
        resource: { ...baseResource, type: 'note' },
        notes: [baseNote],
        onViewNote,
      });
      fireEvent.click(screen.getByText('مراجعة سريعة'));
      expect(onViewNote).toHaveBeenCalledWith('n1');
    });

    it('hides add/remove from non-managers', () => {
      renderMobile({
        resource: { ...baseResource, type: 'note' },
        notes: [baseNote],
        canManage: false,
      });
      expect(screen.queryByRole('button', { name: /إضافة ملاحظة/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'حذف مراجعة سريعة' })).not.toBeInTheDocument();
      expect(screen.getByText('مراجعة سريعة')).toBeInTheDocument();
    });

    it('separates the added notes from the add card with a heading and spacing', () => {
      const { container } = renderMobile({
        resource: { ...baseResource, type: 'note' },
        notes: [baseNote],
      });
      const heading = screen.getByRole('heading', { name: 'المحتوى المضاف' });
      const list = container.querySelector('ul');
      expect(list).not.toBeNull();
      expect(heading.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(heading.closest('[class*="mt-6"]')).not.toBeNull();
    });

    it('shows an empty state when the resource has no notes', () => {
      renderMobile({ resource: { ...baseResource, type: 'note' } });
      expect(screen.getByText('لا توجد ملاحظات بعد')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'المحتوى المضاف' })).not.toBeInTheDocument();
    });
  });

  describe('link resources', () => {
    it('lists links and lets managers add, open and remove them', () => {
      const onAddLink = vi.fn();
      const onOpenLink = vi.fn();
      const onRemoveLink = vi.fn();
      renderMobile({
        resource: { ...baseResource, type: 'link' },
        links: [baseLink],
        onAddLink,
        onOpenLink,
        onRemoveLink,
      });
      expect(screen.getByRole('heading', { name: 'الروابط' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /إضافة رابط/ }));
      expect(onAddLink).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: /حذف موقع المراجعات/ }));
      expect(onRemoveLink).toHaveBeenCalledWith(baseLink);
      fireEvent.click(screen.getByText('موقع المراجعات'));
      expect(onOpenLink).toHaveBeenCalledWith(baseLink);
    });

    it('hides add/remove from non-managers', () => {
      renderMobile({
        resource: { ...baseResource, type: 'link' },
        links: [baseLink],
        canManage: false,
      });
      expect(screen.queryByRole('button', { name: /إضافة رابط/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'حذف موقع المراجعات' })).not.toBeInTheDocument();
      expect(screen.getByText('موقع المراجعات')).toBeInTheDocument();
    });

    it('separates the added links from the add card with a heading and spacing', () => {
      const { container } = renderMobile({
        resource: { ...baseResource, type: 'link' },
        links: [baseLink],
      });
      const heading = screen.getByRole('heading', { name: 'المحتوى المضاف' });
      const list = container.querySelector('ul');
      expect(list).not.toBeNull();
      expect(heading.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(heading.closest('[class*="mt-6"]')).not.toBeNull();
    });

    it('shows an empty state when the resource has no links', () => {
      renderMobile({ resource: { ...baseResource, type: 'link' } });
      expect(screen.getByText('لا توجد روابط بعد')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'المحتوى المضاف' })).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Page-level wiring: below 640px the page renders the mobile component.
// ---------------------------------------------------------------------------

const api = vi.hoisted(() => ({
  getResources: vi.fn(),
  getResource: vi.fn(),
  createResourceApi: vi.fn(),
  updateResourceApi: vi.fn(),
  deleteResourceApi: vi.fn(),
  accessResourceApi: vi.fn(),
  accessResourceByCodeApi: vi.fn(),
  uploadResourceFiles: vi.fn(),
  deleteResourceFileApi: vi.fn(),
  downloadResourceFile: vi.fn(),
  addResourceNoteApi: vi.fn(),
  deleteResourceNoteApi: vi.fn(),
  addResourceLinkApi: vi.fn(),
  deleteResourceLinkApi: vi.fn(),
}));
const cache = vi.hoisted(() => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id: 'me', role: 'USER' } }));

vi.mock('@/pages/connect/Resources/resourceApi', () => api);
vi.mock('@/services/offlineCache', () => cache);
vi.mock('@/pages/auth/useAuthStore', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) =>
    selector ? selector({ user: auth.user }) : { user: auth.user },
}));

import ResourceDetailPage from './ResourceDetailPage';
import { useResourcesStore } from './useResourcesStore';

describe('ResourceDetailPage — phone-only layout isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.cacheSet.mockResolvedValue(undefined);
    cache.cacheGet.mockResolvedValue(null);
    api.getResource.mockResolvedValue({
      ...baseResource,
      files: [baseFile],
      notes: [],
      links: [],
    });
    useResourcesStore.setState({
      resources: [],
      contentMap: {},
      loading: false,
      error: null,
      lockedResourceId: null,
    });
  });

  function stubViewport(isPhone: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: isPhone && query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/connect/resources/r1']}>
        <Routes>
          <Route path="/connect/resources/:resourceId" element={<ResourceDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders the mobile component on phone viewports', async () => {
    stubViewport(true);
    const { container } = renderPage();
    expect(await screen.findByRole('heading', { name: 'ملخص الفيزياء' })).toBeInTheDocument();
    // The phone layout uses ResourceDetailMobile's root wrapper; the desktop
    // root (max-w-2xl) must not be present.
    expect(container.querySelector('[class*="pb-10"]')).not.toBeNull();
    expect(container.querySelector('[class*="max-w-2xl"]')).toBeNull();
  });

  it('keeps the desktop tree untouched on wider viewports', async () => {
    stubViewport(false);
    const { container } = renderPage();
    expect(await screen.findByRole('heading', { name: 'ملخص الفيزياء' })).toBeInTheDocument();
    // The desktop root wrapper is present; the phone layout's is not.
    expect(container.querySelector('[class*="max-w-2xl"]')).not.toBeNull();
    expect(container.querySelector('[class*="pb-10"]')).toBeNull();
    // The desktop hero keeps its labelled management buttons.
    expect(screen.getAllByRole('button', { name: 'تعديل' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'حذف المورد' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'تعديل المورد' })).not.toBeInTheDocument();
    // Files still render in their desktop card.
    expect(screen.getByText('summary.pdf')).toBeInTheDocument();
  });

  // Regression: the dialogs used to live only inside the desktop return, so on
  // phones their state toggled but nothing appeared. They must render on the
  // phone layout itself.
  it('opens the Edit dialog on phones when the edit button is clicked', async () => {
    stubViewport(true);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل المورد' }));
    expect(await screen.findByRole('dialog', { name: 'تعديل المورد' })).toBeInTheDocument();
  });

  it('opens the Delete dialog on phones when the delete button is clicked', async () => {
    stubViewport(true);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'حذف المورد' }));
    expect(await screen.findByRole('dialog', { name: 'حذف المورد' })).toBeInTheDocument();
  });

  it('opens the Add Note dialog on phones for a note resource', async () => {
    api.getResource.mockResolvedValue({
      ...baseResource,
      type: 'note',
      files: [],
      notes: [],
      links: [],
    });
    stubViewport(true);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /إضافة ملاحظة/ }));
    expect(await screen.findByRole('dialog', { name: 'إضافة ملاحظة' })).toBeInTheDocument();
  });
});
