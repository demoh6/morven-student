import { Request, Response } from "express";
import {
  isAudioEditMode,
  isAudioFormat,
  isAudioQuality,
  isCompressionPreset,
  isFlipMode,
  isResizePresetKey,
  isRotateDegrees,
  isVideoFormat,
  MediaProcessingError,
} from "../services/media/media.types";
import type { AudioQuality } from "../services/media/media.types";
import {
  extensionOf,
  isValidCustomDimension,
  isValidVolumePercent,
  MAX_CUSTOM_DIMENSION,
  MAX_MERGE_FILES,
  MIN_MERGE_FILES,
  GIF_DURATION_MAX_SECONDS,
  GIF_FPS_DEFAULT,
  GIF_FPS_MAX,
  GIF_FPS_MIN,
  GIF_WIDTH_DEFAULT,
  GIF_WIDTH_MAX,
  GIF_WIDTH_MIN,
  isGifFrameBudgetOk,
  MIN_CUSTOM_DIMENSION,
  parseSeconds,
  removeUploadTempFiles,
  sanitizeBaseName,
  SPEED_MAX,
  SPEED_MIN,
} from "../services/media/media.utils";
import { MediaService } from "../services/media/media.service";
import { probeMediaInfo } from "../services/media/ffmpeg.service";
import {
  MediaJobsService,
} from "../services/media/media-jobs.service";

function option(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function removeTempFile(filePath: string | undefined): Promise<void> {
  return removeUploadTempFiles([filePath]);
}

async function removeTempFiles(paths: (string | undefined)[]): Promise<void> {
  await removeUploadTempFiles(paths);
}

function fail(req: Request, res: Response, status: number, code: string, message: string): void {
  void removeTempFiles([req.file?.path]);
  res.status(status).json({ code, error: message });
}

/** Round to the nearest even integer (x264/yuv420p requirement). */
function evenize(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * Shared POST pipeline tail: create async job -> respond 202.
 * The heavy FFmpeg work continues in the background and is tracked through
 * GET /api/media/jobs/:id/status (real FFmpeg progress included).
 */
async function launchMediaJob(
  res: Response,
  options: {
    userId?: string;
    label: string;
    /** Every uploaded temp file belonging to this request. */
    filePaths: string[];
    run: (
      ctx: { signal: AbortSignal; onProgress: (fraction: number) => void }
    ) => Promise<{ outputPath: string; originalSize: number; outputSize: number }>;
    downloadName: () => string;
  }
): Promise<void> {
  try {
    MediaJobsService.assertCapacity();

    // Fail fast when ffmpeg is not installed instead of failing mid-job.
    const available = await MediaService.isAvailable();
    if (!available) {
      throw new MediaProcessingError(
        "FFMPEG_NOT_AVAILABLE",
        "Media processing is not available on the server (FFmpeg missing).",
        503
      );
    }

    const job = MediaJobsService.createJob(options.filePaths, options.downloadName(), options.userId);
    console.log(`[media] job ${job.id} started (${options.label})`);

    MediaJobsService.start(job, "", ctx => options.run(ctx));

    res.status(202).json({ jobId: job.id });
  } catch (err) {
    await removeTempFiles(options.filePaths);
    if (err instanceof MediaProcessingError) {
      console.error(`[media] ${options.label} rejected (${err.code}):`, err.message);
      res.status(err.status).json({ code: err.code, error: err.message });
      return;
    }
    console.error(`[media] ${options.label} unexpected failure:`, err);
    res.status(500).json({
      code: "PROCESSING_FAILED",
      error: "Unexpected media processing error.",
    });
  }
}

/** Single-file variant used by every one-input operation. */
async function startSingleFileJob(
  req: Request,
  res: Response,
  options: {
    userId?: string;
    label: string;
    run: (
      inputPath: string,
      ctx: { signal: AbortSignal; onProgress: (fraction: number) => void }
    ) => Promise<{ outputPath: string; originalSize: number; outputSize: number }>;
    downloadName: () => string;
  }
): Promise<void> {
  const uploaded = req.file;
  if (!uploaded) {
    res.status(400).json({
      code: "UNSUPPORTED_FILE_TYPE",
      error: "No file uploaded. Send a video as multipart/form-data with key 'file'.",
    });
    return;
  }

  try {
    MediaJobsService.assertCapacity();

    // Fail fast when ffmpeg is not installed instead of failing mid-job.
    const available = await MediaService.isAvailable();
    if (!available) {
      throw new MediaProcessingError(
        "FFMPEG_NOT_AVAILABLE",
        "Media processing is not available on the server (FFmpeg missing).",
        503
      );
    }

    const job = MediaJobsService.createJob(uploaded.path, options.downloadName(), options.userId);
    console.log(`[media] job ${job.id} started (${options.label}, ${uploaded.size} bytes)`);

    MediaJobsService.start(job, "", ctx => options.run(uploaded.path, ctx));

    res.status(202).json({ jobId: job.id });
  } catch (err) {
    await removeTempFile(uploaded.path);
    if (err instanceof MediaProcessingError) {
      console.error(`[media] ${options.label} rejected (${err.code}):`, err.message);
      res.status(err.status).json({ code: err.code, error: err.message });
      return;
    }
    console.error(`[media] ${options.label} unexpected failure:`, err);
    res.status(500).json({
      code: "PROCESSING_FAILED",
      error: "Unexpected media processing error.",
    });
  }
}

export class MediaController {
  /** POST /api/media/extract-audio — fields: format=mp3|wav|m4a, quality=high|standard */
  static async extractAudio(req: Request, res: Response): Promise<void> {
    const format = option(req.body?.format);
    if (!isAudioFormat(format)) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid audio format. Allowed values: mp3, wav, m4a.");
      return;
    }
    const qualityRaw = option(req.body?.quality);
    const quality: AudioQuality = isAudioQuality(qualityRaw) ? qualityRaw : "high";

    await startSingleFileJob(req, res, {
      userId: req.user?.sub,
      label: "extract-audio",
      run: (inputPath, ctx) => MediaService.extractAudio(inputPath, format, quality, ctx),
      downloadName: () =>
        `${sanitizeBaseName(req.file?.originalname || "")}-audio.${format}`,
    });
  }

  /** POST /api/media/compress-video — fields: preset=light|medium|strong */
  static async compressVideo(req: Request, res: Response): Promise<void> {
    const preset = option(req.body?.preset) || "medium";
    if (!isCompressionPreset(preset)) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid compression preset. Allowed values: light, medium, strong.");
      return;
    }

    await startSingleFileJob(req, res, {
      userId: req.user?.sub,
      label: "compress-video",
      run: (inputPath, ctx) => MediaService.compressVideo(inputPath, preset, ctx),
      downloadName: () =>
        `${sanitizeBaseName(req.file?.originalname || "")}-compressed.mp4`,
    });
  }

  /** POST /api/media/convert-video — fields: target=mp4|webm|mov|mkv */
  static async convertVideo(req: Request, res: Response): Promise<void> {
    const target = option(req.body?.target);
    if (!isVideoFormat(target)) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid target format. Allowed values: mp4, webm, mov, mkv.");
      return;
    }

    if (extensionOf(req.file?.originalname || "") === target) {
      fail(req, res, 400, "INVALID_CONVERSION", `The file is already a ${target.toUpperCase()} file.`);
      return;
    }

    await startSingleFileJob(req, res, {
      userId: req.user?.sub,
      label: "convert-video",
      run: (inputPath, ctx) => MediaService.convertVideo(inputPath, target, ctx),
      downloadName: () =>
        `${sanitizeBaseName(req.file?.originalname || "")}-converted.${target}`,
    });
  }

  /** POST /api/media/cut-video — fields: start=<seconds>, end=<seconds>, end > start */
  static async cutVideo(req: Request, res: Response): Promise<void> {
    const start = parseSeconds(req.body?.start);
    const end = parseSeconds(req.body?.end);
    if (start === null || end === null || !req.body || req.body.end === undefined || req.body.start === undefined) {
      fail(req, res, 400, "INVALID_CONVERSION", "Provide numeric 'start' and 'end' times in seconds.");
      return;
    }
    if (end <= start) {
      fail(req, res, 400, "INVALID_CONVERSION", "The end time must be greater than the start time.");
      return;
    }
    if (end - start < 0.1) {
      fail(req, res, 400, "INVALID_CONVERSION", "The selected segment is too short.");
      return;
    }

    await startSingleFileJob(req, res, {
      userId: req.user?.sub,
      label: "cut-video",
      run: (inputPath, ctx) => MediaService.cutVideo(inputPath, start, end, ctx),
      downloadName: () =>
        `${sanitizeBaseName(req.file?.originalname || "")}-cut.mp4`,
    });
  }

  /**
   * POST /api/media/edit-video
   * fields: preset=1080p|720p|480p|360p|custom, width?, height?,
   *         rotate=0|90|180|270, flip=none|h|v
   * At least one visual change is required.
   */
  static async editVideo(req: Request, res: Response): Promise<void> {
    const preset = option(req.body?.preset);
    let resize: { preset?: ReturnType<typeof Object>; customWidth?: number; customHeight?: number } = {};
    let hasResize = false;

    if (preset) {
      if (!isResizePresetKey(preset)) {
        fail(req, res, 400, "INVALID_CONVERSION", "Invalid size preset. Allowed values: 1080p, 720p, 480p, 360p, custom.");
        return;
      }
      if (preset === "custom") {
        const width = Number(req.body?.width);
        const height = Number(req.body?.height);
        const widthOk =
          isValidCustomDimension(width) && width % 2 === 0;
        const heightOk =
          isValidCustomDimension(height) && height % 2 === 0;
        if (!widthOk || !heightOk) {
          fail(
            req,
            res,
            400,
            "INVALID_CONVERSION",
            `Custom dimensions must be even whole numbers between ${MIN_CUSTOM_DIMENSION} and ${MAX_CUSTOM_DIMENSION}.`
          );
          return;
        }
        resize = { preset, customWidth: width, customHeight: height };
      } else {
        resize = { preset };
      }
      hasResize = true;
    }

    const rawRotate = req.body?.rotate === undefined || req.body?.rotate === "" ? 0 : Number(req.body?.rotate);
    if (!Number.isInteger(rawRotate) || !isRotateDegrees(rawRotate)) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid rotation. Allowed values: 0, 90, 180, 270.");
      return;
    }

    const flip = option(req.body?.flip) || "none";
    if (!isFlipMode(flip)) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid flip mode. Allowed values: none, h, v.");
      return;
    }

    if (!hasResize && rawRotate === 0 && flip === "none") {
      fail(req, res, 400, "INVALID_CONVERSION", "Choose at least one change: resize, rotation or flip.");
      return;
    }

    await startSingleFileJob(req, res, {
      userId: req.user?.sub,
      label: "edit-video",
      run: (inputPath, ctx) =>
        MediaService.editVideo(
          inputPath,
          {
            ...resize,
            rotate: rawRotate,
            flip,
          },
          ctx
        ),
      downloadName: () =>
        `${sanitizeBaseName(req.file?.originalname || "")}-edited.mp4`,
    });
  }

  /**
   * POST /api/media/edit-video-audio
   * fields: mode=remove|replace|mix|volume, volume=0..200 (percent)
   * uploads: field "file" = video, optional field "audio" (required for
   * replace/mix). The route mounts multer .fields(), so parts are read
   * from req.files — req.file is never populated by .fields().
   */
  static async editVideoAudio(req: Request, res: Response): Promise<void> {
    const fileParts = req.files as
      | Record<string, Express.Multer.File[]>
      | undefined;
    const videoUpload = fileParts?.file?.[0];
    const audioUploads = fileParts?.audio ?? [];
    const cleanupUploads = () =>
      removeUploadTempFiles([videoUpload?.path, ...audioUploads.map((f) => f.path)]);

    const mode = option(req.body?.mode);
    if (!isAudioEditMode(mode)) {
      await cleanupUploads();
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: "Invalid audio mode. Allowed values: remove, replace, mix, volume.",
      });
      return;
    }

    const rawVolume =
      req.body?.volume === undefined || req.body?.volume === ""
        ? 100
        : Number(req.body?.volume);
    if (!isValidVolumePercent(rawVolume)) {
      await cleanupUploads();
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: "Volume must be between 0 and 200 percent.",
      });
      return;
    }

    const audioPath = audioUploads[0]?.path;

    if ((mode === "replace" || mode === "mix") && !audioPath) {
      await cleanupUploads();
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: "Upload an audio file for this operation (multipart field 'audio').",
      });
      return;
    }

    const videoPath = videoUpload?.path;
    if (!videoPath) {
      await cleanupUploads();
      res.status(400).json({
        code: "UNSUPPORTED_FILE_TYPE",
        error: "No file uploaded. Send a video as multipart/form-data with key 'file'.",
      });
      return;
    }

    const allPaths = [videoPath, ...(audioPath ? [audioPath] : [])];
    try {
      MediaJobsService.assertCapacity();
      const available = await MediaService.isAvailable();
      if (!available) {
        throw new MediaProcessingError(
          "FFMPEG_NOT_AVAILABLE",
          "Media processing is not available on the server (FFmpeg missing).",
          503
        );
      }
      const job = MediaJobsService.createJob(
        allPaths,
        `${sanitizeBaseName(videoUpload?.originalname || "video")}-${
          mode === "remove"
            ? "no-audio"
            : mode === "replace"
              ? "audio-replaced"
              : mode === "mix"
                ? "audio-mixed"
                : "volume"
        }.mp4`,
        req.user?.sub
      );
      console.log(`[media] job ${job.id} started (edit-video-audio/${mode})`);
      MediaJobsService.start(job, "", (ctx) =>
        MediaService.editVideoAudio(videoPath, mode, { volumePercent: rawVolume, audioPath }, ctx)
      );
      res.status(202).json({ jobId: job.id });
    } catch (err) {
      await removeTempFiles(allPaths);
      if (err instanceof MediaProcessingError) {
        console.error(`[media] edit-video-audio rejected (${err.code}):`, err.message);
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[media] edit-video-audio unexpected failure:", err);
      res.status(500).json({
        code: "PROCESSING_FAILED",
        error: "Unexpected media processing error.",
      });
    }
  }

  /**
   * POST /api/media/merge-videos — 2..MAX_MERGE_FILES videos under field
   * "files". Clips must either ALL have audio or NONE (validated via
   * ffprobe when available); resolution/fps differences are normalized
   * automatically.
   */
  static async mergeVideos(req: Request, res: Response): Promise<void> {
    const uploads = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (uploads.length < MIN_MERGE_FILES) {
      await removeTempFiles(uploads.map((f) => f.path));
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: `Select at least ${MIN_MERGE_FILES} videos to merge.`,
      });
      return;
    }
    // Defense in depth: multer already rejects counts above the route's
    // limit; keep the contract explicit in the controller as well.
    if (uploads.length > MAX_MERGE_FILES) {
      await removeTempFiles(uploads.map((f) => f.path));
      res.status(400).json({
        code: "INVALID_CONVERSION",
        error: `You can merge up to ${MAX_MERGE_FILES} videos.`,
      });
      return;
    }

    const infos = await Promise.all(uploads.map((u) => probeMediaInfo(u.path)));
    if (infos.every((i) => i !== null)) {
      const audioFlags = infos.map((i) => i!.hasAudio);
      const all = audioFlags.every(Boolean);
      const none = audioFlags.every((f) => !f);
      if (!all && !none) {
        await removeTempFiles(uploads.map((f) => f.path));
        res.status(400).json({
          code: "INVALID_CONVERSION",
          error:
            "These clips cannot be merged together: some have sound and others do not. Use clips that all include audio, or all without.",
        });
        return;
      }
    }
    const withAudio = infos.every((i) => i !== null)
      ? infos.every((i) => i!.hasAudio)
      : true;

    // Normalize to the first clip's dimensions; when probing is unavailable
    // fall back to a widely compatible 720p canvas.
    const canvas = infos[0] && infos[0].width && infos[0].height
      ? { width: evenize(infos[0].width), height: evenize(infos[0].height) }
      : { width: 1280, height: 720 };
    const fps = infos.some((i) => i?.fps) ? Math.round(infos.find((i) => i?.fps)!.fps!) : 30;

    try {
      MediaJobsService.assertCapacity();
      const available = await MediaService.isAvailable();
      if (!available) {
        throw new MediaProcessingError(
          "FFMPEG_NOT_AVAILABLE",
          "Media processing is not available on the server (FFmpeg missing).",
          503
        );
      }
      const paths = uploads.map((u) => u.path);
      const job = MediaJobsService.createJob(paths, "merged.mp4", req.user?.sub);
      console.log(`[media] job ${job.id} started (merge-videos, ${paths.length} clips)`);
      MediaJobsService.start(job, "", (ctx) =>
        MediaService.mergeVideos(
          paths,
          { ...canvas, fps, withAudio },
          ctx
        )
      );
      res.status(202).json({ jobId: job.id });
    } catch (err) {
      await removeTempFiles(uploads.map((f) => f.path));
      if (err instanceof MediaProcessingError) {
        console.error(`[media] merge-videos rejected (${err.code}):`, err.message);
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[media] merge-videos unexpected failure:", err);
      res.status(500).json({
        code: "PROCESSING_FAILED",
        error: "Unexpected media processing error.",
      });
    }
  }

  /**
   * POST /api/media/video-to-gif
   * fields: start?, end?, fps (5..20), width (64..1280)
   * Guards: duration window ≤ 60s and total frames ≤ 750.
   */
  static async videoToGif(req: Request, res: Response): Promise<void> {
    const start =
      req.body?.start === undefined || req.body?.start === ""
        ? undefined
        : parseSeconds(req.body.start);
    if (start === null) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid start time.");
      return;
    }
    const end =
      req.body?.end === undefined || req.body?.end === ""
        ? undefined
        : parseSeconds(req.body.end);
    if (end === null) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid end time.");
      return;
    }
    if (start !== undefined && end !== undefined && end <= start) {
      fail(req, res, 400, "INVALID_CONVERSION", "The end time must be greater than the start time.");
      return;
    }
    if (start !== undefined && end !== undefined && end - start > GIF_DURATION_MAX_SECONDS) {
      fail(req, res, 400, "INVALID_CONVERSION", `GIF clips are limited to ${GIF_DURATION_MAX_SECONDS} seconds.`);
      return;
    }

    const fps = req.body?.fps === undefined || req.body.fps === "" ? GIF_FPS_DEFAULT : Math.round(Number(req.body.fps));
    if (!Number.isFinite(fps) || fps < GIF_FPS_MIN || fps > GIF_FPS_MAX) {
      fail(req, res, 400, "INVALID_CONVERSION", `FPS must be between ${GIF_FPS_MIN} and ${GIF_FPS_MAX}.`);
      return;
    }

    const width = req.body?.width === undefined || req.body.width === "" ? GIF_WIDTH_DEFAULT : Math.round(Number(req.body.width));
    if (!Number.isFinite(width) || width < GIF_WIDTH_MIN || width > GIF_WIDTH_MAX) {
      fail(req, res, 400, "INVALID_CONVERSION", `Width must be between ${GIF_WIDTH_MIN} and ${GIF_WIDTH_MAX} pixels.`);
      return;
    }

    if (!isGifFrameBudgetOk(fps, { start, end })) {
      fail(
        req,
        res,
        400,
        "INVALID_CONVERSION",
        "This GIF settings combination would produce too many frames. Shorten the clip or lower the FPS."
      );
      return;
    }

    await startSingleFileJob(req, res, {
      userId: req.user?.sub,
      label: "video-to-gif",
      run: (inputPath, ctx) =>
        MediaService.videoToGif(inputPath, { fps, width, window: { start, end } }, ctx),
      downloadName: () =>
        `${sanitizeBaseName(req.file?.originalname || "")}.gif`,
    });
  }

  /** POST /api/media/change-speed — fields: speed=0.25..4 */
  static async changeSpeed(req: Request, res: Response): Promise<void> {
    const speed = Number(req.body?.speed);
    if (!Number.isFinite(speed) || speed < SPEED_MIN || speed > SPEED_MAX) {
      fail(req, res, 400, "INVALID_CONVERSION", `Speed must be between ${SPEED_MIN}x and ${SPEED_MAX}x.`);
      return;
    }
    if (Math.abs(speed - 1) < 1e-9) {
      fail(req, res, 400, "INVALID_CONVERSION", "The video is already playing at normal speed.");
      return;
    }

    await startSingleFileJob(req, res, {
      userId: req.user?.sub,
      label: "change-speed",
      run: (inputPath, ctx) => MediaService.changeVideoSpeed(inputPath, speed, ctx),
      downloadName: () =>
        `${sanitizeBaseName(req.file?.originalname || "")}-${String(speed).replace(".", "_")}x.mp4`,
    });
  }

  /**
   * POST /api/media/remove-music — Extracts vocals from a video using
   * Demucs source separation, producing both a processed video (original
   * video stream + separated vocals audio) and a processed audio file.
   */
  static async removeMusic(req: Request, res: Response): Promise<void> {
    const uploaded = req.file;
    if (!uploaded) {
      res.status(400).json({
        code: "UNSUPPORTED_FILE_TYPE",
        error: "No file uploaded. Send a video as multipart/form-data with key 'file'.",
      });
      return;
    }

    try {
      MediaJobsService.assertCapacity();
      const available = await MediaService.isAvailable();
      if (!available) {
        throw new MediaProcessingError(
          "FFMPEG_NOT_AVAILABLE",
          "Media processing is not available on the server (FFmpeg missing).",
          503
        );
      }

      const baseName = sanitizeBaseName(uploaded.originalname || "video");
      const downloadName = `${baseName}-no-music.mp4`;
      const job = MediaJobsService.createJob(uploaded.path, downloadName, req.user?.sub);
      job.audioFileName = `${baseName}-no-music.mp3`;
      console.log(`[media] job ${job.id} started (remove-music, ${uploaded.size} bytes)`);

      MediaJobsService.start(job, "", (ctx) =>
        MediaService.removeMusic(uploaded.path, ctx).then((result) => ({
          outputPath: result.outputPath,
          workDir: result.workDir,
          originalSize: result.originalSize,
          outputSize: result.outputSize,
          audioOutputPath: result.audioOutputPath,
        }))
      );

      res.status(202).json({ jobId: job.id });
    } catch (err) {
      await removeTempFile(uploaded.path);
      if (err instanceof MediaProcessingError) {
        console.error(`[media] remove-music rejected (${err.code}):`, err.message);
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[media] remove-music unexpected failure:", err);
      res.status(500).json({
        code: "PROCESSING_FAILED",
        error: "Unexpected media processing error.",
      });
    }
  }

  /** GET /api/media/jobs/:id/status */
  static status(req: Request, res: Response): void {
    const job = MediaJobsService.get(String(req.params.id));
    if (!MediaJobsService.canAccess(job, req.user?.sub ?? "")) {
      res.status(404).json({
        code: "JOB_NOT_FOUND",
        error: "Unknown or expired processing job.",
      });
      return;
    }

    if (job.status === "processing") {
      res.json({ status: "processing", progress: job.progress });
      return;
    }

    if (job.status === "error") {
      res.json({ status: "error", code: job.code ?? "PROCESSING_FAILED", error: job.error });
      return;
    }

    res.json({
      status: "done",
      progress: 1,
      fileName: job.fileName,
      originalSize: job.originalSize,
      outputSize: job.outputSize,
    });
  }

  /**
   * GET /api/media/jobs/:id/download — streams the result then cleans up.
   *
   * Defined download semantics (single-consumer):
   * - The FIRST request that finds the job done claims it synchronously,
   *   streams the file, and the job record + files are then removed.
   * - Every other request — concurrent duplicates or later retries —
   *   deterministically receives 404 JOB_NOT_FOUND once a claim exists.
   * Filesystem failures never leak: clients only ever see safe codes.
   */
  static async download(req: Request, res: Response): Promise<void> {
    const job = MediaJobsService.get(String(req.params.id));
    if (!MediaJobsService.canAccess(job, req.user?.sub ?? "")) {
      res.status(404).json({
        code: "JOB_NOT_FOUND",
        error: "Unknown or expired processing job.",
      });
      return;
    }

    if (job.status === "processing") {
      res.status(409).json({ code: "JOB_PROCESSING", error: "The file is still being processed." });
      return;
    }

    if (job.status === "error" || !job.outputPath) {
      res.status(409).json({ code: job.code ?? "PROCESSING_FAILED", error: job.error ?? "Processing failed." });
      return;
    }

    // Atomic claim; losers fall through to the same 404 as unknown jobs.
    if (MediaJobsService.claimDownload(job.id) !== job) {
      res.status(404).json({
        code: "JOB_NOT_FOUND",
        error: "Unknown or expired processing job.",
      });
      return;
    }

    res.download(job.outputPath, job.fileName || "output", async (err) => {
      await MediaJobsService.completeDownload(job);
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Failed to send the processed media file." });
      }
    });
  }

  /** DELETE /api/media/jobs/:id — cancel processing and clean up. */
  static async cancel(req: Request, res: Response): Promise<void> {
    const job = MediaJobsService.get(String(req.params.id));
    if (!MediaJobsService.canAccess(job, req.user?.sub ?? "")) {
      res.status(404).json({
        code: "JOB_NOT_FOUND",
        error: "Unknown or expired processing job.",
      });
      return;
    }
    const cancelled = await MediaJobsService.cancel(String(req.params.id));
    if (!cancelled) {
      res.status(404).json({
        code: "JOB_NOT_FOUND",
        error: "Unknown or expired processing job.",
      });
      return;
    }
    res.json({ status: "cancelled" });
  }

  /**
   * GET /api/media/jobs/:id/download-audio — optional secondary output
   * download (used by the remove-music tool). Does NOT consume the job's
   * primary download claim, so clients can fetch both outputs.
   */
  static async downloadAudio(req: Request, res: Response): Promise<void> {
    const job = MediaJobsService.get(String(req.params.id));
    if (!MediaJobsService.canAccess(job, req.user?.sub ?? "")) {
      res.status(404).json({
        code: "JOB_NOT_FOUND",
        error: "Unknown or expired processing job.",
      });
      return;
    }

    if (job.status === "processing") {
      res.status(409).json({ code: "JOB_PROCESSING", error: "The file is still being processed." });
      return;
    }

    if (job.status === "error" || !job.audioOutputPath) {
      res.status(409).json({ code: job.code ?? "PROCESSING_FAILED", error: job.error ?? "Processing failed." });
      return;
    }

    const audioName = job.audioFileName || `${sanitizeBaseName(job.fileName || "output")}-no-music.mp3`;
    res.download(job.audioOutputPath, audioName, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Failed to send the processed audio file." });
      }
    });
  }
}