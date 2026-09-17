import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/UI/Button';
import { Select } from '@/components/UI/Input';
import { Card } from '@/components/UI/Card';
import { MAX_VIDEO_SIZE_MB, compressVideoFile } from '@/services/mediaApi';
import type { CompressionPreset } from '@/services/mediaApi';
import {
  ToolBody,
  MediaUploadZone,
  SelectedFileInfo,
  VideoPreview,
  ProcessingPanel,
  ResultCard,
  ErrorCard,
  ToolTips,
  downloadResult,
  formatBytes,
  useMediaProcessor,
} from './shared';

const COMPRESSION_PRESETS: { value: CompressionPreset; label: string; description: string }[] = [
  { value: 'light', label: 'ضغط خفيف', description: 'أعلى جودة ممكنة مع تقليل معتدل في الحجم' },
  { value: 'medium', label: 'ضغط متوسط', description: 'توازن جيد بين الحجم والجودة (موصى به)' },
  { value: 'strong', label: 'ضغط قوي', description: 'أصغر حجم ممكن مع جودة مقبولة' },
];

export function CompressVideo() {
  const { file, processing, progress, result, error, handleFile, clearFile, run, cancel, fullReset } = useMediaProcessor();
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [preset, setPreset] = useState<CompressionPreset>('medium');

  const handleCompress = useCallback(() => {
    run((onProgress, job) => compressVideoFile(file!, preset, onProgress, job));
  }, [run, file, preset]);

  const outputSize = result?.blob.size ?? 0;
  const originalSize = file?.size ?? 0;
  const savedBytes = originalSize - outputSize;
  const reductionPercent = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;

  return (
    <ToolBody>
      {!file && (
        <MediaUploadZone
          label="ارفع فيديو لضغطه"
          description={`يعيد الخادم ترميز الفيديو لتقليل حجمه — حتى ${MAX_VIDEO_SIZE_MB} ميغابايت.`}
          onFilesSelected={handleFile}
        />
      )}
      {file && (
        <>
          <SelectedFileInfo file={file} onRemove={clearFile} />
          <VideoPreview file={file} videoRef={videoRef} />
          <Select
            label="مستوى الضغط"
            value={preset}
            onChange={(e) => setPreset(e.target.value as CompressionPreset)}
            options={COMPRESSION_PRESETS.map((p) => ({ value: p.value, label: `${p.label} — ${p.description}` }))}
          />
          <Card padding="sm" className="bg-gray-50 dark:bg-dark-surface">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500 dark:text-gray-400">الحجم الأصلي:</span> <span className="font-semibold text-gray-800 dark:text-gray-200">{formatBytes(originalSize)}</span></div>
              <div><span className="text-gray-500 dark:text-gray-400">الصيغة:</span> <span className="font-semibold text-gray-800 dark:text-gray-200">{file.type || 'غير معروف'}</span></div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              نسبة التقليل تعتمد على محتوى الفيديو الأصلي ودرجة ضغطه الحالية.
            </p>
          </Card>
        </>
      )}
      {processing && progress && <ProcessingPanel progress={progress} onCancel={() => void cancel()} />}
      {error && <ErrorCard message={error} />}
      {result && (
        <ResultCard
          result={result}
          onDownload={() => downloadResult(result)}
          onReset={fullReset}
          extraInfo={
            savedBytes > 0 ? (
              <div className="grid grid-cols-2 gap-3 text-sm rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 p-3">
                <div><span className="text-gray-500 dark:text-gray-400">الحجم الأصلي:</span> <span className="font-semibold text-gray-800 dark:text-gray-200">{formatBytes(originalSize)}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">الحجم الجديد:</span> <span className="font-semibold text-gray-800 dark:text-gray-200">{formatBytes(outputSize)}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">تم توفير:</span> <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatBytes(savedBytes)}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">نسبة التقليل:</span> <span className="font-semibold text-emerald-600 dark:text-emerald-400">{reductionPercent}%</span></div>
              </div>
            ) : (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                لم يتم تقليل حجم هذا الملف؛ يبدو أنه مضغوط مسبقًا بكفاءة عالية. جرّب مستوى ضغط أقوى أو استخدم الملف كما هو.
              </p>
            )
          }
        />
      )}
      {file && !result && !processing && (
        <Button onClick={handleCompress} loading={processing} className="w-full"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>}
        >
          ضغط الفيديو
        </Button>
      )}
      
    </ToolBody>
  );
}

export { CompressVideo as default };
