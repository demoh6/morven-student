import { useCallback, useState } from 'react';
import { saveAs } from 'file-saver';
import { Button } from '@/components/UI/Button';
import { TextArea } from '@/components/UI/Input';
import { Card } from '@/components/UI/Card';
import {
  STT_LANGUAGES,
  transcribeAudioFile,
} from '@/services/mediaApi';
import { saveToLibrary } from '@/services/savedFilesService';
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
import type { ProgressState, JobHandle } from './shared';
import type { MediaResult } from '@/services/mediaApi';

export default function SpeechToTextTool() {
  const {
    file, processing, progress, result, error,
    handleFile, clearFile, run, cancel, fullReset,
  } = useAudioProcessor();

  const [language, setLanguage] = useState('auto');
  const [transcript, setTranscript] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [jobProgress, setJobProgress] = useState<ProgressState | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<MediaResult | null>(null);

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setJobProgress({ phase: 'uploading', percent: 0 });
    setJobError(null);
    setTranscript('');

    try {
      const res = await transcribeAudioFile(file, language, (p) => setJobProgress(p), {});
      const text = await res.blob.text();
      setTranscript(text.trim());
      setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
      setJobResult(res);
    } catch (err) {
      const { toArabicMediaError } = await import('@/services/mediaApi');
      setJobError(toArabicMediaError(err, 'audio'));
    } finally {
      setJobProgress(null);
    }
  }, [file, language]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(transcript);
  }, [transcript]);

  const handleDownloadTxt = useCallback(() => {
    if (!jobResult) return;
    saveAs(jobResult.blob, jobResult.filename);
    saveToLibrary(jobResult.blob, jobResult.filename, 'audio-tools', 'text/plain').catch(() => {});
  }, [jobResult]);

  return (
    <ToolBody>
      {jobProgress && <AudioProcessingPanel progress={jobProgress} onCancel={() => void cancel()} />}

      {!file && !jobProgress && (
        <AudioUploadZone
          label="ارفع ملفًا صوتيًا للتفريغ"
          description="يدعم MP3 وWAV وM4A وAAC وOGG وOPUS وWEBM وFLAC — حتى 100 ميغابايت."
          onFilesSelected={handleFile}
        />
      )}

      {file && !jobProgress && !jobResult && (
        <>
          <SelectedFileInfo file={file} onRemove={() => { clearFile(); setTranscript(''); setJobResult(null); }} />

          <AudioPreview file={file} />

          <ToolSection title="إعدادات التفريغ">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">لغة الصوت</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-xl border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {STT_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400">اختر "كشف تلقائي" إذا لم تكن متأكدًا من اللغة.</p>
            </div>
          </ToolSection>

          <Button onClick={handleProcess} loading={processing} className="w-full" icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          }>
            بدء التفريغ
          </Button>
        </>
      )}

      {jobError && <ErrorCard message={jobError} />}

      {transcript && !jobProgress && (
        <ToolSection title="النص المفرغ" summary={`${wordCount} كلمة`}>
          <TextArea
            value={transcript}
            onChange={(e) => { setTranscript(e.target.value); setWordCount(e.target.value.trim().split(/\s+/).filter(Boolean).length); }}
            className="min-h-[200px] text-sm"
            placeholder="سيظهر النص المفرغ هنا..."
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleCopy} className="flex-1" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            }>
              نسخ النص
            </Button>
            <Button variant="secondary" onClick={handleDownloadTxt} className="flex-1" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            }>
              تنزيل TXT
            </Button>
          </div>
          <Button variant="secondary" onClick={() => { clearFile(); setTranscript(''); setJobResult(null); }} className="w-full">
            تفريغ ملف آخر
          </Button>
        </ToolSection>
      )}

      {!transcript && !jobProgress && !jobError && file && (
        <Card padding="sm" className="bg-amber-50/70 dark:bg-amber-900/15 border-amber-200/70 dark:border-amber-800/60">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            التفريغ يتم على الخادم باستخدام نموذج Whisper. قد تستغرق العملية بضع دقائق حسب طول الملف الصوتي.
          </p>
        </Card>
      )}

      <ToolTips items={[
        'يمكنك تحديد اللغة المطلوبة أو ترك الكشف التلقائي لتحديد اللغة من المحتوى.',
        'التفريغ الأفضل يكون مع ملفات صوتية واضحة ونقيّة، قلّل الضوضاء في الخلفية قدر الإمكان.',
        'اذا كان لديك ملف صوتي أكبر من 100 ميغا، يمكنك قصه واستخراجه على عدة ملفات بالترتيب المحدد.',
      ]} />
    </ToolBody>
  );
}
