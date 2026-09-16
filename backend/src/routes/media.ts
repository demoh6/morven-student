import { Router, NextFunction, Request, Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middleware/auth";
import {
  uploadVideo,
  uploadVideoAndOptionalAudio,
  makeMultiVideoUpload,
  MAX_VIDEO_SIZE_BYTES,
} from "../middleware/uploadVideo";
import {
  uploadImage,
  uploadImageAndLogo,
  MAX_IMAGE_SIZE_BYTES,
} from "../middleware/uploadImage";
import {
  uploadAudio,
  makeMultiAudioUpload,
  MAX_AUDIO_SIZE_BYTES,
} from "../middleware/uploadAudio";
import { MediaProcessingError } from "../services/media/media.types";
import { MAX_MERGE_FILES } from "../services/media/media.utils";
import { MAX_AUDIO_MERGE_FILES } from "../services/media/audio.types";
import { MediaController } from "../controllers/media.controller";
import { ImageController } from "../controllers/image.controller";
import { AudioController } from "../controllers/audio.controller";

const router = Router();

const uploadVideos = makeMultiVideoUpload(MAX_MERGE_FILES);
const uploadAudios = makeMultiAudioUpload(MAX_AUDIO_MERGE_FILES);

/**
 * Processing limit for media POST endpoints. Media jobs are CPU/GPU heavy, so
 * per-IP throughput is bounded (generous default, configurable via
 * MEDIA_RATE_LIMIT_MAX). Status polling is NOT limited — it is cheap and
 * long-running jobs legitimately poll repeatedly.
 */
const mediaProcessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.MEDIA_RATE_LIMIT_MAX || "40", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "تم تجاوز الحد المسموح لمعالجة الوسائط. يرجى المحاولة لاحقاً",
  },
});

/**
 * Multer error mapping specific to media uploads:
 * - size limit -> 413 with the real configured limit
 * - file filter rejection (MediaProcessingError) -> its own status/code
 */
function handleMediaUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  uploadVideo.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    respondToUploadError(req, res, err, next);
  });
}

function handleMultiMediaUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  uploadVideos.array("files")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    respondToUploadError(req, res, err, next);
  });
}

function handleVideoAudioUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  uploadVideoAndOptionalAudio(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    respondToUploadError(req, res, err, next);
  });
}

function respondToImageUploadError(
  req: Request,
  res: Response,
  err: unknown,
  next: NextFunction
): void {
  if (err instanceof MediaProcessingError) {
    res.status(err.status).json({ code: err.code, error: err.message });
    return;
  }
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    const maxMb = Math.round(MAX_IMAGE_SIZE_BYTES / (1024 * 1024));
    res.status(413).json({
      code: "FILE_TOO_LARGE",
      error: `File too large. Maximum allowed image size is ${maxMb}MB.`,
    });
    return;
  }
  if (
    err instanceof multer.MulterError &&
    err.code === "LIMIT_UNEXPECTED_FILE"
  ) {
    const maxMb = Math.round(MAX_IMAGE_SIZE_BYTES / (1024 * 1024));
    res.status(400).json({
      code: "INVALID_CONVERSION",
      error: `Unexpected files in the upload (each file is limited to ${maxMb}MB).`,
    });
    return;
  }
  void req;
  next(err);
}

function handleImageUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  uploadImage.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    respondToImageUploadError(req, res, err, next);
  });
}

function handleWatermarkUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  uploadImageAndLogo(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    respondToImageUploadError(req, res, err, next);
  });
}

function respondToUploadError(
  req: Request,
  res: Response,
  err: unknown,
  next: NextFunction
): void {
  if (err instanceof MediaProcessingError) {
    res.status(err.status).json({ code: err.code, error: err.message });
    return;
  }
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    const maxMb = Math.round(MAX_VIDEO_SIZE_BYTES / (1024 * 1024));
    res.status(413).json({
      code: "FILE_TOO_LARGE",
      error: `File too large. Maximum allowed video size is ${maxMb}MB.`,
    });
    return;
  }
  if (
    err instanceof multer.MulterError &&
    err.code === "LIMIT_FILE_COUNT"
  ) {
    // Merge tool: more than MAX_MERGE_FILES videos in one request.
    res.status(400).json({
      code: "INVALID_CONVERSION",
      error: `You can merge up to ${MAX_MERGE_FILES} videos.`,
    });
    return;
  }
  if (
    err instanceof multer.MulterError &&
    err.code === "LIMIT_UNEXPECTED_FILE"
  ) {
    const maxMb = Math.round(MAX_VIDEO_SIZE_BYTES / (1024 * 1024));
    res.status(400).json({
      code: "INVALID_CONVERSION",
      error: `Too many or unexpected files in the upload (each file is limited to ${maxMb}MB).`,
    });
    return;
  }
  void req;
  next(err);
}

function respondToAudioUploadError(
  req: Request,
  res: Response,
  err: unknown,
  next: NextFunction
): void {
  if (err instanceof MediaProcessingError) {
    res.status(err.status).json({ code: err.code, error: err.message });
    return;
  }
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    const maxMb = Math.round(MAX_AUDIO_SIZE_BYTES / (1024 * 1024));
    res.status(413).json({
      code: "FILE_TOO_LARGE",
      error: `File too large. Maximum allowed audio size is ${maxMb}MB.`,
    });
    return;
  }
  if (
    err instanceof multer.MulterError &&
    err.code === "LIMIT_FILE_COUNT"
  ) {
    // Merge tool: more than MAX_AUDIO_MERGE_FILES clips in one request.
    res.status(400).json({
      code: "INVALID_CONVERSION",
      error: `You can merge up to ${MAX_AUDIO_MERGE_FILES} audio files.`,
    });
    return;
  }
  if (
    err instanceof multer.MulterError &&
    err.code === "LIMIT_UNEXPECTED_FILE"
  ) {
    const maxMb = Math.round(MAX_AUDIO_SIZE_BYTES / (1024 * 1024));
    res.status(400).json({
      code: "INVALID_CONVERSION",
      error: `Too many or unexpected files in the upload (each file is limited to ${maxMb}MB).`,
    });
    return;
  }
  void req;
  next(err);
}

function handleAudioUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  uploadAudio.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    respondToAudioUploadError(req, res, err, next);
  });
}

function handleMultiAudioUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  uploadAudios.array("files")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    respondToAudioUploadError(req, res, err, next);
  });
}

// Start processing jobs (multipart uploads). Respond 202 { jobId }.
// authenticate runs before multer so unauthenticated traffic never consumes
// upload bandwidth; mediaProcessLimiter throttles only processing POSTs.
router.post("/api/media/extract-audio", authenticate, mediaProcessLimiter, handleMediaUpload, MediaController.extractAudio);
router.post("/api/media/compress-video", authenticate, mediaProcessLimiter, handleMediaUpload, MediaController.compressVideo);
router.post("/api/media/convert-video", authenticate, mediaProcessLimiter, handleMediaUpload, MediaController.convertVideo);
router.post("/api/media/cut-video", authenticate, mediaProcessLimiter, handleMediaUpload, MediaController.cutVideo);
router.post("/api/media/edit-video", authenticate, mediaProcessLimiter, handleMediaUpload, MediaController.editVideo);
router.post("/api/media/edit-video-audio", authenticate, mediaProcessLimiter, handleVideoAudioUpload, MediaController.editVideoAudio);
router.post("/api/media/merge-videos", authenticate, mediaProcessLimiter, handleMultiMediaUpload, MediaController.mergeVideos);
router.post("/api/media/video-to-gif", authenticate, mediaProcessLimiter, handleMediaUpload, MediaController.videoToGif);
router.post("/api/media/change-speed", authenticate, mediaProcessLimiter, handleMediaUpload, MediaController.changeSpeed);
router.post("/api/media/remove-music", authenticate, mediaProcessLimiter, handleMediaUpload, MediaController.removeMusic);

// Image tools (sharp-based; same job lifecycle and download endpoints).
// The wrapper converts unexpected async rejections into HTTP 500s instead
// of hanging requests (Express 4 does not catch async handler errors).
const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

router.post("/api/media/image/remove-bg", authenticate, mediaProcessLimiter, handleImageUpload, asyncHandler(ImageController.removeBackground));
router.post("/api/media/image/resize", authenticate, mediaProcessLimiter, handleImageUpload, asyncHandler(ImageController.resize));
router.post("/api/media/image/crop", authenticate, mediaProcessLimiter, handleImageUpload, asyncHandler(ImageController.crop));
router.post("/api/media/image/rotate", authenticate, mediaProcessLimiter, handleImageUpload, asyncHandler(ImageController.rotate));
router.post("/api/media/image/adjust", authenticate, mediaProcessLimiter, handleImageUpload, asyncHandler(ImageController.adjust));
router.post("/api/media/image/blur-regions", authenticate, mediaProcessLimiter, handleImageUpload, asyncHandler(ImageController.blurRegions));
router.post("/api/media/image/watermark", authenticate, mediaProcessLimiter, handleWatermarkUpload, asyncHandler(ImageController.watermark));
router.post("/api/media/image/strip-metadata", authenticate, mediaProcessLimiter, handleImageUpload, asyncHandler(ImageController.stripMetadata));

// Audio tools (same job lifecycle and download endpoints as video/image).
router.post("/api/media/audio/transcribe", authenticate, mediaProcessLimiter, handleAudioUpload, asyncHandler(AudioController.transcribe));
router.post("/api/media/audio/cut", authenticate, mediaProcessLimiter, handleAudioUpload, asyncHandler(AudioController.cut));
router.post("/api/media/audio/enhance", authenticate, mediaProcessLimiter, handleAudioUpload, asyncHandler(AudioController.enhance));
router.post("/api/media/audio/clean", authenticate, mediaProcessLimiter, handleAudioUpload, asyncHandler(AudioController.clean));
router.post("/api/media/audio/merge", authenticate, mediaProcessLimiter, handleMultiAudioUpload, asyncHandler(AudioController.merge));

// Job tracking / download / cancellation. authenticate ensures ownership can
// be checked; the rate limiter is intentionally NOT applied here — status
// polling is cheap and must not be throttled.
router.get("/api/media/jobs/:id/status", authenticate, MediaController.status);
router.get("/api/media/jobs/:id/download", authenticate, MediaController.download);
router.get("/api/media/jobs/:id/download-audio", authenticate, MediaController.downloadAudio);
router.delete("/api/media/jobs/:id", authenticate, MediaController.cancel);

export default router;
