import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/UI/Button';
import { Input } from '@/components/UI/Input';
import { MAX_VIDEO_SIZE_MB, cutVideoFile } from '@/services/mediaApi';
import {
  ToolBody,
  MediaUploadZone,
  VideoPreview,
  ProcessingPanel,
  ResultCard,
  ErrorCard,
  SelectedFileInfo,
  ToolTips,
  downloadResult,
  formatSecondsLabel,
  useMediaProcessor,
  type VideoMeta,
} from './shared';

function CutVideoTool() {
  const {
    file, processing, progress, result, error,
    handleFile, clearFile, run, cancel, fullReset,
  } = useMediaProcessor();
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [touched, setTouched] = useState(false);

  const onMeta = useCallback((next: VideoMeta) => setMeta(next), []);

  const startNum = start === '' ? NaN : Number(start);
  const endNum = end === '' ? NaN : Number(end);

  let validationError: string | null = null;
  if (start === '' || end === '') {
    validationError = 'أدخل وقتي البداية والنهاية بالثواني.';
  } else if (!Number.isFinite(startNum) || !Number.isFinite(endNum) || startNum < 0 || endNum < 0) {
    validationError = 'أدخل قيمًا رقمية صحيحة للوقت.';
  } else if (endNum <= startNum) {
    validationError = 'وقت النهاية يجب أن يكون بعد وقت البداية.';
  } else if (meta && endNum > meta.duration + 0.5) {
    validationError = 'وقت النهاية يتجاوز مدة الفيديو.';
  }

  const handleProcess = useCallback(() => {
    setTouched(true);
    if (validationError || !file) return;
    run((onProgress, job) => cutVideoFile(file, { start: startNum, end: endNum }, onProgress, job));
  }, [run, file, startNum, endNum, validationError]);

  return (
    <ToolBody>
      {!file && (
        <MediaUploadZone
          label="ارفع فيديو لقصه"
          description={`قص على خادم المعالجة دون إعادة ترميز للحفاظ على الجودة الأصلية — حتى ${MAX_VIDEO_SIZE_MB} ميغابايت.`}
          onFilesSelected={handleFile}
        />
      )}
      {file && (
        <>
          <SelectedFileInfo file={file} onRemove={clearFile} />
          <VideoPreview file={file} videoRef={videoRef} onMeta={onMeta} />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              label="وقت البداية (ثانية)"
              type="number"
              min={0}
              step={0.1}
              inputMode="decimal"
              value={start}
              onChange={(e) => { setStart(e.target.value); setTouched(true); }}
              placeholder="مثال: 0"
              helperText={meta ? `مدة الفيديو: ${formatSecondsLabel(meta.duration)} دقيقة` : undefined}
              error={touched && (start === '' || !Number.isFinite(startNum)) ? 'قيمة غير صالحة' : undefined}
            />
            <Input
              label="وقت النهاية (ثانية)"
              type="number"
              min={0}
              step={0.1}
              inputMode="decimal"
              value={end}
              onChange={(e) => { setEnd(e.target.value); setTouched(true); }}
              placeholder={`مثال: ${meta ? Math.min(10, Math.floor(meta.duration)) : 10}`}
              error={touched && (end === '' || !Number.isFinite(endNum)) ? 'قيمة غير صالحة' : undefined}
            />
          </div>
          {touched && validationError && (
            <p className="text-sm text-red-500" role="alert">{validationError}</p>
          )}
        </>
      )}
      {processing && progress && <ProcessingPanel progress={progress} onCancel={() => void cancel()} />}
      {error && <ErrorCard message={error} />}
      {result && (
        <ResultCard
          result={result}
          onDownload={() => downloadResult(result)}
          onReset={fullReset}
        />
      )}
      {file && !result && !processing && (
        <Button
          onClick={handleProcess}
          disabled={Boolean(validationError)}
          loading={processing}
          className="w-full"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>}
        >
          قص الفيديو
        </Button>
      )}
      
    </ToolBody>
  );
}

export { CutVideoTool };
