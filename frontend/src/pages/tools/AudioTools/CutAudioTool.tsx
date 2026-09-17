import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { saveAs } from 'file-saver';
import { Button } from '@/components/UI/Button';
import { Input } from '@/components/UI/Input';
import { cutAudioFile } from '@/services/mediaApi';
import {
  AudioUploadZone,
  AudioPreview,
  AudioProcessingPanel,
  SelectedFileInfo,
  ToolBody,
  ToolSection,
  ToolTips,
  ResultCard,
  ErrorCard,
  formatBytes,
  formatTimecode,
  useAudioProcessor,
} from './shared';

export default function CutAudioTool() {
  const {
    file, processing, progress, result, error,
    handleFile, clearFile, run, cancel, fullReset,
  } = useAudioProcessor();
  const [duration, setDuration] = useState<number | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [touched, setTouched] = useState(false);

  const startNum = start === '' ? NaN : Number(start);
  const endNum = end === '' ? NaN : Number(end);

  let validationError: string | null = null;
  if (start === '' || end === '') {
    validationError = 'أدخل وقتي البداية والنهاية بالثواني.';
  } else if (!Number.isFinite(startNum) || !Number.isFinite(endNum) || startNum < 0 || endNum < 0) {
    validationError = 'أدخل قيمًا رقمية صحيحة للوقت.';
  } else if (endNum <= startNum) {
    validationError = 'وقت النهاية يجب أن يكون بعد وقت البداية.';
  } else if (endNum - startNum < 0.1) {
    validationError = 'المقطع المحدد قصير جدًا (الحد الأدنى 0.1 ثانية).';
  } else if (duration !== null && endNum > duration + 0.5) {
    validationError = 'وقت النهاية يتجاوز مدة الملف الصوتي.';
  }

  const handleProcess = useCallback(() => {
    setTouched(true);
    if (validationError || !file) return;
    run((onProgress, job) => cutAudioFile(file, { start: startNum, end: endNum }, onProgress, job));
  }, [run, file, startNum, endNum, validationError]);

  return (
    <ToolBody>
      {!file && (
        <AudioUploadZone
          label="ارفع ملفًا صوتيًا لقصه"
          description="قص الصوت على الخادم مع الحفاظ على الجودة الأصلية — حتى 100 ميغابايت."
          onFilesSelected={handleFile}
        />
      )}

      {file && (
        <>
          <SelectedFileInfo file={file} onRemove={clearFile} />

          <AudioPreview file={file} onDuration={setDuration} />

          <ToolSection title="نطاق القص" summary="حدد لحظتي البداية والنهاية بالثواني.">
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
                helperText={duration !== null ? `مدة الملف: ${formatTimecode(duration)}` : undefined}
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
                placeholder={`مثال: ${duration !== null ? Math.min(10, Math.floor(duration)) : 10}`}
                error={touched && (end === '' || !Number.isFinite(endNum)) ? 'قيمة غير صالحة' : undefined}
              />
            </div>
            {touched && validationError && (
              <p className="text-sm text-red-500" role="alert">{validationError}</p>
            )}
          </ToolSection>

          {duration !== null && (
            <div className="relative h-12 rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden border border-light-border dark:border-dark-border">
              {start !== '' && end !== '' && Number.isFinite(startNum) && Number.isFinite(endNum) && duration > 0 && (
                <motion.div
                  className="absolute top-0 bottom-0 bg-primary-500/20 border-x-2 border-primary-500"
                  initial={false}
                  animate={{
                    left: `${Math.max(0, (startNum / duration) * 100)}%`,
                    width: `${Math.min(100, ((endNum - startNum) / duration) * 100)}%`,
                  }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                {duration > 0 ? `0 — ${formatTimecode(duration)}` : ''}
              </div>
            </div>
          )}
        </>
      )}

      {processing && progress && <AudioProcessingPanel progress={progress} onCancel={() => void cancel()} />}
      {error && <ErrorCard message={error} />}
      {result && (
        <ResultCard
          result={result}
          extraInfo={
            <p className="text-xs text-gray-500 dark:text-gray-400">
              المقطع المقصوص: {formatTimecode(startNum)} — {formatTimecode(endNum)} ({formatTimecode(endNum - startNum)})
            </p>
          }
          onDownload={() => saveAs(result.blob, result.filename)}
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
          قص الصوت
        </Button>
      )}

      
    </ToolBody>
  );
}
