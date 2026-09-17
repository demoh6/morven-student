import { useCallback, useState } from 'react';
import { saveAs } from 'file-saver';
import { Button } from '@/components/UI/Button';
import { Input } from '@/components/UI/Input';
import { Card } from '@/components/UI/Card';
import { enhanceAudioFile, AUDIO_FADE_MAX_SECONDS } from '@/services/mediaApi';
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
  useAudioProcessor,
} from './shared';

export default function EnhanceAudioTool() {
  const {
    file, processing, progress, result, error,
    handleFile, clearFile, run, cancel, fullReset,
  } = useAudioProcessor();

  const [volume, setVolume] = useState(100);
  const [fadeIn, setFadeIn] = useState('');
  const [fadeOut, setFadeOut] = useState('');
  const [normalize, setNormalize] = useState(false);
  const [clarity, setClarity] = useState(false);
  const [touched, setTouched] = useState(false);

  const fadeInNum = fadeIn === '' ? 0 : Number(fadeIn);
  const fadeOutNum = fadeOut === '' ? 0 : Number(fadeOut);

  const hasAdjustment = volume !== 100 || fadeInNum > 0 || fadeOutNum > 0 || normalize || clarity;

  let validationError: string | null = null;
  if (touched && !hasAdjustment) {
    validationError = 'اختر تعديلًا واحدًا على الأقل: مستوى الصوت، التلاشي، التنعيم أو وضوح الصوت.';
  }
  if (fadeIn !== '' && (!Number.isFinite(fadeInNum) || fadeInNum < 0 || fadeInNum > AUDIO_FADE_MAX_SECONDS)) {
    validationError = `مدة التلاشي يجب أن تكون بين 0 و${AUDIO_FADE_MAX_SECONDS} ثوانٍ.`;
  }
  if (fadeOut !== '' && (!Number.isFinite(fadeOutNum) || fadeOutNum < 0 || fadeOutNum > AUDIO_FADE_MAX_SECONDS)) {
    validationError = `مدة التلاشي يجب أن تكون بين 0 و${AUDIO_FADE_MAX_SECONDS} ثوانٍ.`;
  }

  const handleProcess = useCallback(() => {
    setTouched(true);
    if (validationError || !file) return;
    run((onProgress, job) =>
      enhanceAudioFile(
        file,
        {
          volume,
          fadeIn: fadeInNum > 0 ? fadeInNum : undefined,
          fadeOut: fadeOutNum > 0 ? fadeOutNum : undefined,
          normalize,
          clarity,
        },
        onProgress,
        job
      )
    );
  }, [run, file, volume, fadeInNum, fadeOutNum, normalize, clarity, validationError]);

  return (
    <ToolBody>
      {!file && (
        <AudioUploadZone
          label="ارفع ملفًا صوتيًا لتحسينه"
          description="تحسين الصوت بضبط مستوى الصوت والتلاشي والتنعيم — حتى 100 ميغابايت."
          onFilesSelected={handleFile}
        />
      )}

      {file && (
        <>
          <SelectedFileInfo file={file} onRemove={clearFile} />
          <AudioPreview file={file} />

          <ToolSection title="تحسين الصوت" summary="اختر التعديلات المطلوبة ثم اضغط 'تحسين الصوت'.">
            <div className="space-y-4">
              <Input
                label={`مستوى الصوت: ${volume}%`}
                type="range"
                min={0}
                max={200}
                step={5}
                value={volume}
                onChange={(e) => { setVolume(Number(e.target.value)); setTouched(true); }}
                className="w-full"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="تلاشي الدخول (ثانية)"
                  type="number"
                  min={0}
                  max={AUDIO_FADE_MAX_SECONDS}
                  step={0.5}
                  inputMode="decimal"
                  value={fadeIn}
                  onChange={(e) => { setFadeIn(e.target.value); setTouched(true); }}
                  placeholder="0"
                />
                <Input
                  label="تلاشي الخروج (ثانية)"
                  type="number"
                  min={0}
                  max={AUDIO_FADE_MAX_SECONDS}
                  step={0.5}
                  inputMode="decimal"
                  value={fadeOut}
                  onChange={(e) => { setFadeOut(e.target.value); setTouched(true); }}
                  placeholder="0"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setNormalize(!normalize); setTouched(true); }}
                  className={`flex-1 rounded-xl border p-3 text-sm font-medium transition-colors ${
                    normalize
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-light-border dark:border-dark-border text-gray-600 dark:text-gray-400 hover:border-primary-300'
                  }`}
                >
                  تنعيم (Normalize)
                </button>
                <button
                  type="button"
                  onClick={() => { setClarity(!clarity); setTouched(true); }}
                  className={`flex-1 rounded-xl border p-3 text-sm font-medium transition-colors ${
                    clarity
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-light-border dark:border-dark-border text-gray-600 dark:text-gray-400 hover:border-primary-300'
                  }`}
                >
                  وضوح الصوت (Clarity)
                </button>
              </div>
            </div>

            {touched && validationError && (
              <p className="text-sm text-red-500" role="alert">{validationError}</p>
            )}
          </ToolSection>
        </>
      )}

      {processing && progress && <AudioProcessingPanel progress={progress} onCancel={() => void cancel()} />}
      {error && <ErrorCard message={error} />}
      {result && (
        <ResultCard
          result={result}
          onDownload={() => saveAs(result.blob, result.filename)}
          onReset={fullReset}
        />
      )}

      {file && !result && !processing && (
        <Button
          onClick={handleProcess}
          disabled={Boolean(validationError) || !hasAdjustment}
          loading={processing}
          className="w-full"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>}
        >
          تحسين الصوت
        </Button>
      )}

    
    </ToolBody>
  );
}
