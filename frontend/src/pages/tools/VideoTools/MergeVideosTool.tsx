import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveAs } from 'file-saver';
import { Button } from '@/components/UI/Button';
import { Badge } from '@/components/UI/Badge';
import {
  MAX_MERGE_FILES,
  MAX_VIDEO_SIZE_MB,
  MIN_MERGE_FILES,
  mergeVideoFiles,
} from '@/services/mediaApi';
import {
  ToolBody,
  MediaUploadZone,
  ProcessingPanel,
  ResultCard,
  ErrorCard,
  ToolTips,
  formatBytes,
  useMediaProcessor,
} from './shared';

function MergeVideosTool() {
  const {
    processing, progress, result, error,
    run, cancel, fullReset,
  } = useMediaProcessor({ requireFile: false });
  const [clips, setClips] = useState<File[]>([]);
  const [touched, setTouched] = useState(false);

  const handleFiles = useCallback((files: { file: File; data: ArrayBuffer | string }[]) => {
    setClips((prev) => [...prev, ...files.map((f) => f.file)].slice(0, MAX_MERGE_FILES));
  }, []);

  const removeClip = useCallback((index: number) => {
    setClips((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveClip = useCallback((index: number, direction: -1 | 1) => {
    setClips((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const notEnough = clips.length < MIN_MERGE_FILES;
  const atLimit = clips.length >= MAX_MERGE_FILES;

  const handleMerge = useCallback(() => {
    setTouched(true);
    if (notEnough) return;
    run((onProgress, job) => mergeVideoFiles(clips, onProgress, job));
  }, [run, clips, notEnough]);

  return (
    <ToolBody>
      {clips.length < MAX_MERGE_FILES && (
        <MediaUploadZone
          label="ارفع مقاطع الفيديو للدمج"
          description={`يمكنك دمج حتى ${MAX_MERGE_FILES} فيديوهات — حتى ${MAX_VIDEO_SIZE_MB} ميغابايت لكل ملف. تُدمج بالترتيب المحدد أدناه.`}
          multiple
          maxFiles={MAX_MERGE_FILES}
          onFilesSelected={handleFiles}
        />
      )}
      {atLimit && (
        <p className="text-xs text-center text-gray-500 dark:text-gray-400" role="status">
          وصلت إلى الحد الأقصى ({MAX_MERGE_FILES} فيديوهات). أزل مقطعًا لإضافة فيديو آخر.
        </p>
      )}

      <AnimatePresence>
        {clips.length > 0 && (
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
            aria-label="ترتيب المقاطع"
          >
            {clips.map((clip, index) => (
              <motion.li
                key={`${clip.name}-${index}`}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                layout
                className="flex items-center gap-2 rounded-xl border border-light-border dark:border-dark-border p-3 bg-gray-50 dark:bg-dark-surface"
              >
                <Badge variant="primary">{index + 1}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" dir="ltr">{clip.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(clip.size)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => moveClip(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    aria-label={`تحريك ${clip.name} لأعلى`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                  </button>
                  <button
                    onClick={() => moveClip(index, 1)}
                    disabled={index === clips.length - 1}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    aria-label={`تحريك ${clip.name} لأسفل`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  <button
                    onClick={() => removeClip(index)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    aria-label={`إزالة ${clip.name}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {touched && notEnough && (
        <p className="text-sm text-red-500" role="alert">اختر مقطعين على الأقل لدمجهما.</p>
      )}

      {processing && progress && <ProcessingPanel progress={progress} onCancel={() => void cancel()} />}
      {error && <ErrorCard message={error} />}
      {result && (
        <ResultCard
          result={result}
          onDownload={() => saveAs(result.blob, result.filename)}
          onReset={() => {
            setClips([]);
            fullReset();
          }}
        />
      )}
      {clips.length > 0 && !result && !processing && (
        <Button
          onClick={handleMerge}
          disabled={notEnough}
          loading={processing}
          className="w-full"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>}
        >
          دمج الفيديوهات
        </Button>
      )}
      {clips.length > 0 && !result && !processing && !notEnough && (
        <p className="text-xs text-center text-gray-500 dark:text-gray-400" role="status">
          سيتم دمج {clips.length} مقاطع بالترتيب الظاهر أعلاه{atLimit ? ` (الحد الأقصى ${MAX_MERGE_FILES})` : ''}.
        </p>
      )}
   
    </ToolBody>
  );
}

export { MergeVideosTool };
