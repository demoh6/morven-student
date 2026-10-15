import { useRef, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ChevronLeft,
  Pencil,
  Trash2,
  Copy,
  Check,
  Lock,
  Download,
  FileText,
  StickyNote,
  Plus,
  Upload,
  ExternalLink,
} from 'lucide-react';
import { formatFileSize } from '@/utils/file';
import { APP_DISPLAY_LOCALE } from '@/utils/displayLocale';
import { typeLabels, typeIcons, type Resource } from '@/pages/connect/Resources/resources';
import type {
  ResourceFile,
  ResourceNote,
  ResourceLink,
} from '@/pages/connect/Resources/useResourcesStore';

export type ResourceDetailMobileProps = {
  resource: Resource;
  files: ResourceFile[];
  notes: ResourceNote[];
  links: ResourceLink[];
  /** Owner or system admin — may edit/delete the resource and its content. */
  canManage: boolean;
  /** Maximum number of files allowed per resource. */
  maxFiles: number;
  copiedAccessCode: boolean;
  actionError: string | null;
  onCopyAccessCode: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFilesSelected: (selected: { file: File; data: ArrayBuffer | string }[]) => void;
  onDownloadFile: (f: ResourceFile) => void;
  onRemoveFile: (f: ResourceFile) => void;
  onAddNote: () => void;
  onViewNote: (id: string) => void;
  onRemoveNote: (n: { id: string }) => void;
  onAddLink: () => void;
  onOpenLink: (l: ResourceLink) => void;
  onRemoveLink: (l: ResourceLink) => void;
};

const ACTION_TONES = {
  edit: 'active:text-primary-500 active:bg-primary-50 dark:active:bg-primary-900/20',
  delete: 'active:text-red-500 active:bg-red-50 dark:active:bg-red-900/10',
} as const;

function HeaderActionButton({
  tone,
  label,
  onClick,
  children,
}: {
  tone: keyof typeof ACTION_TONES;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 transition-colors ${ACTION_TONES[tone]}`}
    >
      {children}
    </button>
  );
}

/** Compact row action (download / delete) mirroring the member-row remove button. */
function RowActionButton({
  tone,
  label,
  onClick,
  children,
}: {
  tone: 'primary' | 'danger';
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'danger'
      ? 'active:text-red-500 active:bg-red-50 dark:active:bg-red-900/10'
      : 'active:text-amber-600 active:bg-amber-50 dark:active:bg-amber-900/20';
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 transition-colors shrink-0 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function FileRow({
  file,
  canManage,
  onDownload,
  onRemove,
}: {
  file: ResourceFile;
  canManage: boolean;
  onDownload: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-dark-surface flex items-center justify-center text-gray-500 dark:text-gray-400 shrink-0">
        <FileText className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold leading-snug text-gray-900 dark:text-white break-words">
          {file.name}
        </p>
        <p className="text-[11px] leading-tight text-gray-500 dark:text-gray-400 mt-0.5">
          {formatFileSize(file.size)} · {new Date(file.createdAt).toLocaleString(APP_DISPLAY_LOCALE)}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <RowActionButton tone="primary" label={`تحميل ${file.name}`} onClick={onDownload}>
          <Download className="w-4 h-4" />
        </RowActionButton>
        {canManage && (
          <RowActionButton tone="danger" label={`حذف ${file.name}`} onClick={onRemove}>
            <Trash2 className="w-4 h-4" />
          </RowActionButton>
        )}
      </div>
    </li>
  );
}

function NoteRow({
  note,
  canManage,
  onView,
  onRemove,
}: {
  note: ResourceNote;
  canManage: boolean;
  onView: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <button
        type="button"
        onClick={onView}
        className="flex-1 min-w-0 flex items-center gap-2.5 text-start active:opacity-70 transition-opacity"
      >
        <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
          <StickyNote className="w-4 h-4" />
        </div>
        <span className="text-[13.5px] font-semibold leading-snug text-gray-900 dark:text-white break-words min-w-0">
          {note.title || 'بدون عنوان'}
        </span>
      </button>
      {canManage && (
        <RowActionButton tone="danger" label={`حذف ${note.title || 'الملاحظة'}`} onClick={onRemove}>
          <Trash2 className="w-4 h-4" />
        </RowActionButton>
      )}
    </li>
  );
}

function LinkRow({
  link,
  canManage,
  onOpen,
  onRemove,
}: {
  link: ResourceLink;
  canManage: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 flex items-center gap-2.5 text-start active:opacity-70 transition-opacity"
      >
        <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
          <ExternalLink className="w-4 h-4" />
        </div>
        <span className="text-[13.5px] font-semibold leading-snug text-gray-900 dark:text-white break-words min-w-0">
          {link.title}
        </span>
      </button>
      {canManage && (
        <RowActionButton tone="danger" label={`حذف ${link.title}`} onClick={onRemove}>
          <Trash2 className="w-4 h-4" />
        </RowActionButton>
      )}
    </li>
  );
}

const SECTION_TITLES = {
  file: 'الملفات',
  note: 'الملاحظات',
  link: 'الروابط',
} as const;

/**
 * Phone-only resource detail view. A literal re-styling of the mobile Group
 * Detail page (`GroupDetailMobile`) for a single resource: a flat, compact
 * header (resource identity on the right, edit/delete actions pinned to the
 * extreme left on the title line), an uploader / type / access-code chip row, a
 * lightweight section rule, and a card-free content list (files, notes or
 * links) whose rows follow the same compact geometry as the member list. The
 * Resources amber/orange accent is kept so the page stays consistent with the
 * rest of the Resources feature.
 *
 * Rendered only below 640px (see `useIsMobilePhone`); tablets and desktops keep
 * the original layout in `ResourceDetailPage`.
 */
export function ResourceDetailMobile({
  resource,
  files,
  notes,
  links,
  canManage,
  maxFiles,
  copiedAccessCode,
  actionError,
  onCopyAccessCode,
  onEdit,
  onDelete,
  onFilesSelected,
  onDownloadFile,
  onRemoveFile,
  onAddNote,
  onViewNote,
  onRemoveNote,
  onAddLink,
  onOpenLink,
  onRemoveLink,
}: ResourceDetailMobileProps) {
  const r = resource;
  const Icon = typeIcons[r.type];
  const remainingFiles = maxFiles - files.length;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mirrors FileUpload's `readFileData={false}` contract: hand the parent the
  // picked files immediately, without reading their bytes into memory.
  const handleFilesInput = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      onFilesSelected(Array.from(selected).map((file) => ({ file, data: '' })));
    }
    // Reset so re-picking the same file still fires onChange.
    e.target.value = '';
  };

  return (
    <div className="-mx-4 px-3 pt-1 pb-10" dir="rtl">
      {/* Back nav */}
      <Link
        to="/connect/resources"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-500 dark:text-primary-400 active:opacity-70 transition-opacity"
      >
        <ChevronLeft className="w-4 h-4" />
        الموارد
      </Link>

      {actionError && (
        <div
          className="mt-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-3 py-2 text-[12px] text-red-700 dark:text-red-300"
          role="alert"
        >
          {actionError}
        </div>
      )}

      {/* Resource header */}
      <header className="mt-3">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <h1 className="text-[17px] font-bold leading-snug text-gray-900 dark:text-white break-words min-w-0">
                {r.title}
              </h1>
              {r.isPrivate && (
                <Lock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" aria-label="خاص" />
              )}
            </div>
            {r.description && (
              <p className="text-[12px] leading-snug text-gray-500 dark:text-gray-400 break-words mt-0.5">
                {r.description}
              </p>
            )}
          </div>

          {/* Management actions — extreme-left edge, on the title line. */}
          {canManage && (
            <div className="flex items-center gap-0.5 shrink-0">
              <HeaderActionButton tone="edit" label="تعديل المورد" onClick={onEdit}>
                <Pencil className="w-4 h-4" />
              </HeaderActionButton>
              <HeaderActionButton tone="delete" label="حذف المورد" onClick={onDelete}>
                <Trash2 className="w-4 h-4" />
              </HeaderActionButton>
            </div>
          )}
        </div>

        {/* Meta: uploader, type and (owner-only) access code. */}
        <div className="flex items-center flex-wrap gap-2 mt-2.5">
          <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-dark-surface px-2 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300">
            <BookOpen className="w-3.5 h-3.5" />
            {r.uploadedBy}
          </span>

          <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-dark-surface px-2 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300">
            <Icon className="w-3.5 h-3.5" />
            {typeLabels[r.type]}
          </span>

          {canManage && r.isPrivate && (
            <button
              type="button"
              onClick={onCopyAccessCode}
              disabled={!r.accessCode}
              title="نسخ الرمز"
              aria-label="نسخ رمز الوصول"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 active:opacity-70 transition-opacity min-w-0 disabled:opacity-60"
            >
              <span className="font-mono font-bold tracking-wider" dir="ltr">
                {r.accessCode ?? 'غير متوفر'}
              </span>
              {copiedAccessCode ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </header>

      {/* Section boundary: header ↔ content. A subtle amber-tinted rule (fading
          at both ends) that reads as a distinct section break while staying
          lightweight — no card or background. Same pattern as the mobile Group
          Detail page. */}
      <div className="mt-4 h-0.5 rounded-full bg-gradient-to-l from-transparent via-amber-400/50 to-transparent dark:via-amber-500/40" />

      {/* Content — depends on resource type */}
      <section className="mt-4">
        <h2 className="text-[18px] font-bold text-gray-900 dark:text-white mb-1 px-0.5">
          {SECTION_TITLES[r.type]}
        </h2>

        {r.type === 'file' && (
          <>
            {canManage && remainingFiles > 0 && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFilesInput}
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mb-2 w-full flex items-center gap-2.5 rounded-xl border-2 border-dashed border-light-border dark:border-dark-border p-3 text-start active:border-amber-400 dark:active:border-amber-500 active:bg-amber-50/50 dark:active:bg-amber-900/10 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-white">رفع ملفات</p>
                    <p className="text-[11px] leading-tight text-gray-500 dark:text-gray-400 mt-0.5">
                      أضف ملفات جديدة لهذا المورد
                    </p>
                  </div>
                </button>
              </>
            )}

            {files.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[12px] text-gray-400 dark:text-gray-500">لا توجد ملفات بعد</p>
                <p className="text-[11px] leading-tight text-gray-400 dark:text-gray-500 mt-1">
                  {canManage ? 'ستظهر الملفات المرفوعة بهذا المورد هنا.' : 'لا توجد ملفات مرفوعة بهذا المورد.'}
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <h3 className="text-[15px] font-bold text-gray-900 dark:text-white mb-1 px-0.5">
                  المحتوى المضاف
                </h3>
                <ul className="divide-y divide-light-border dark:divide-dark-border">
                  {files.map((f) => (
                    <FileRow
                      key={f.id}
                      file={f}
                      canManage={canManage}
                      onDownload={() => onDownloadFile(f)}
                      onRemove={() => onRemoveFile(f)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {r.type === 'note' && (
          <>
            {canManage && (
              <button
                type="button"
                onClick={onAddNote}
                className="mb-2 w-full flex items-center gap-2.5 rounded-xl border-2 border-dashed border-light-border dark:border-dark-border p-3 text-start active:border-amber-400 dark:active:border-amber-500 active:bg-amber-50/50 dark:active:bg-amber-900/10 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-white">إضافة ملاحظة</p>
                  <p className="text-[11px] leading-tight text-gray-500 dark:text-gray-400 mt-0.5">
                    أضف ملاحظة جديدة لهذا المورد
                  </p>
                </div>
              </button>
            )}

            {notes.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[12px] text-gray-400 dark:text-gray-500">لا توجد ملاحظات بعد</p>
                <p className="text-[11px] leading-tight text-gray-400 dark:text-gray-500 mt-1">
                  {canManage ? 'ستظهر الملاحظات المضافة لهذا المورد هنا.' : 'لا توجد ملاحظات بهذا المورد.'}
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <h3 className="text-[15px] font-bold text-gray-900 dark:text-white mb-1 px-0.5">
                  المحتوى المضاف
                </h3>
                <ul className="divide-y divide-light-border dark:divide-dark-border">
                  {notes.map((n) => (
                    <NoteRow
                      key={n.id}
                      note={n}
                      canManage={canManage}
                      onView={() => onViewNote(n.id)}
                      onRemove={() => onRemoveNote(n)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {r.type === 'link' && (
          <>
            {canManage && (
              <button
                type="button"
                onClick={onAddLink}
                className="mb-2 w-full flex items-center gap-2.5 rounded-xl border-2 border-dashed border-light-border dark:border-dark-border p-3 text-start active:border-amber-400 dark:active:border-amber-500 active:bg-amber-50/50 dark:active:bg-amber-900/10 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-white">إضافة رابط</p>
                  <p className="text-[11px] leading-tight text-gray-500 dark:text-gray-400 mt-0.5">
                    أضف رابطاً مفيداً لهذا المورد
                  </p>
                </div>
              </button>
            )}

            {links.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[12px] text-gray-400 dark:text-gray-500">لا توجد روابط بعد</p>
                <p className="text-[11px] leading-tight text-gray-400 dark:text-gray-500 mt-1">
                  {canManage ? 'ستظهر الروابط المضافة لهذا المورد هنا.' : 'لا توجد روابط بهذا المورد.'}
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <h3 className="text-[15px] font-bold text-gray-900 dark:text-white mb-1 px-0.5">
                  المحتوى المضاف
                </h3>
                <ul className="divide-y divide-light-border dark:divide-dark-border">
                  {links.map((l) => (
                    <LinkRow
                      key={l.id}
                      link={l}
                      canManage={canManage}
                      onOpen={() => onOpenLink(l)}
                      onRemove={() => onRemoveLink(l)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
