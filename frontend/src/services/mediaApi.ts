import { toNetworkError } from './apiError';
import { API_BASE } from './apiBase';

const API_BASE_URL = API_BASE;

// Must stay in sync with the backend limits (MAX_VIDEO_SIZE_MB env var).
export const MAX_VIDEO_SIZE_MB = Number(
  import.meta.env.VITE_MAX_VIDEO_SIZE_MB || 100
);

export const ACCEPTED_VIDEO_EXTENSIONS = [
  '.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v',
  '.wmv', '.flv', '.3gp', '.mpg', '.mpeg', '.ts', '.ogv',
];

// Must stay in sync with the backend limits (MAX_IMAGE_SIZE_MB env var).
export const MAX_IMAGE_SIZE_MB = Number(
  import.meta.env.VITE_MAX_IMAGE_SIZE_MB || 50
);

export const ACCEPTED_IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.avif',
];

// Audio tools (server-side FFmpeg + Whisper processing).
// Must stay in sync with the backend limits (MAX_AUDIO_SIZE_MB env var).
export const MAX_AUDIO_SIZE_MB = Number(
  import.meta.env.VITE_MAX_AUDIO_SIZE_MB || 100
);

export const ACCEPTED_AUDIO_EXTENSIONS = [
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.webm', '.flac',
];

export type AudioToolCleanStrength = 'light' | 'medium' | 'strong';
export const AUDIO_FADE_MAX_SECONDS = 10;
export const MIN_AUDIO_MERGE_FILES = 2;
export const MAX_AUDIO_MERGE_FILES = 10;

export const STT_LANGUAGES: { value: string; label: string }[] = [
  { value: 'auto', label: 'كشف تلقائي' },
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
  { value: 'fa', label: 'فارسی' },
  { value: 'ur', label: 'اردو' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
];

export type AudioFormat = 'mp3' | 'wav' | 'm4a';
export type AudioQuality = 'high' | 'standard';
export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'mkv';
export type CompressionPreset = 'light' | 'medium' | 'strong';

export type ResizePresetKey = '1080p' | '720p' | '480p' | '360p' | 'custom';
export type RotateDegrees = 0 | 90 | 180 | 270;
export type FlipMode = 'none' | 'h' | 'v';
export type AudioEditMode = 'remove' | 'replace' | 'mix' | 'volume';

export type ImageFitMode = 'inside' | 'cover' | 'contain' | 'fill';
export type ImageBlurEffect = 'blur' | 'pixelate';
export type WatermarkPosition =
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right';

export interface CropRegionInput {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Client-side mirror of the backend image limits (image.types.ts). */
export const IMAGE_DIMENSION_MIN = 8;
export const IMAGE_DIMENSION_MAX = 7680;
export const BG_TOLERANCE_MIN = 1;
export const BG_TOLERANCE_MAX = 100;
export const BG_TOLERANCE_DEFAULT = 25;
export const ADJUST_LIMITS = {
  brightness: { min: 50, max: 150, default: 100 },
  saturation: { min: 0, max: 200, default: 100 },
  contrast: { min: -100, max: 100, default: 0 },
  blur: { min: 0, max: 20, default: 0 },
  sharpen: { min: 0, max: 30, default: 0 },
} as const;
export const BLUR_INTENSITY_MIN = 2;
export const BLUR_INTENSITY_MAX = 20;
export const BLUR_INTENSITY_DEFAULT = 6;
export const WATERMARK_TEXT_MAX_LENGTH = 60;
export const WATERMARK_POSITIONS: WatermarkPosition[] = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
];

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
export const GIF_FPS_MIN = 5;
export const GIF_FPS_MAX = 20;
export const GIF_FPS_DEFAULT = 10;
export const GIF_WIDTH_DEFAULT = 480;
export const MIN_MERGE_FILES = 2;
/** Product decision: the merge tool accepts at most 5 clips (UI + API). */
export const MAX_MERGE_FILES = 5;

export interface EditVideoOptions {
  /** Named height preset; required when mode is "custom". */
  preset?: ResizePresetKey;
  customWidth?: number;
  customHeight?: number;
  rotate?: RotateDegrees;
  flip?: FlipMode;
}

export interface EditVideoAudioOptions {
  mode: AudioEditMode;
  /** 0–200 percent applied to the resulting track. */
  volume?: number;
  /** Required for replace/mix. */
  audioFile?: File;
}

export interface GifOptions {
  start?: number;
  end?: number;
  fps: number;
  width: number;
}

export type MediaPhase = 'uploading' | 'processing' | 'downloading';

export interface MediaProgress {
  phase: MediaPhase;
  /** 0..100 when measurable; null means indeterminate. */
  percent: number | null;
}

export type MediaProgressHandler = (progress: MediaProgress) => void;

export interface MediaResult {
  blob: Blob;
  filename: string;
}

/** Backend error carrying a machine-readable code for Arabic mapping. */
export class MediaApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MediaApiError';
    this.code = code;
  }
}

const OFFLINE_MESSAGE_AR =
  'أنت غير متصل بالإنترنت أو لا يمكن الوصول إلى خادم المعالجة. تتطلب معالجة الفيديو اتصالاً بالخادم.';

const IMAGE_OFFLINE_MESSAGE_AR =
  'أنت غير متصل بالإنترنت أو لا يمكن الوصول إلى خادم المعالجة. تتطلب معالجة الصور اتصالاً بالخادم.';

const AUDIO_OFFLINE_MESSAGE_AR =
  'أنت غير متصل بالإنترنت أو لا يمكن الوصول إلى خادم المعالجة. تتطلب معالجة الصوت اتصالاً بالخادم.';

export type MediaErrorKind = 'video' | 'image' | 'audio';

/**
 * Map backend error codes/messages to clear Arabic messages.
 * Raw technical details (FFmpeg stderr etc.) are never shown to users.
 * `kind` only switches the wording of generic messages (file/video/image).
 */
export function toArabicMediaError(err: unknown, kind: MediaErrorKind = 'video'): string {
  const offlineMessage =
    kind === 'image' ? IMAGE_OFFLINE_MESSAGE_AR :
    kind === 'audio' ? AUDIO_OFFLINE_MESSAGE_AR :
    OFFLINE_MESSAGE_AR;

  if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'NETWORK_ERROR') {
    return offlineMessage;
  }

  let code = '';
  let detail = '';
  if (err instanceof MediaApiError) {
    code = err.code;
    detail = err.message;
  } else if (err instanceof Error) {
    detail = err.message;
  } else if (typeof err === 'object' && err !== null) {
    const e = err as { code?: string; error?: string };
    code = e.code || '';
    detail = e.error || '';
  }

  // Specific backend validation messages first (matched on stable English
  // fragments), so new tools can show precise guidance instead of a generic
  // "unsupported conversion" notice.
  if (/removable background/i.test(detail)) {
    return 'لم يتم العثور على خلفية موحّدة قابلة للإزالة في هذه الصورة. جرّب زيادة قيمة التسامح أو استخدم صورة بخلفية بلون واحد.';
  }
  if (/whole image matched/i.test(detail)) {
    return 'تمت مطابقة معظم الصورة مع لون الخلفية. اختر قيمة تسامح أقل وأعد المحاولة.';
  }
  if (/(crop region|Region \d+) extends|beyond the image bounds/i.test(detail)) {
    return 'المنطقة المحددة تتجاوز حدود الصورة. عدّل الإحداثيات أو الأبعاد لتقع داخل حدود الصورة.';
  }
  if (/is malformed|payload is malformed/i.test(detail)) {
    return 'بيانات المناطق المحددة غير صحيحة. أعد تحديد المناطق وحاول مرة أخرى.';
  }
  if (/at least one region to hide/i.test(detail)) {
    return 'حدد منطقة واحدة على الأقل لإخفائها على الصورة.';
  }
  if (/volume, fades, normalization or clarity/i.test(detail)) {
    return 'اختر تعديلًا واحدًا على الأقل: مستوى الصوت، التلاشي، التنعيم أو وضوح الصوت.';
  }
  if (/one adjustment/i.test(detail)) {
    return 'اختر تعديلًا واحدًا على الأقل (سطوع، تشبع، تباين، ضبابية أو حدة) قبل المتابعة.';
  }
  if (/rotation or flip/i.test(detail)) {
    return 'اختر تدويرًا أو قلبًا واحدًا على الأقل قبل المتابعة.';
  }
  if (/target width/i.test(detail)) {
    return `أدخل عرضًا أو ارتفاعًا مستهدفًا للصورة (بين ${IMAGE_DIMENSION_MIN} و${IMAGE_DIMENSION_MAX} بكسل).`;
  }
  if (/watermark text of up to/i.test(detail)) {
    return `نص العلامة المائية فارغ أو يتجاوز الحد المسموح (${WATERMARK_TEXT_MAX_LENGTH} حرفًا).`;
  }
  if (/Upload a logo image/i.test(detail)) {
    return 'يرجى اختيار صورة الشعار لإضافة العلامة المائية.';
  }
  if (/hex value/i.test(detail)) {
    return 'قيمة اللون غير صحيحة. استخدم الصيغة السداسية مثل #FFFFFF.';
  }
  if (/megapixels/i.test(detail)) {
    return 'أبعاد هذه الصورة كبيرة جدًا على الخادم (الحد الأقصى 100 ميغابكسل). جرّب صورة أصغر.';
  }
  if (/end time must be greater/i.test(detail)) {
    return 'وقت النهاية يجب أن يكون بعد وقت البداية.';
  }
  if (/segment is too short/i.test(detail)) {
    return 'المقطع المحدد قصير جدًا.';
  }
  if (/at least one change|Choose at least one/i.test(detail)) {
    return 'اختر تعديلًا واحدًا على الأقل: تغيير الحجم أو التدوير أو القلب.';
  }
  if (/Custom dimensions must be even/i.test(detail)) {
    return 'يجب أن تكون الأبعاد المخصصة أرقامًا زوجية صحيحة داخل النطاق المسموح.';
  }
  if (/no audio track, so there is nothing to adjust/i.test(detail)) {
    return 'لا يحتوي هذا الفيديو على مسار صوتي، فلا يمكن تعديل الصوت.';
  }
  if (/Upload an audio file/i.test(detail)) {
    return 'يرجى رفع ملف صوتي لإتمام هذه العملية.';
  }
  if (/some have sound and others do not/i.test(detail)) {
    return 'لا يمكن دمج هذه المقاطع معًا: بعضها يحتوي على صوت وبعضها لا. استخدم مقاطع تشترك في وجود الصوت أو غيابه.';
  }
  if (/at least \d+ videos to merge/i.test(detail)) {
    return `اختر مقطعين على الأقل لدمجها.`;
  }
  if (/GIF clips are limited/i.test(detail)) {
    return 'مدة مقطع GIF محدودة بـ 60 ثانية كحد أقصى.';
  }
  if (/too many frames/i.test(detail)) {
    return 'هذه الإعدادات ستنشئ إطارات كثيرة جدًا. قلّص مدة المقطع أو اختر FPS أقل.';
  }
  if (/Speed must be between/i.test(detail)) {
    return 'السرعة المدعومة بين 0.25× و4×. اختر قيمة ضمن هذا النطاق.';
  }
  if (/already playing at normal speed/i.test(detail)) {
    return 'الفيديو يعمل أصلًا بالسرعة العادية؛ اختر سرعة مختلفة.';
  }
  if (/numeric 'start' and 'end'/i.test(detail)) {
    return 'أدخل وقتي البداية والنهاية بالثواني بشكل صحيح.';
  }
  if (/Unsupported audio type/i.test(detail)) {
    return 'صيغة الملف الصوتي غير مدعومة. استخدم MP3 أو WAV أو M4A أو AAC أو OGG أو OPUS أو FLAC.';
  }
  if (/outside the duration of the audio/i.test(detail)) {
    return 'النطاق المحدد يتجاوز مدة الملف الصوتي. عدّل أوقات البداية والنهاية.';
  }
  if (/Fade durations must be between/i.test(detail)) {
    return `مدة التلاشي يجب أن تكون بين 0 و${AUDIO_FADE_MAX_SECONDS} ثوانٍ.`;
  }
  if (/Volume must be between 0 and 200 percent/i.test(detail)) {
    return 'مستوى الصوت يجب أن يكون بين 0 و200 بالمئة.';
  }
  if (/at least \d+ audio files/i.test(detail)) {
    return `اختر ${MIN_AUDIO_MERGE_FILES} ملفات صوتية على الأقل للدمج.`;
  }
  if (/up to \d+ audio files/i.test(detail)) {
    return `يمكنك دمج ما يصل إلى ${MAX_AUDIO_MERGE_FILES} ملفات صوتية.`;
  }
  if (/Audio longer than/i.test(detail)) {
    return 'لا يمكن تفريغ ملفات صوتية أطول من 15 دقيقة.';
  }
  if (/Unsupported language/i.test(detail)) {
    return 'اللغة المحددة غير مدعومة. اختر لغة من القائمة.';
  }
  if (/do not look like a valid audio file/i.test(detail)) {
    return 'محتوى الملف لا يطابق صيغة صوتية صالحة. تأكد من أن الملف لم يُفسَّد.';
  }

  switch (code) {
    case 'NO_AUDIO_TRACK':
      return 'هذا الفيديو لا يحتوي مسارًا صوتيًا، لذلك لا توجد موسيقى لإزالتها.';
    case 'UNSUPPORTED_FILE_TYPE':
      if (kind === 'image')
        return 'نوع الملف غير مدعوم. يرجى اختيار صورة بصيغة مدعومة (JPG أو PNG أو WEBP أو GIF أو BMP أو TIFF أو AVIF).';
      if (kind === 'audio')
        return 'نوع الملف غير مدعوم. اختر ملفًا صوتيًا بصيغة مدعومة (MP3، WAV، M4A، AAC، OGG، OPUS، WEBM أو FLAC).';
      return 'نوع الملف غير مدعوم. يرجى اختيار ملف فيديو صالح.';
    case 'FILE_TOO_LARGE':
      if (kind === 'image')
        return `حجم الصورة أكبر من الحد المسموح به (${MAX_IMAGE_SIZE_MB} ميغابايت).`;
      if (kind === 'audio')
        return `حجم الملف أكبر من الحد المسموح به (${MAX_AUDIO_SIZE_MB} ميغابايت).`;
      return `حجم الملف أكبر من الحد المسموح به (${MAX_VIDEO_SIZE_MB} ميغابايت).`;
    case 'INVALID_CONVERSION':
      if (kind === 'image')
        return 'الإعدادات المحددة غير صالحة لهذه العملية. راجع القيم المدخلة وأعد المحاولة.';
      if (kind === 'audio')
        return 'الإعدادات المحددة غير صالحة لمعالجة الصوت. راجع القيم وأعد المحاولة.';
      return 'التحويل المطلوب غير مدعوم. تأكد من اختيار صيغة مختلفة عن صيغة الملف الحالية.';
    case 'PROCESSING_TIMEOUT':
      if (kind === 'image')
        return 'استغرقت معالجة الصورة وقتًا أطول من المسموح فتم إيقافها. جرّب صورة أصغر.';
      if (kind === 'audio')
        return 'استغرقت معالجة الصوت وقتًا أطول من المسموح. جرّب ملفًا أصغر.';
      return 'استغرقت المعالجة وقتًا أطول من المسموح فتم إيقافها. جرّب ملفًا أصغر أو مستوى ضغط أخف.';
    case 'FFMPEG_NOT_AVAILABLE':
      if (kind === 'audio')
        return 'خدمة معالجة الصوت غير متوفرة على الخادم حاليًا. حاول لاحقًا.';
      return 'خدمة معالجة الفيديو غير متوفرة على الخادم حاليًا. حاول لاحقًا.';
    case 'STORAGE_ERROR':
      return 'لا توجد مساحة تخزين كافية على خادم المعالجة حاليًا.';
    case 'JOB_NOT_FOUND':
      return 'انتهت صلاحية مهمة المعالجة. يرجى إعادة المحاولة.';
    case 'JOB_PROCESSING':
      return 'ما زالت المعالجة جارية. انتظر حتى اكتمالها قبل التنزيل.';
  }

  if (detail.includes('corrupted')) {
    if (kind === 'image')
      return 'يبدو أن ملف الصورة تالف أو أنه ليس صورة قابلة للقراءة.';
    if (kind === 'audio')
      return 'يبدو أن الملف الصوتي تالفًا أو غير قابل للقراءة.';
    return 'يبدو أن ملف الفيديو تالف أو غير قابل للقراءة.';
  }
  if (detail.includes('no audio') || detail.includes('no audio track')) {
    return 'الملف لا يحتوي على مسار صوتي قابل للاستخراج.';
  }
  if (detail.includes('busy')) {
    return 'الخادم مشغول حاليًا بمعالجة ملفات أخرى. حاول بعد قليل.';
  }

  if (kind === 'audio')
    return 'حدث خطأ أثناء معالجة الصوت. قد يكون الملف تالفًا أو بصيغة غير مدعومة.';
  return kind === 'image'
    ? 'حدث خطأ أثناء معالجة الصورة. قد تكون الصورة تالفة أو بصيغة غير مدعومة.'
    : 'حدث خطأ أثناء معالجة الملف. قد يكون الملف تالفًا أو بصيغة غير مدعومة.';
}

function parseDispositionFilename(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // fall through to plain parsing
    }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1] : fallback;
}

interface JobDonePayload {
  status: 'done';
  fileName?: string;
  originalSize?: number;
  outputSize?: number;
}

type JobStatusResponse =
  | { status: 'processing'; progress: number }
  | { status: 'error'; code: string; error: string }
  | JobDonePayload;

/** POST the upload via XHR so we get real byte-level upload progress. */
function startMediaJob(
  endpoint: string,
  files: { field: string; file: File }[],
  fields: Record<string, string>,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string },
  offlineMessage: string = OFFLINE_MESSAGE_AR
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}${endpoint}`);
    xhr.responseType = 'json';

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          phase: 'uploading',
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    };

    xhr.onload = () => {
      const body = (xhr.response || {}) as { jobId?: string; code?: string; error?: string };
      if (xhr.status >= 200 && xhr.status < 300 && body.jobId) {
        if (cancelRef) cancelRef.jobId = body.jobId;
        resolve();
        return;
      }
      if (xhr.status === 0) {
        reject(toNetworkError(offlineMessage));
        return;
      }
      reject(new MediaApiError(body.code || 'PROCESSING_FAILED', body.error || `فشل بدء المعالجة (${xhr.status}).`));
    };

    xhr.onerror = () => reject(toNetworkError(offlineMessage));
    xhr.onabort = () => reject(toNetworkError(offlineMessage));

    const formData = new FormData();
    for (const { field, file } of files) {
      formData.append(field, file);
    }
    Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
    xhr.send(formData);
  });
}

const POLL_INTERVAL_MS = 1200;
const POLL_DEADLINE_MS = 25 * 60 * 1000;

/** Poll the job status endpoint, reporting REAL FFmpeg-derived progress. */
async function pollMediaJob(
  jobId: string,
  onProgress?: MediaProgressHandler,
  offlineMessage: string = OFFLINE_MESSAGE_AR
): Promise<JobDonePayload> {
  const deadline = Date.now() + POLL_DEADLINE_MS;
  let lastReported: number | null = -2;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/api/media/jobs/${encodeURIComponent(jobId)}/status`);
    } catch (error) {
      throw toNetworkError(offlineMessage, error);
    }

    let payload: JobStatusResponse;
    try {
      payload = (await response.json()) as JobStatusResponse;
    } catch {
      throw new MediaApiError('PROCESSING_FAILED', 'تعذر قراءة حالة المعالجة من الخادم.');
    }

    if (payload.status === 'error') {
      throw new MediaApiError(payload.code, payload.error);
    }

    if (payload.status === 'done') {
      return payload;
    }

    if (onProgress) {
      // progress < 0 means FFmpeg could not determine duration yet.
      const percent =
        payload.progress >= 0 ? Math.min(99, Math.round(payload.progress * 100)) : null;
      if (percent !== lastReported) {
        lastReported = percent;
        onProgress({ phase: 'processing', percent });
      }
    }
  }

  throw new MediaApiError('PROCESSING_TIMEOUT', 'انتهت مهلة انتظار المعالجة.');
}

/** Stream the finished file back, reporting real download progress. */
async function fetchMediaResult(
  jobId: string,
  fallbackName: string,
  onProgress?: MediaProgressHandler,
  offlineMessage: string = OFFLINE_MESSAGE_AR,
  subPath: '/download' | '/download-audio' = '/download'
): Promise<MediaResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/media/jobs/${encodeURIComponent(jobId)}${subPath}`);
  } catch (error) {
    throw toNetworkError(offlineMessage, error);
  }

  if (!response.ok) {
    let code = 'PROCESSING_FAILED';
    let message = `تعذر تنزيل الناتج (${response.status}).`;
    try {
      const body = (await response.json()) as { code?: string; error?: string };
      if (body.code) code = body.code;
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body
    }
    throw new MediaApiError(code, message);
  }

  const disposition = response.headers.get('content-disposition');
  const total = Number(response.headers.get('content-length')) || 0;

  let blob: Blob;
  if (response.body && total > 0 && onProgress) {
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value as unknown as BlobPart);
        received += value.byteLength;
        onProgress({
          phase: 'downloading',
          percent: Math.min(99, Math.round((received / total) * 100)),
        });
      }
    }
    onProgress({ phase: 'downloading', percent: 100 });
    blob = new Blob(chunks, { type: response.headers.get('content-type') || undefined });
  } else {
    blob = await response.blob();
    onProgress?.({ phase: 'downloading', percent: 100 });
  }

  return { blob, filename: parseDispositionFilename(disposition, fallbackName) };
}

async function runMediaOperation(
  endpoint: string,
  files: { field: string; file: File }[],
  fields: Record<string, string>,
  fallbackName: string,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string },
  offlineMessage: string = OFFLINE_MESSAGE_AR
): Promise<MediaResult> {
  onProgress?.({ phase: 'uploading', percent: 0 });
  await startMediaJob(endpoint, files, fields, onProgress, cancelRef, offlineMessage);
  onProgress?.({ phase: 'uploading', percent: 100 });
  onProgress?.({ phase: 'processing', percent: null });
  const done = await pollMediaJob(cancelRef?.jobId || '', onProgress, offlineMessage);
  const result = await fetchMediaResult(
    cancelRef?.jobId || '',
    done.fileName || fallbackName,
    onProgress,
    offlineMessage
  );
  return result;
}

function singleVideo(file: File): { field: string; file: File }[] {
  return [{ field: 'file', file }];
}

function singleImage(file: File): { field: string; file: File }[] {
  return [{ field: 'file', file }];
}

export async function extractAudioFromVideo(
  file: File,
  options: { format: AudioFormat; quality: AudioQuality },
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/extract-audio',
    singleVideo(file),
    { format: options.format, quality: options.quality },
    `${file.name.replace(/\.[^.]+$/, '')}-audio.${options.format}`,
    onProgress,
    cancelRef
  );
}

export async function compressVideoFile(
  file: File,
  preset: CompressionPreset,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/compress-video',
    singleVideo(file),
    { preset },
    `${file.name.replace(/\.[^.]+$/, '')}-compressed.mp4`,
    onProgress,
    cancelRef
  );
}

export async function convertVideoFile(
  file: File,
  target: VideoFormat,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/convert-video',
    singleVideo(file),
    { target },
    `${file.name.replace(/\.[^.]+$/, '')}-converted.${target}`,
    onProgress,
    cancelRef
  );
}

/** Trim a segment (stream copy — original quality preserved). */
export async function cutVideoFile(
  file: File,
  options: { start: number; end: number },
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/cut-video',
    singleVideo(file),
    { start: String(options.start), end: String(options.end) },
    `${file.name.replace(/\.[^.]+$/, '')}-cut.mp4`,
    onProgress,
    cancelRef
  );
}

export interface MusicRemovalResult {
  video: MediaResult;
  audio: MediaResult;
}

/**
 * Remove background music from a video using server-side Demucs
 * source separation. Returns BOTH the processed video and the
 * processed audio.
 *
 * Ordering matters: the audio output must be fetched BEFORE the video
 * download, because downloading the primary video output consumes the job
 * and removes its temporary files.
 */
export async function removeMusicFromVideo(
  file: File,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MusicRemovalResult> {
  await startMediaJob(
    '/api/media/remove-music',
    singleVideo(file),
    {},
    onProgress,
    cancelRef
  );
  onProgress?.({ phase: 'uploading', percent: 100 });
  onProgress?.({ phase: 'processing', percent: null });

  const done = await pollMediaJob(cancelRef?.jobId || '', onProgress);

  const base = file.name.replace(/\.[^.]+$/, '');
  const videoName = done.fileName || `${base}-no-music.mp4`;
  const audioName = `${base}-no-music.mp3`;

  // Fetch the audio output first (this endpoint does not claim the job).
  const audio = await fetchMediaResult(
    cancelRef?.jobId || '',
    audioName,
    undefined,
    OFFLINE_MESSAGE_AR,
    '/download-audio'
  );

  // Then fetch the primary video output (consumes the job + cleans up).
  const video = await fetchMediaResult(
    cancelRef?.jobId || '',
    videoName,
    onProgress,
    OFFLINE_MESSAGE_AR,
    '/download'
  );

  return { video, audio };
}

/** Resize / rotate / flip in one processing job. */
export async function editVideoFile(
  file: File,
  options: EditVideoOptions,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  const fields: Record<string, string> = {
    rotate: String(options.rotate ?? 0),
    flip: options.flip ?? 'none',
  };
  if (options.preset) fields.preset = options.preset;
  if (options.preset === 'custom') {
    fields.width = String(options.customWidth ?? '');
    fields.height = String(options.customHeight ?? '');
  }
  return runMediaOperation(
    '/api/media/edit-video',
    singleVideo(file),
    fields,
    `${file.name.replace(/\.[^.]+$/, '')}-edited.mp4`,
    onProgress,
    cancelRef
  );
}

/** Remove / add / replace audio or adjust volume. */
export async function editVideoAudioFile(
  file: File,
  options: EditVideoAudioOptions,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  const files = singleVideo(file);
  if ((options.mode === 'replace' || options.mode === 'mix') && options.audioFile) {
    files.push({ field: 'audio', file: options.audioFile });
  }
  const suffix =
    options.mode === 'remove'
      ? 'no-audio'
      : options.mode === 'replace'
        ? 'audio-replaced'
        : options.mode === 'mix'
          ? 'audio-mixed'
          : 'volume';
  return runMediaOperation(
    '/api/media/edit-video-audio',
    files,
    { mode: options.mode, volume: String(options.volume ?? 100) },
    `${file.name.replace(/\.[^.]+$/, '')}-${suffix}.mp4`,
    onProgress,
    cancelRef
  );
}

/** Merge clips in the given order into one MP4. */
export async function mergeVideoFiles(
  files: File[],
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  const parts = files.map((file) => ({ field: 'files', file }));
  return runMediaOperation(
    '/api/media/merge-videos',
    parts,
    {},
    `merged-${Date.now()}.mp4`,
    onProgress,
    cancelRef
  );
}

/** Render a GIF from an optional time window with palette optimization. */
export async function convertVideoToGif(
  file: File,
  options: GifOptions,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  const fields: Record<string, string> = {
    fps: String(options.fps),
    width: String(options.width),
  };
  if (options.start !== undefined) fields.start = String(options.start);
  if (options.end !== undefined) fields.end = String(options.end);
  return runMediaOperation(
    '/api/media/video-to-gif',
    singleVideo(file),
    fields,
    `${file.name.replace(/\.[^.]+$/, '')}.gif`,
    onProgress,
    cancelRef
  );
}

/** Change playback speed (video + audio together). */
export async function changeVideoSpeed(
  file: File,
  speed: number,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/change-speed',
    singleVideo(file),
    { speed: String(speed) },
    `${file.name.replace(/\.[^.]+$/, '')}-${String(speed).replace('.', '_')}x.mp4`,
    onProgress,
    cancelRef
  );
}

/* ------------------------------------------------------------------ */
/* Image tools (server-side sharp processing)                          */
/* ------------------------------------------------------------------ */

export interface ImageAdjustmentsOptions {
  /** 50–150 percent. */
  brightness?: number;
  /** 0–200 percent. */
  saturation?: number;
  /** -100..100. */
  contrast?: number;
  /** 0..20 sigma. */
  blur?: number;
  /** 0..30 strength. */
  sharpen?: number;
}

export interface RotateImageOptions {
  rotate: RotateDegrees;
  flip: FlipMode;
}

export interface HideRegionsOptions {
  regions: CropRegionInput[];
  effect: ImageBlurEffect;
  intensity?: number;
}

export interface WatermarkTextOptions {
  text: string;
  fontSizePercent?: number;
  opacityPercent?: number;
  color?: string;
  position?: WatermarkPosition;
  rotationDeg?: number;
}

export interface WatermarkLogoOptions {
  logoFile: File;
  sizePercent?: number;
  opacityPercent?: number;
  position?: WatermarkPosition;
}

export async function removeImageBackground(
  file: File,
  tolerance: number,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/image/remove-bg',
    singleImage(file),
    { tolerance: String(tolerance) },
    `${file.name.replace(/\.[^.]+$/, '')}-no-bg.png`,
    onProgress,
    cancelRef,
    IMAGE_OFFLINE_MESSAGE_AR
  );
}

export async function resizeImageFile(
  file: File,
  options: { width?: number; height?: number; fit: ImageFitMode; upscale?: boolean },
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  const fields: Record<string, string> = { fit: options.fit };
  if (options.width !== undefined) fields.width = String(options.width);
  if (options.height !== undefined) fields.height = String(options.height);
  if (options.upscale) fields.upscale = '1';
  return runMediaOperation(
    '/api/media/image/resize',
    singleImage(file),
    fields,
    `${file.name.replace(/\.[^.]+$/, '')}-resized.png`,
    onProgress,
    cancelRef,
    IMAGE_OFFLINE_MESSAGE_AR
  );
}

export async function cropImageFile(
  file: File,
  region: CropRegionInput,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/image/crop',
    singleImage(file),
    {
      left: String(Math.round(region.left)),
      top: String(Math.round(region.top)),
      width: String(Math.round(region.width)),
      height: String(Math.round(region.height)),
    },
    `${file.name.replace(/\.[^.]+$/, '')}-cropped.png`,
    onProgress,
    cancelRef,
    IMAGE_OFFLINE_MESSAGE_AR
  );
}

export async function rotateImageFile(
  file: File,
  options: RotateImageOptions,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/image/rotate',
    singleImage(file),
    { rotate: String(options.rotate), flip: options.flip },
    `${file.name.replace(/\.[^.]+$/, '')}-rotated.png`,
    onProgress,
    cancelRef,
    IMAGE_OFFLINE_MESSAGE_AR
  );
}

export async function adjustImageFile(
  file: File,
  adjustments: ImageAdjustmentsOptions,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  const fields: Record<string, string> = {};
  if (adjustments.brightness !== undefined) fields.brightness = String(adjustments.brightness);
  if (adjustments.saturation !== undefined) fields.saturation = String(adjustments.saturation);
  if (adjustments.contrast !== undefined) fields.contrast = String(adjustments.contrast);
  if (adjustments.blur !== undefined) fields.blur = String(adjustments.blur);
  if (adjustments.sharpen !== undefined) fields.sharpen = String(adjustments.sharpen);
  return runMediaOperation(
    '/api/media/image/adjust',
    singleImage(file),
    fields,
    `${file.name.replace(/\.[^.]+$/, '')}-adjusted.png`,
    onProgress,
    cancelRef,
    IMAGE_OFFLINE_MESSAGE_AR
  );
}

export async function hideImageRegions(
  file: File,
  options: HideRegionsOptions,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/image/blur-regions',
    singleImage(file),
    {
      regions: JSON.stringify(options.regions),
      effect: options.effect,
      intensity: String(options.intensity ?? BLUR_INTENSITY_DEFAULT),
    },
    `${file.name.replace(/\.[^.]+$/, '')}-hidden.png`,
    onProgress,
    cancelRef,
    IMAGE_OFFLINE_MESSAGE_AR
  );
}

const baseNameOf = (file: File): string => file.name.replace(/\.[^.]+$/, '');

export async function watermarkImageWithText(
  file: File,
  options: WatermarkTextOptions,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  const fields: Record<string, string> = {
    type: 'text',
    text: options.text,
    fontSize: String(options.fontSizePercent ?? 8),
    opacity: String(options.opacityPercent ?? 80),
    color: options.color || '#ffffff',
    position: options.position ?? 'bottom-right',
    rotation: String(options.rotationDeg ?? 0),
  };
  return runMediaOperation(
    '/api/media/image/watermark',
    singleImage(file),
    fields,
    `${baseNameOf(file)}-watermarked.png`,
    onProgress,
    cancelRef,
    IMAGE_OFFLINE_MESSAGE_AR
  );
}

export async function watermarkImageWithLogo(
  file: File,
  options: WatermarkLogoOptions,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  const files = [
    { field: 'file', file },
    { field: 'logo', file: options.logoFile },
  ];
  return runMediaOperation(
    '/api/media/image/watermark',
    files,
    {
      type: 'image',
      sizePercent: String(options.sizePercent ?? 25),
      opacity: String(options.opacityPercent ?? 80),
      position: options.position ?? 'bottom-right',
    },
    `${baseNameOf(file)}-watermarked.png`,
    onProgress,
    cancelRef,
    IMAGE_OFFLINE_MESSAGE_AR
  );
}

export async function stripImageMetadata(
  file: File,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/image/strip-metadata',
    singleImage(file),
    {},
    `${baseNameOf(file)}-clean.png`,
    onProgress,
    cancelRef,
    IMAGE_OFFLINE_MESSAGE_AR
  );
}

/* ------------------------------------------------------------------ */
/* Audio tools (server-side FFmpeg + Whisper processing)                */
/* ------------------------------------------------------------------ */

function singleAudio(file: File): { field: string; file: File }[] {
  return [{ field: 'file', file }];
}

/** Trim a segment from an audio file. */
export async function cutAudioFile(
  file: File,
  options: { start: number; end: number },
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/audio/cut',
    singleAudio(file),
    { start: String(options.start), end: String(options.end) },
    `${file.name.replace(/\.[^.]+$/, '')}-cut.mp3`,
    onProgress,
    cancelRef,
    AUDIO_OFFLINE_MESSAGE_AR
  );
}

/** Enhance audio: volume, fades, normalize, clarity. */
export async function enhanceAudioFile(
  file: File,
  options: {
    volume?: number;
    fadeIn?: number;
    fadeOut?: number;
    normalize?: boolean;
    clarity?: boolean;
  },
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  const fields: Record<string, string> = {};
  if (options.volume !== undefined && options.volume !== 100) fields.volume = String(options.volume);
  if (options.fadeIn !== undefined && options.fadeIn > 0) fields.fadeIn = String(options.fadeIn);
  if (options.fadeOut !== undefined && options.fadeOut > 0) fields.fadeOut = String(options.fadeOut);
  if (options.normalize) fields.normalize = 'true';
  if (options.clarity) fields.clarity = 'true';
  return runMediaOperation(
    '/api/media/audio/enhance',
    singleAudio(file),
    fields,
    `${file.name.replace(/\.[^.]+$/, '')}-enhanced.mp3`,
    onProgress,
    cancelRef,
    AUDIO_OFFLINE_MESSAGE_AR
  );
}

/** Clean audio: noise reduction with strength preset. */
export async function cleanAudioFile(
  file: File,
  strength: AudioToolCleanStrength,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/audio/clean',
    singleAudio(file),
    { strength },
    `${file.name.replace(/\.[^.]+$/, '')}-cleaned.mp3`,
    onProgress,
    cancelRef,
    AUDIO_OFFLINE_MESSAGE_AR
  );
}

/** Merge multiple audio files in order. */
export async function mergeAudioFiles(
  files: File[],
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  const parts = files.map((file) => ({ field: 'files', file }));
  return runMediaOperation(
    '/api/media/audio/merge',
    parts,
    {},
    `merged-${Date.now()}.mp3`,
    onProgress,
    cancelRef,
    AUDIO_OFFLINE_MESSAGE_AR
  );
}

/** Transcribe audio to text via Whisper. */
export async function transcribeAudioFile(
  file: File,
  language: string,
  onProgress?: MediaProgressHandler,
  cancelRef?: { jobId?: string }
): Promise<MediaResult> {
  return runMediaOperation(
    '/api/media/audio/transcribe',
    singleAudio(file),
    { language },
    `${file.name.replace(/\.[^.]+$/, '')}-transcript.txt`,
    onProgress,
    cancelRef,
    AUDIO_OFFLINE_MESSAGE_AR
  );
}

export async function cancelMediaJob(jobId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/media/jobs/${encodeURIComponent(jobId)}`,
      { method: 'DELETE' }
    );
    return response.ok;
  } catch {
    return false;
  }
}
