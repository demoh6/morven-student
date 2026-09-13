import { useEffect, useState, type FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card } from '@/components/UI/Card';
import { Modal } from '@/components/UI/Modal';
import { Button } from '@/components/UI/Button';
import { Input, TextArea, Select } from '@/components/UI/Input';
import { EmptyState } from '@/components/UI/EmptyState';
import { FileUpload } from '@/components/UI/FileUpload';
import { formatFileSize } from '@/utils/file';
import { APP_DISPLAY_LOCALE } from '@/utils/displayLocale';
import { typeLabels, typeIcons, typeOptions, type ResourceType } from '@/pages/connect/Resources/resources';
import {
  useResourcesStore,
  type ResourceFile,
  type ResourceLink,
} from '@/pages/connect/Resources/useResourcesStore';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { canManageResource } from '@/pages/connect/Resources/resourcePermissions';
import {
  BookOpen,
  ChevronLeft,
  Upload,
  Trash2,
  Download,
  FileText,
  StickyNote,
  ExternalLink,
  Plus,
  Link2,
  ExternalLink as ExternalLinkIcon,
  Pencil,
  Copy,
  Check,
  Lock,
  Unlock,
} from 'lucide-react';

const MAX_FILES = 10;

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export default function ResourceDetailPage() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const resources = useResourcesStore((s) => s.resources);
  const contentMap = useResourcesStore((s) => s.contentMap);
  const loading = useResourcesStore((s) => s.loading);
  const lockedResourceId = useResourcesStore((s) => s.lockedResourceId);
  const fetchResourceDetail = useResourcesStore((s) => s.fetchResourceDetail);
  const unlockResource = useResourcesStore((s) => s.unlockResource);
  const deleteResource = useResourcesStore((s) => s.deleteResource);
  const editResource = useResourcesStore((s) => s.editResource);
  const addFiles = useResourcesStore((s) => s.addFiles);
  const removeFile = useResourcesStore((s) => s.removeFile);
  const downloadFile = useResourcesStore((s) => s.downloadFile);
  const addNote = useResourcesStore((s) => s.addNote);
  const removeNote = useResourcesStore((s) => s.removeNote);
  const addLink = useResourcesStore((s) => s.addLink);
  const removeLink = useResourcesStore((s) => s.removeLink);
  const getContent = useResourcesStore((s) => s.getContent);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDepart, setConfirmDepart] = useState<ResourceLink | null>(null);

  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [viewNoteId, setViewNoteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<ResourceType>('file');
  const [editIsPrivate, setEditIsPrivate] = useState(false);

  const [accessCode, setAccessCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [copiedAccessCode, setCopiedAccessCode] = useState(false);

  useEffect(() => {
    if (resourceId) {
      void fetchResourceDetail(resourceId).then((r) => {
        if (r) {
          setEditTitle(r.title);
          setEditDescription(r.description ?? '');
          setEditType(r.type);
          setEditIsPrivate(r.isPrivate);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  const resource = resourceId ? resources.find((r) => r.id === resourceId) : undefined;

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!resourceId || accessCode.length !== 6) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      await unlockResource(resourceId, accessCode);
      const current = useResourcesStore.getState().resources.find((r) => r.id === resourceId);
      if (current) {
        setEditTitle(current.title);
        setEditDescription(current.description ?? '');
        setEditType(current.type);
        setEditIsPrivate(current.isPrivate);
      }
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'حدث خطأ في فتح المورد');
    } finally {
      setUnlocking(false);
    }
  };

  const visibilityOptions = [
    { value: 'public', label: 'عام' },
    { value: 'private', label: 'خاص' },
  ];

  // Lock screen — the resource exists in the store only after a successful
  // access-code entry; before that it's hidden behind the 403 + code UI.
  if (!loading && !resource && resourceId && lockedResourceId === resourceId) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center text-amber-500 dark:text-amber-400 mx-auto mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">هذا المورد خاص</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          أدخل رمز الوصول المكوّن من 6 أرقام لعرض محتوى هذا المورد
        </p>
        <form onSubmit={handleUnlock} className="space-y-4 text-start">
          <Input
            label="رمز الوصول"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            dir="ltr"
          />
          {unlockError && (
            <p className="text-sm text-red-500 text-center" role="alert">{unlockError}</p>
          )}
          <Button
            type="submit"
            loading={unlocking}
            disabled={accessCode.length !== 6}
            className="w-full"
            icon={<Unlock className="w-4 h-4" />}
          >
            فتح المورد
          </Button>
          <Link to="/connect/resources" className="block">
            <Button type="button" variant="ghost" className="w-full">العودة للموارد</Button>
          </Link>
        </form>
      </div>
    );
  }

  if (!loading && !resource) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-dark-surface flex items-center justify-center text-gray-300 dark:text-gray-600 mx-auto mb-4">
          <BookOpen className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">المورد غير موجود</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">المورد الذي تبحث عنه غير متوفر.</p>
        <Link to="/connect/resources">
          <Button variant="secondary">العودة للموارد</Button>
        </Link>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex justify-center" dir="rtl">
        <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const r = resource;
  const Icon = typeIcons[r.type];
  const canManage = canManageResource(user, r);
  const content = getContent(r.id);

  const handleCopyAccessCode = () => {
    if (!r.accessCode) return;
    navigator.clipboard.writeText(r.accessCode);
    setCopiedAccessCode(true);
    setTimeout(() => setCopiedAccessCode(false), 1500);
  };
  const files = content.files;
  const notes = content.notes;
  const links = content.links;
  const remainingFiles = MAX_FILES - files.length;

  const handleFilesSelected = async (
    selected: { file: File; data: ArrayBuffer | string }[],
  ) => {
    if (!canManage) return;
    setActionError(null);
    try {
      await addFiles(r.id, selected.map((s) => s.file));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ في رفع الملفات');
    }
  };

  const handleDownload = async (f: ResourceFile) => {
    setActionError(null);
    try {
      await downloadFile(r.id, f);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ في التحميل');
    }
  };

  const handleRemoveFile = async (f: ResourceFile) => {
    if (!canManage) return;
    setActionError(null);
    try {
      await removeFile(r.id, f.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ في حذف الملف');
    }
  };

  const handleAddNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage || !noteTitle.trim()) return;
    setActionError(null);
    try {
      await addNote(r.id, noteTitle.trim(), noteContent.trim());
      setNoteTitle('');
      setNoteContent('');
      setShowAddNote(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ في إضافة الملاحظة');
    }
  };

  const handleRemoveNote = async (n: { id: string }) => {
    if (!canManage) return;
    setActionError(null);
    try {
      await removeNote(r.id, n.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ في حذف الملاحظة');
    }
  };

  const handleAddLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage || !linkTitle.trim() || !linkUrl.trim()) return;
    setActionError(null);
    try {
      const url = linkUrl.trim();
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      await addLink(r.id, linkTitle.trim(), normalized);
      setLinkTitle('');
      setLinkUrl('');
      setShowAddLink(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ في إضافة الرابط');
    }
  };

  const handleRemoveLink = async (l: ResourceLink) => {
    if (!canManage) return;
    setActionError(null);
    try {
      await removeLink(r.id, l.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ في حذف الرابط');
    }
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setActionError(null);
    try {
      await editResource(r.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        type: editType,
        isPrivate: editIsPrivate,
      });
      setShowEdit(false);
      await fetchResourceDetail(r.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ في تعديل المورد');
    }
  };

  const handleDelete = async () => {
    if (!canManage) return;
    setActionError(null);
    try {
      await deleteResource(r.id);
      navigate('/connect/resources');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ في حذف المورد');
    }
  };

  const openDepart = (link: ResourceLink) => {
    setConfirmDepart(link);
  };

  const viewNote = notes.find((n) => n.id === viewNoteId);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" dir="rtl">
      {/* Back nav */}
      <motion.div {...fadeUp}>
        <Link
          to="/connect/resources"
          className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 mb-6 group"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:ps-1" />
          <span className="text-sm font-medium">الموارد</span>
        </Link>
      </motion.div>

      {actionError && (
        <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 p-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {actionError}
        </div>
      )}

      {/* Resource hero */}
      <motion.div {...fadeUp}>
        <Card padding="lg" className="mb-6 relative overflow-hidden">
          <div className="absolute -top-10 -end-10 w-40 h-40 rounded-full bg-amber-100/40 dark:bg-amber-900/15 blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md flex items-center justify-center shrink-0">
                <Icon className="w-7 h-7" />
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate mb-1">
                  {r.title}
                </h1>
                {r.description && (
                  <p className="text-gray-600 dark:text-gray-300 text-sm">{r.description}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" />
                {r.uploadedBy}
              </span>
              <span className="flex items-center gap-1.5">
                <Icon className="w-4 h-4" />
                {typeLabels[r.type]}
              </span>
            </div>

            {canManage && r.isPrivate && (
              <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-amber-600 dark:text-amber-400 block mb-0.5">رمز الوصول</span>
                  <span className="text-sm font-mono font-bold text-amber-700 dark:text-amber-300 tracking-wider" dir="ltr">
                    {r.accessCode ?? 'غير متوفر'}
                  </span>
                </div>
                <button
                  onClick={handleCopyAccessCode}
                  disabled={!r.accessCode}
                  className={`p-2 rounded-lg transition-colors ${r.accessCode ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30' : 'text-gray-300 dark:text-gray-600'}`}
                  title="نسخ الرمز"
                  aria-label="نسخ رمز الوصول"
                >
                  {copiedAccessCode ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}

            {canManage && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Pencil className="w-4 h-4" />}
                  onClick={() => setShowEdit(true)}
                >
                  تعديل
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 className="w-4 h-4" />}
                  onClick={() => setConfirmDelete(true)}
                >
                  حذف المورد
                </Button>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Content section — depends on resource type */}
      {r.type === 'file' && (
        <>
          {/* Upload Files Card (admin/owner only) */}
          {canManage && (
            <motion.div {...fadeUp}>
              <Card padding="lg" className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white">رفع ملفات</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {remainingFiles > 0
                        ? `${MAX_FILES - files.length} ملفات متبقية من أصل ${MAX_FILES}`
                        : `وصلت إلى الحد الأقصى (${MAX_FILES} ملفات)`}
                    </p>
                  </div>
                </div>

                {remainingFiles > 0 ? (
                  <FileUpload
                    readFileData={false}
                    multiple
                    maxFiles={remainingFiles}
                    hideFileList
                    label="اسحب الملفات هنا أو اضغط للتصفح"
                    description={`أضف حتى ${remainingFiles} ملف (الحد الأقصى ${MAX_FILES} ملف لكل مورد)`}
                    onFilesSelected={handleFilesSelected}
                  />
                ) : (
                  <div className="rounded-xl bg-gray-50 dark:bg-dark-surface border border-dashed border-light-border dark:border-dark-border p-6 text-center">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                      تم الوصول إلى الحد الأقصى للملفات
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      يمكن رفع حتى {MAX_FILES} ملفات لكل مورد. احذف أحد الملفات لإضافة ملف جديد.
                    </p>
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* Uploaded Files Display Card */}
          <motion.div {...fadeUp}>
            <Card padding="lg" className="mb-6">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">الملفات المرفوعة</h2>
              {files.length === 0 ? (
                <EmptyState
                  className="py-8"
                  icon={<FileText className="w-8 h-8" />}
                  title="لا توجد ملفات بعد"
                  description={canManage ? 'ستظهر الملفات المرفوعة بهذا المورد هنا.' : 'لا توجد ملفات مرفوعة بهذا المورد.'}
                />
              ) : (
                <div className="space-y-2">
                  {files.map((f) => (
                    <motion.div
                      key={f.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-dark-hover flex items-center justify-center text-gray-500 shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{f.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(f.size)} · {new Date(f.createdAt).toLocaleString(APP_DISPLAY_LOCALE)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleDownload(f)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                          title="تحميل"
                          aria-label={`تحميل ${f.name}`}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {canManage && (
                          <button
                            onClick={() => handleRemoveFile(f)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="حذف"
                            aria-label={`حذف ${f.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>
        </>
      )}

      {r.type === 'note' && (
        <>
          {/* Add Note Card (admin/owner only) */}
          {canManage && (
            <motion.div {...fadeUp}>
              <Card padding="lg" className="mb-6">
                <button
                  onClick={() => setShowAddNote(true)}
                  className="w-full flex items-center gap-3 rounded-xl border-2 border-dashed border-light-border dark:border-dark-border p-4 text-start hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
                    <Plus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">إضافة ملاحظة</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">أضف ملاحظة جديدة لهذا المورد</p>
                  </div>
                </button>
              </Card>
            </motion.div>
          )}

          {/* Notes Display Card */}
          <motion.div {...fadeUp}>
            <Card padding="lg" className="mb-6">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">الملاحظات</h2>
              {notes.length === 0 ? (
                <EmptyState
                  className="py-8"
                  icon={<StickyNote className="w-8 h-8" />}
                  title="لا توجد ملاحظات بعد"
                  description={canManage ? 'ستظهر الملاحظات المضافة لهذا المورد هنا.' : 'لا توجد ملاحظات بهذا المورد.'}
                />
              ) : (
                <div className="space-y-2">
                  {notes.map((n) => (
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border group"
                    >
                      <button
                        onClick={() => setViewNoteId(n.id)}
                        className="flex-1 min-w-0 flex items-center gap-2 text-start"
                      >
                        <StickyNote className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                          {n.title || 'بدون عنوان'}
                        </span>
                      </button>
                      {canManage && (
                        <button
                          onClick={() => handleRemoveNote(n)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                          title="حذف"
                          aria-label={`حذف ${n.title || 'الملاحظة'}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>
        </>
      )}

      {r.type === 'link' && (
        <>
          {/* Add Link Card (admin/owner only) */}
          {canManage && (
            <motion.div {...fadeUp}>
              <Card padding="lg" className="mb-6">
                <button
                  onClick={() => setShowAddLink(true)}
                  className="w-full flex items-center gap-3 rounded-xl border-2 border-dashed border-light-border dark:border-dark-border p-4 text-start hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
                    <Plus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">إضافة رابط</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">أضف رابطاً مفيداً لهذا المورد</p>
                  </div>
                </button>
              </Card>
            </motion.div>
          )}

          {/* Links Display Card */}
          <motion.div {...fadeUp}>
            <Card padding="lg" className="mb-6">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">الروابط المحفوظة</h2>
              {links.length === 0 ? (
                <EmptyState
                  className="py-8"
                  icon={<Link2 className="w-8 h-8" />}
                  title="لا توجد روابط بعد"
                  description={canManage ? 'ستظهر الروابط المضافة لهذا المورد هنا.' : 'لا توجد روابط بهذا المورد.'}
                />
              ) : (
                <div className="space-y-2">
                  {links.map((l) => (
                    <motion.div
                      key={l.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border group"
                    >
                      <button
                        onClick={() => openDepart(l)}
                        className="flex-1 min-w-0 flex items-center gap-2 text-start"
                      >
                        <ExternalLink className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                          {l.title}
                        </span>
                        <ExternalLinkIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      </button>
                      {canManage && (
                        <button
                          onClick={() => handleRemoveLink(l)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                          title="حذف"
                          aria-label={`حذف ${l.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>
        </>
      )}

      {/* Add Note Modal */}
      <Modal
        open={showAddNote}
        onClose={() => setShowAddNote(false)}
        title="إضافة ملاحظة"
        description="أضف ملاحظة جديدة لهذا المورد"
      >
        <form onSubmit={handleAddNote} className="space-y-4">
          <Input
            label="عنوان الملاحظة"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            required
            placeholder="مثال: أهم نقاط المراجعة"
          />
          <TextArea
            label="محتوى الملاحظة"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="اكتب محتوى الملاحظة هنا..."
            className="min-h-[140px]"
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowAddNote(false)} className="flex-1">إلغاء</Button>
            <Button type="submit" className="flex-1" icon={<Plus className="w-4 h-4" />}>إضافة</Button>
          </div>
        </form>
      </Modal>

      {/* View Note Modal */}
      <Modal
        open={viewNoteId !== null}
        onClose={() => setViewNoteId(null)}
        title={viewNote?.title || 'ملاحظة'}
      >
        <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line min-h-[80px]">
          {viewNote?.content?.trim() ? (
            viewNote.content
          ) : (
            <p className="text-gray-400 dark:text-gray-500">لا يوجد محتوى لهذه الملاحظة.</p>
          )}
        </div>
        <div className="flex gap-3 pt-4 mt-4 border-t border-light-border dark:border-dark-border">
          <Button type="button" variant="ghost" onClick={() => setViewNoteId(null)} className="flex-1">إغلاق</Button>
        </div>
      </Modal>

      {/* Add Link Modal */}
      <Modal
        open={showAddLink}
        onClose={() => setShowAddLink(false)}
        title="إضافة رابط"
        description="أضف رابطاً مفيداً لهذا المورد"
      >
        <form onSubmit={handleAddLink} className="space-y-4">
          <Input
            label="اسم الرابط"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            required
            placeholder="مثال: موقع المراجعات"
          />
          <Input
            label="عنوان الرابط (URL)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            required
            placeholder="https://example.com"
            dir="ltr"
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowAddLink(false)} className="flex-1">إلغاء</Button>
            <Button type="submit" className="flex-1" icon={<Plus className="w-4 h-4" />}>إضافة</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Resource Modal */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="تعديل المورد"
        description="عدّل بيانات المادة التعليمية"
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <Input
            label="اسم المادة"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />
          <TextArea
            label="الوصف (اختياري)"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
          <Select
            label="النوع"
            value={editType}
            onChange={(e) => setEditType(e.target.value as ResourceType)}
            options={typeOptions}
          />
          <Select
            label="الظهور"
            value={editIsPrivate ? 'private' : 'public'}
            onChange={(e) => setEditIsPrivate(e.target.value === 'private')}
            options={visibilityOptions}
          />
          {canManage && r.isPrivate && (
            <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
              عند تحويل المورد إلى عام سيتم حذف رمز الوصول ولم يعد الوصول مقيداً لأي طالب.
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowEdit(false)} className="flex-1">إلغاء</Button>
            <Button type="submit" className="flex-1" icon={<Pencil className="w-4 h-4" />}>حفظ</Button>
          </div>
        </form>
      </Modal>

      {/* Leave Morven confirmation */}
      <Modal
        open={confirmDepart !== null}
        onClose={() => setConfirmDepart(null)}
        title="مغادرة مورفن"
        description="أنت على وشك فتح رابط خارجي"
      >
        {confirmDepart && (
          <>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 p-4 mb-4">
              <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                سيتم فتح الرابط التالي في نافذة جديدة خارج موقع مورفن:
              </p>
              <p className="mt-2 text-sm font-mono font-medium text-amber-900 dark:text-amber-100 break-all" dir="ltr">
                {confirmDepart.url}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setConfirmDepart(null)} className="flex-1">إلغاء</Button>
              <Button
                className="flex-1"
                icon={<ExternalLinkIcon className="w-4 h-4" />}
                onClick={() => {
                  const url = confirmDepart.url;
                  setConfirmDepart(null);
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
              >
                فتح الرابط
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="حذف المورد"
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          هل أنت متأكد من حذف هذا المورد؟ سيتم حذف جميع محتوياته نهائياً ولا يمكن التراجع عن هذا الإجراء.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)} className="flex-1">إلغاء</Button>
          <Button variant="danger" onClick={handleDelete} className="flex-1">حذف</Button>
        </div>
      </Modal>
    </div>
  );
}
