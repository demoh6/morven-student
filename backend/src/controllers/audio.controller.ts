import { Request, Response } from "express";
import { MediaProcessingError } from "../services/media/media.types";
import {
  isValidVolumePercent,
  parseSeconds,
  removeUploadTempFiles,
  sanitizeBaseName,
} from "../services/media/media.utils";
import { MediaService } from "../services/media/media.service";
import {
  AUDIO_FADE_MAX_SECONDS,
  DEFAULT_MAX_STT_DURATION_SECONDS,
  isAudioCleanStrength,
  isSttLanguage,
  MAX_AUDIO_MERGE_FILES,
  MIN_AUDIO_CUT_SECONDS,
  MIN_AUDIO_MERGE_FILES,
  parseBoundedSeconds,
  STT_LANGUAGES,
} from "../services/media/audio.types";
import type { SttLanguage } from "../services/media/audio.types";
import { formatFromName, verifyUploadedAudioFile } from "../services/media/audio.utils";
import { AudioService } from "../services/media/audio.service";
import { probeMediaInfo } from "../services/media/ffmpeg.service";
import { MediaJobsService } from "../services/media/media-jobs.service";

function option(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function truthy(value: unknown): boolean {
  const v = option(value);
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

async function removeTempFiles(paths: (string | undefined)[]): Promise<void> {
  await removeUploadTempFiles(paths);
}

/**
 * Shared audio POST pipeline tail:
 * verify uploaded contents -> capacity/availability checks -> async job.
 * On any rejection every uploaded temp file of the request is removed.
 */
async function startAudioJob(
  res: Response,
  userId: string | undefined,
  options: {
    label: string;
    /** Uploaded temp files belonging to this request (cleaned on failure). */
    uploads: Express.Multer.File[];
    downloadName: () => string;
    run: (ctx: {
      signal: AbortSignal;
      onProgress: (fraction: number) => void;
    }) => Promise<{ outputPath: string; originalSize: number; outputSize: number }>;
  }
): Promise<void> {
  const paths = options.uploads.map((u) => u.path);
  try {
    for (const upload of options.uploads) {
      if (!(await verifyUploadedAudioFile(upload.path, upload.originalname))) {
        throw new MediaProcessingError(
          "UNSUPPORTED_FILE_TYPE",
          `The contents of "${upload.originalname}" do not look like a valid audio file.`,
          415
        );
      }
    }

    MediaJobsService.assertCapacity();
    const available = await MediaService.isAvailable();
    if (!available) {
      throw new MediaProcessingError(
        "FFMPEG_NOT_AVAILABLE",
        "Media processing is not available on the server (FFmpeg missing).",
        503
      );
    }

    const job = MediaJobsService.createJob(paths, options.downloadName(), userId);
    console.log(`[audio] job ${job.id} started (${options.label})`);
    MediaJobsService.start(job, "", (ctx) => options.run(ctx));
    res.status(202).json({ jobId: job.id });
  } catch (err) {
    await removeTempFiles(paths);
    if (err instanceof MediaProcessingError) {
      console.error(`[audio] ${options.label} rejected (${err.code}):`, err.message);
      res.status(err.status).json({ code: err.code, error: err.message });
      return;
    }
    console.error(`[audio] ${options.label} unexpected failure:`, err);
    res.status(500).json({
      code: "PROCESSING_FAILED",
      error: "Unexpected media processing error.",
    });
  }
}

export class AudioController {
  /**
   * POST /api/media/audio/cut
   * fields: start=<seconds>, end=<seconds> (end > start, ≥0.1s segment).
   */
  static async cut(req: Request, res: Response): Promise<void> {
    const uploaded = req.file;
    if (!uploaded) {
      res.status(400).json({
        code: "UNSUPPORTED_FILE_TYPE",
        error: "No file uploaded. Send an audio file as multipart/form-data with key 'file'.",
      });
      return;
    }

    if (
      req.body?.start === undefined ||
      req.body?.end === undefined
    ) {
      await removeTempFiles([uploaded.path]);
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: "Provide numeric 'start' and 'end' times in seconds.",
      });
      return;
    }
    const start = parseSeconds(req.body.start);
    const end = parseSeconds(req.body.end);
    if (start === null || end === null || end <= start) {
      await removeTempFiles([uploaded.path]);
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: "The end time must be a numeric value greater than the start time.",
      });
      return;
    }
    if (end - start < MIN_AUDIO_CUT_SECONDS) {
      await removeTempFiles([uploaded.path]);
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: "The selected segment is too short.",
      });
      return;
    }

    // When ffprobe can read the file, reject windows that start past its end.
    const info = await probeMediaInfo(uploaded.path);
    if (
      info &&
      info.durationSeconds !== null &&
      start >= info.durationSeconds - 0.05
    ) {
      await removeTempFiles([uploaded.path]);
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: "The selected range is outside the duration of the audio file.",
      });
      return;
    }

    const format = formatFromName(uploaded.originalname) ?? "mp3";
    await startAudioJob(res, req.user?.sub, {
      label: "audio/cut",
      uploads: [uploaded],
      downloadName: () =>
        `${sanitizeBaseName(uploaded.originalname)}-cut.${format}`,
      run: (ctx) => AudioService.cut(uploaded.path, format, start, end, ctx),
    });
  }

  /**
   * POST /api/media/audio/enhance
   * fields: volume=0..200, fadeIn?, fadeOut? (seconds), normalize?, clarity?
   * At least one adjustment must be requested.
   */
  static async enhance(req: Request, res: Response): Promise<void> {
    const uploaded = req.file;
    if (!uploaded) {
      res.status(400).json({
        code: "UNSUPPORTED_FILE_TYPE",
        error: "No file uploaded. Send an audio file as multipart/form-data with key 'file'.",
      });
      return;
    }

    const rawVolume =
      req.body?.volume === undefined || req.body?.volume === ""
        ? 100
        : Number(req.body?.volume);
    if (!isValidVolumePercent(rawVolume)) {
      await removeTempFiles([uploaded.path]);
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: "Volume must be between 0 and 200 percent.",
      });
      return;
    }

    const fadeIn =
      req.body?.fadeIn === undefined || req.body?.fadeIn === ""
        ? 0
        : parseBoundedSeconds(req.body.fadeIn, AUDIO_FADE_MAX_SECONDS);
    const fadeOut =
      req.body?.fadeOut === undefined || req.body?.fadeOut === ""
        ? 0
        : parseBoundedSeconds(req.body.fadeOut, AUDIO_FADE_MAX_SECONDS);
    if (fadeIn === null || fadeOut === null) {
      await removeTempFiles([uploaded.path]);
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: `Fade durations must be between 0 and ${AUDIO_FADE_MAX_SECONDS} seconds.`,
      });
      return;
    }

    const normalize = truthy(req.body?.normalize);
    const clarity = truthy(req.body?.clarity);
    if (
      rawVolume === 100 &&
      fadeIn === 0 &&
      fadeOut === 0 &&
      !normalize &&
      !clarity
    ) {
      await removeTempFiles([uploaded.path]);
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: "Choose at least one adjustment: volume, fades, normalization or clarity.",
      });
      return;
    }

    let durationSeconds: number | null = null;
    if (fadeOut > 0) {
      const info = await probeMediaInfo(uploaded.path);
      durationSeconds = info?.durationSeconds ?? null;
    }

    const format = formatFromName(uploaded.originalname) ?? "mp3";
    await startAudioJob(res, req.user?.sub, {
      label: "audio/enhance",
      uploads: [uploaded],
      downloadName: () =>
        `${sanitizeBaseName(uploaded.originalname)}-enhanced.${format}`,
      run: (ctx) =>
        AudioService.enhance(
          uploaded.path,
          format,
          {
            volumePercent: rawVolume,
            fadeInSeconds: fadeIn,
            fadeOutSeconds: fadeOut,
            normalize,
            clarity,
            durationSeconds,
          },
          ctx
        ),
    });
  }

  /** POST /api/media/audio/clean — fields: strength=light|medium|strong. */
  static async clean(req: Request, res: Response): Promise<void> {
    const uploaded = req.file;
    if (!uploaded) {
      res.status(400).json({
        code: "UNSUPPORTED_FILE_TYPE",
        error: "No file uploaded. Send an audio file as multipart/form-data with key 'file'.",
      });
      return;
    }

    const strength = option(req.body?.strength) || "medium";
    if (!isAudioCleanStrength(strength)) {
      await removeTempFiles([uploaded.path]);
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: "Invalid cleaning strength. Allowed values: light, medium, strong.",
      });
      return;
    }

    const format = formatFromName(uploaded.originalname) ?? "mp3";
    await startAudioJob(res, req.user?.sub, {
      label: "audio/clean",
      uploads: [uploaded],
      downloadName: () =>
        `${sanitizeBaseName(uploaded.originalname)}-cleaned.${format}`,
      run: (ctx) => AudioService.clean(uploaded.path, strength, format, ctx),
    });
  }

  /**
   * POST /api/media/audio/merge — 2..MAX_AUDIO_MERGE_FILES clips under
   * field "files"; output order follows the upload order exactly.
   */
  static async merge(req: Request, res: Response): Promise<void> {
    const uploads = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (uploads.length < MIN_AUDIO_MERGE_FILES) {
      await removeTempFiles(uploads.map((f) => f.path));
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: `Select at least ${MIN_AUDIO_MERGE_FILES} audio files to merge.`,
      });
      return;
    }
    // Defense in depth behind multer's own LIMIT_FILE_COUNT rejection.
    if (uploads.length > MAX_AUDIO_MERGE_FILES) {
      await removeTempFiles(uploads.map((f) => f.path));
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: `You can merge up to ${MAX_AUDIO_MERGE_FILES} audio files.`,
      });
      return;
    }

    await startAudioJob(res, req.user?.sub, {
      label: "audio/merge",
      uploads,
      downloadName: () => "merged.mp3",
      run: (ctx) => AudioService.merge(uploads.map((u) => u.path), ctx),
    });
  }

  /**
   * POST /api/media/audio/transcribe — fields: language=auto|ar|en|...
   * Produces transcript.txt as the job's downloadable result.
   */
  static async transcribe(req: Request, res: Response): Promise<void> {
    const uploaded = req.file;
    if (!uploaded) {
      res.status(400).json({
        code: "UNSUPPORTED_FILE_TYPE",
        error: "No file uploaded. Send an audio file as multipart/form-data with key 'file'.",
      });
      return;
    }

    const languageRaw = option(req.body?.language) || "auto";
    if (!isSttLanguage(languageRaw)) {
      await removeTempFiles([uploaded.path]);
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: `Unsupported language. Allowed values: ${STT_LANGUAGES.join(", ")}.`,
      });
      return;
    }

    // Bound Whisper CPU time by rejecting overly long recordings up front.
    const maxSeconds =
      Number(process.env.STT_MAX_DURATION_SECONDS) ||
      DEFAULT_MAX_STT_DURATION_SECONDS;
    const info = await probeMediaInfo(uploaded.path);
    if (info && info.durationSeconds !== null && info.durationSeconds > maxSeconds) {
      await removeTempFiles([uploaded.path]);
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: `Audio longer than ${Math.round(maxSeconds / 60)} minutes cannot be transcribed.`,
      });
      return;
    }

    await startAudioJob(res, req.user?.sub, {
      label: "audio/transcribe",
      uploads: [uploaded],
      downloadName: () =>
        `${sanitizeBaseName(uploaded.originalname)}-transcript.txt`,
      run: (ctx) =>
        AudioService.transcribe(uploaded.path, languageRaw as SttLanguage, ctx),
    });
  }
}
