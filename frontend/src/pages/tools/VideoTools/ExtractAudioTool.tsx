import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/UI/Button';
import { Select } from '@/components/UI/Input';
import { MAX_VIDEO_SIZE_MB, extractAudioFromVideo } from '@/services/mediaApi';
import type { AudioFormat, AudioQuality } from '@/services/mediaApi';
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
  useMediaProcessor,
} from './shared';

export function AudioFormatOptions({ format, quality, onFormatChange, onQualityChange }: {
  format: AudioFormat;
  quality: AudioQuality;
  onFormatChange: (f: AudioFormat) => void;
  onQualityChange: (q: AudioQuality) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Select
        label="صيغة الصوت الناتج"
        value={format}
        onChange={(e) => onFormatChange(e.target.value as AudioFormat)}
        options={[
          { value: 'mp3', label: 'MP3 — الأكثر توافقًا (افتراضي)' },
          { value: 'm4a', label: 'M4A — جودة عالية بحجم أصغر' },
          { value: 'wav', label: 'WAV — بدون فقدان في الجودة' },
        ]}
      />
      {format !== 'wav' && (
        <Select
          label="جودة الصوت"
          value={quality}
          onChange={(e) => onQualityChange(e.target.value as AudioQuality)}
          options={[
            { value: 'high', label: 'عالية (حجم أكبر)' },
            { value: 'standard', label: 'قياسية (حجم أصغر)' },
          ]}
        />
      )}
    </div>
  );
}

export function ExtractAudioFromVideo() {
  const { file, processing, progress, result, error, handleFile, clearFile, run, cancel, fullReset } = useMediaProcessor();
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [format, setFormat] = useState<AudioFormat>('mp3');
  const [quality, setQuality] = useState<AudioQuality>('high');

  const handleProcess = useCallback(() => {
    run((onProgress, job) => extractAudioFromVideo(file!, { format, quality }, onProgress, job));
  }, [run, file, format, quality]);

  return (
    <ToolBody>
      {!file && (
        <MediaUploadZone
          label="ارفع ملف فيديو"
          description={`يدعم MP4  حتى ${MAX_VIDEO_SIZE_MB} ميغابايت`}
          onFilesSelected={handleFile}
        />
      )}
      {file && (
        <>
          <SelectedFileInfo file={file} onRemove={clearFile} />
          <VideoPreview file={file} videoRef={videoRef} />
          <AudioFormatOptions
            format={format}
            quality={quality}
            onFormatChange={setFormat}
            onQualityChange={setQuality}
          />
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
        <Button onClick={handleProcess} loading={processing} className="w-full"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>}
        >
          استخراج الصوت
        </Button>
      )}
     
    </ToolBody>
  );
}

export { ExtractAudioFromVideo as default };
