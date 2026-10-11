import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { saveAs } from 'file-saver';
import { Card } from '@/components/UI/Card';
import { Button } from '@/components/UI/Button';
import { ProgressBar } from '@/components/UI/ProgressBar';
import { Badge } from '@/components/UI/Badge';
import { FileUpload, type FileUploadProps } from '@/components/UI/FileUpload';
import { useAppStore } from '@/store/useAppStore';
import { saveToLibrary } from '@/services/savedFilesService';
import { useOfflineNotice } from '@/hooks/useOnlineStatus';
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  MAX_VIDEO_SIZE_MB,
  cancelMediaJob,
  toArabicMediaError,
} from '@/services/mediaApi';
import type {
  MediaProgressHandler,
  MediaResult,
} from '@/services/mediaApi';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/** Formats seconds as m:ss.t for display next to time inputs. */
export function formatSecondsLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}

export interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

/** Re-exported from the canonical shared ToolHero component. */
export { ToolHeroHeader } from '@/pages/tools/ToolHero';

type MediaUploadZoneProps = {
  label: string;
  description: string;
} & Pick<FileUploadProps, 'multiple' | 'maxFiles' | 'onFilesSelected'>;

/** Single dropzone pattern shared by every video tool (click or drag-and-drop). */
export function MediaUploadZone({ label, description, multiple, maxFiles, onFilesSelected }: MediaUploadZoneProps) {
  return (
    <FileUpload
      accept={['video/*', ...ACCEPTED_VIDEO_EXTENSIONS]}
      maxSize={MAX_VIDEO_SIZE_MB * 1024 * 1024}
      readFileData={false}
      hideFileList
      multiple={multiple}
      maxFiles={maxFiles}
      onFilesSelected={onFilesSelected}
      label={label}
      description={description}
    />
  );
}

/** Optional tips list rendered under the workspace. */
export function ToolTips({ title = 'نصائح للحصول على أفضل نتيجة', items }: { title?: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card padding="sm" className="bg-sky-50/70 dark:bg-sky-900/15 border-sky-200/70 dark:border-sky-800/60">
      <p className="text-sm font-semibold text-sky-700 dark:text-sky-300 mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((tip) => (
          <li key={tip} className="flex items-start gap-2 text-xs text-sky-700/90 dark:text-sky-300/90">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Labeled group of controls inside the tool workspace. */
export function ToolSection({ title, summary, children }: {
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-light-border dark:border-dark-border p-4 space-y-3" aria-label={title}>
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
        {summary && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{summary}</p>}
      </div>
      {children}
    </section>
  );
}

export function VideoPreview({
  file,
  videoRef,
  onMeta,
}: {
  file: File;
  videoRef: React.RefObject<HTMLVideoElement>;
  onMeta?: (meta: VideoMeta) => void;
}) {
  const [url, setUrl] = useState<string>('');
  const [meta, setMeta] = useState<VideoMeta | null>(null);

  const handleLoaded = useCallback(() => {
    const el = videoRef.current;
    if (el && Number.isFinite(el.duration)) {
      const next = { duration: el.duration, width: el.videoWidth, height: el.videoHeight };
      setMeta(next);
      onMeta?.(next);
    }
  }, [videoRef, onMeta]);

  useEffect(() => {
    setMeta(null);
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-black">
        <video key={url} ref={videoRef} src={url} controls preload="metadata" className="w-full max-h-[400px] object-contain" onLoadedMetadata={handleLoaded} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="primary">{formatBytes(file.size)}</Badge>
        <Badge variant="secondary">{file.type || 'نوع غير معروف'}</Badge>
        {meta && (
          <>
            <Badge variant="info">{Math.floor(meta.duration)} ث</Badge>
            <Badge variant="neutral">{meta.width}x{meta.height}</Badge>
          </>
        )}
      </div>
    </div>
  );
}

export type ProgressState = { phase: 'uploading' | 'processing' | 'downloading'; percent: number | null };

const PHASE_LABELS: Record<ProgressState['phase'], string> = {
  uploading: 'جاري رفع الفيديو إلى خادم المعالجة...',
  processing: 'جارٍ معالجة الفيديو على الخادم...',
  downloading: 'جاري تنزيل الناتج...',
};

function IndeterminateBar() {
  const reducedMotion = useReducedMotion();
  return (
    <div
      className="w-full h-2.5 rounded-full bg-gray-200 dark:bg-dark-border overflow-hidden"
      role="progressbar"
      aria-label="المعالجة جارية"
    >
      {reducedMotion ? (
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary-500 via-primary-400 to-emerald-400" />
      ) : (
        <motion.div
          className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary-500 via-primary-400 to-emerald-400"
          initial={{ x: '-120%' }}
          animate={{ x: '360%' }}
          transition={{ repeat: Infinity, duration: 1.3, ease: 'linear' }}
        />
      )}
    </div>
  );
}

export function ProcessingPanel({ progress, onCancel, labels }: {
  progress: ProgressState;
  onCancel: () => void;
  /** Override the default (video-flavored) phase labels, e.g. for image tools. */
  labels?: Partial<Record<ProgressState['phase'], string>>;
} ) {
  const phaseLabels = { ...PHASE_LABELS, ...labels };
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-2 rounded-xl border border-light-border dark:border-dark-border p-4 bg-gray-50/60 dark:bg-dark-surface/60"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {phaseLabels[progress.phase]}
          {progress.percent !== null && (
            <span className="font-semibold text-gray-800 dark:text-gray-200 tabular-nums"> {Math.round(progress.percent)}%</span>
          )}
        </span>
        <Button variant="secondary" size="sm" onClick={onCancel} icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        }>
          إلغاء العملية
        </Button>
      </div>
      {progress.percent === null ? (
        <IndeterminateBar />
      ) : (
        <ProgressBar value={progress.percent} color="gradient" size="md" animated={false} />
      )}
      {progress.phase === 'processing' && progress.percent === null && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          قد تستغرق المعالجة عدة دقائق حسب حجم الملف وجودة الفيديو. يمكنك إلغاء العملية في أي وقت.
        </p>
      )}
    </motion.div>
  );
}

export function ResultCard({ result, extraInfo, onDownload, onReset }: {
  result: MediaResult;
  extraInfo?: React.ReactNode;
  onDownload: () => void;
  onReset: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
      role="status"
      aria-live="polite"
    >
      <Card padding="sm" className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">تمت العملية بنجاح</p>
        </div>
      </Card>

      <Card padding="sm">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-light-border dark:border-dark-border p-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate" dir="ltr">{result.filename}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">الحجم النهائي: {formatBytes(result.blob.size)}</p>
            </div>
          </div>
          <Badge variant="success" dot>جاهز</Badge>
        </div>

        {extraInfo && <div className="mt-3">{extraInfo}</div>}

        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Button className="flex-1" onClick={onDownload} icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          }>
            تنزيل الملف
          </Button>
          <Button variant="secondary" onClick={onReset}>
            معالجة ملف آخر
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

export function downloadResult(result: MediaResult): void {
  saveAs(result.blob, result.filename);
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="alert"
      aria-live="assertive"
    >
      <Card padding="sm" className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <div className="flex items-start gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <p className="font-semibold text-red-600 dark:text-red-400">تعذرت العملية</p>
            <p className="text-sm text-red-500 dark:text-red-300 mt-1">{message}</p>
            <p className="text-xs text-red-400/90 dark:text-red-300/70 mt-1.5">يمكنك تعديل الإعدادات وإعادة المحاولة.</p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export function OfflineNotice() {
  const showOffline = useOfflineNotice();
  if (!showOffline) return null;
  return (
    <Card padding="sm" className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
      <div className="flex items-start gap-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 shrink-0 mt-0.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          لا يوجد اتصال حاليًا. واجهة الأداة متاحة دون اتصال، لكن معالجة الفيديو تتم على خادم المعالجة وتتطلب اتصالًا بالإنترنت. أعد المحاولة عند توفر الاتصال.
        </p>
      </div>
    </Card>
  );
}

export type JobHandle = { jobId?: string; abortUpload?: () => void };

export function useMediaProcessor(options: {
  requireFile?: boolean;
  /** Library category the result is archived under (default: video tools). */
  libraryCategory?: string;
  /** Wording family used when mapping API errors to Arabic. */
  errorKind?: 'video' | 'image' | 'audio';
} = {}) {
  const { requireFile = true, libraryCategory = 'video-tools', errorKind = 'video' } = options;
  const { addNotification } = useAppStore();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<MediaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobRef = useRef<JobHandle>({});
  const cancelledRef = useRef(false);

  const processing = progress !== null;

  const handleFile = useCallback((files: { file: File; data: ArrayBuffer | string }[]) => {
    if (files.length > 0) {
      setFile(files[0].file);
      setResult(null);
      setError(null);
    }
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
  }, []);

  const run = useCallback(
    (task: (onProgress: MediaProgressHandler, job: JobHandle) => Promise<MediaResult>) => {
      if (processing || (requireFile && !file)) return;
      cancelledRef.current = false;
      jobRef.current = {};
      setResult(null);
      setError(null);
      setProgress({ phase: 'uploading', percent: 0 });
      void (async () => {
        try {
          const res = await task((p) => setProgress(p), jobRef.current);
          setResult(res);
          saveToLibrary(res.blob, res.filename, libraryCategory).catch(() => {});
          addNotification('تمت المعالجة بنجاح', 'success');
        } catch (err) {
          if (!cancelledRef.current) {
            setError(toArabicMediaError(err, errorKind));
          }
        } finally {
          setProgress(null);
        }
      })();
    },
    [file, processing, addNotification, requireFile, libraryCategory, errorKind]
  );

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    setProgress(null);
    const job = jobRef.current;
    job.abortUpload?.();
    if (job.jobId) {
      await cancelMediaJob(job.jobId);
    }
  }, []);

  const fullReset = useCallback(() => {
    cancelledRef.current = true;
    setFile(null);
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return { file, processing, progress, result, error, handleFile, clearFile, run, cancel, fullReset };
}

export function SelectedFileInfo({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-light-border dark:border-dark-border bg-gray-50/60 dark:bg-dark-surface/60 p-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">تم اختيار:</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate" dir="ltr">{file.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(file.size)}</p>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
        aria-label="إزالة الملف واختيار ملف آخر"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/** Shared wrapper giving every tool card the same layout and offline hint. */
export function ToolBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4" dir="rtl">
      <OfflineNotice />
      {children}
    </div>
  );
}
