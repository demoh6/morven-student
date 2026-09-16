import { Request, Response } from "express";
import {
  ADJUST_LIMITS,
  BG_REMOVE_LIMITS,
  BLUR_REGION_LIMITS,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
  WATERMARK_LIMITS,
  isImageFitMode,
  isRegionEffect,
  isRotateDegreesValue,
  isFlipModeValue,
  isWatermarkPosition,
  parseBoundedInt,
  parseBlurRegions,
  parseCropRegion,
  parseHexColor,
  parseOptionalInt,
} from "../services/media/image.types";
import type { CropRegion, ImageAdjustments, WatermarkPosition } from "../services/media/image.types";
import {
  extensionForFormat,
  imageContentMatchesExtension,
  outputFormatFor,
} from "../services/media/image.utils";
import { removeUploadTempFiles, sanitizeBaseName } from "../services/media/media.utils";
import { MediaJobsService } from "../services/media/media-jobs.service";
import { MediaProcessingError } from "../services/media/media.types";
import {
  blurRegionsImage,
  cropImage,
  adjustImage,
  probeImageInfo,
  removeImageBackground,
  resizeImage,
  rotateImage,
  stripImageMetadata,
  watermarkWithLogo,
  watermarkWithText,
} from "../services/media/image.service";

function option(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function cleanup(paths: (string | undefined)[]): Promise<void> {
  await removeUploadTempFiles(paths);
}

function fail(req: Request, res: Response, status: number, code: string, message: string): void {
  void cleanup([req.file?.path]);
  res.status(status).json({ code, error: message });
}

function failAll(
  res: Response,
  status: number,
  code: string,
  message: string,
  paths: (string | undefined)[]
): void {
  void cleanup(paths);
  res.status(status).json({ code, error: message });
}

/**
 * Shared POST pipeline tail for image jobs. Unlike video jobs there is no
 * FFmpeg dependency; capacity and content checks run before the 202 so
 * clients get fast, synchronous feedback on rejection.
 */
async function startImageJob(
  req: Request,
  res: Response,
  options: {
    userId?: string;
    label: string;
    filePaths: string[];
    /** Original filenames aligned with filePaths (for extension checks). */
    contentNames?: string[];
    downloadName: string;
    run: (ctx: {
      signal: AbortSignal;
      onProgress: (fraction: number) => void;
    }) => Promise<{ outputPath: string; originalSize: number; outputSize: number }>;
  }
): Promise<void> {
  try {
    MediaJobsService.assertCapacity();

    // Magic-byte verification: the bytes must really be the image format
    // the extension claims before any decoder is allowed to touch them.
    const names = options.contentNames ?? options.filePaths.map((p, i) => (i === 0 ? req.file?.originalname || p : p));
    for (let i = 0; i < options.filePaths.length; i++) {
      const ok = await imageContentMatchesExtension(options.filePaths[i], names[i] || options.filePaths[i]);
      if (!ok) {
        throw new MediaProcessingError(
          "UNSUPPORTED_FILE_TYPE",
          "The file content does not match a valid image format.",
          400
        );
      }
    }

    const job = MediaJobsService.createJob(options.filePaths, options.downloadName, options.userId);
    console.log(`[media] job ${job.id} started (${options.label}, image)`);
    MediaJobsService.start(job, "", (ctx) => options.run(ctx));
    res.status(202).json({ jobId: job.id });
  } catch (err) {
    await cleanup(options.filePaths);
    if (err instanceof MediaProcessingError) {
      console.error(`[media] ${options.label} rejected (${err.code}):`, err.message);
      res.status(err.status).json({ code: err.code, error: err.message });
      return;
    }
    console.error(`[media] ${options.label} unexpected failure:`, err);
    res.status(500).json({
      code: "PROCESSING_FAILED",
      error: "Unexpected image processing error.",
    });
  }
}

function outputBase(originalname: string | undefined, suffix: string): string {
  const format = outputFormatFor(originalname || "");
  return `${sanitizeBaseName(originalname || "image")}${suffix}${extensionForFormat(format)}`;
}

/** GET-free helper: dimensions needed to validate pixel coordinates early. */
async function dimensionsOrReject(
  req: Request,
  res: Response
): Promise<{ width: number; height: number } | null> {
  try {
    const info = await probeImageInfo(req.file!.path);
    return { width: info.width, height: info.height };
  } catch (err) {
    if (err instanceof MediaProcessingError) {
      fail(req, res, err.status, err.code, err.message);
      return null;
    }
    fail(req, res, 500, "PROCESSING_FAILED", "Unexpected image processing error.");
    return null;
  }
}

export class ImageController {
  /** POST /api/media/image/remove-bg — fields: tolerance?=1..100 */
  static async removeBackground(req: Request, res: Response): Promise<void> {
    let tolerance: number;
    try {
      tolerance = parseOptionalInt(
        req.body?.tolerance,
        BG_REMOVE_LIMITS.tolerance.min,
        BG_REMOVE_LIMITS.tolerance.max,
        BG_REMOVE_LIMITS.tolerance.default,
        "Tolerance"
      );
    } catch (err) {
      if (err instanceof MediaProcessingError) {
        fail(req, res, err.status, err.code, err.message);
        return;
      }
      throw err;
    }

    await startImageJob(req, res, {
      userId: req.user?.sub,
      label: "image/remove-bg",
      filePaths: [req.file!.path],
      downloadName: `${sanitizeBaseName(req.file?.originalname || "image")}-no-bg.png`,
      run: (ctx) => removeImageBackground(req.file!.path, tolerance, ctx),
    });
  }

  /** POST /api/media/image/resize — width?/height?/fit?/upscale? */
  static async resize(req: Request, res: Response): Promise<void> {
    const hasWidth = req.body?.width !== undefined && req.body?.width !== "";
    const hasHeight = req.body?.height !== undefined && req.body?.height !== "";
    if (!hasWidth && !hasHeight) {
      fail(req, res, 400, "INVALID_CONVERSION", "Provide a target width, height or both.");
      return;
    }
    let width: number | undefined;
    let height: number | undefined;
    try {
      if (hasWidth) {
        width = parseBoundedInt(req.body.width, MIN_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, "Width");
      }
      if (hasHeight) {
        height = parseBoundedInt(req.body.height, MIN_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, "Height");
      }
    } catch (err) {
      if (err instanceof MediaProcessingError) {
        fail(req, res, err.status, err.code, err.message);
        return;
      }
      throw err;
    }

    const fitRaw = option(req.body?.fit) || "inside";
    if (!isImageFitMode(fitRaw)) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid fit mode. Allowed values: inside, cover, contain, fill.");
      return;
    }

    await startImageJob(req, res, {
      userId: req.user?.sub,
      label: "image/resize",
      filePaths: [req.file!.path],
      downloadName: outputBase(req.file?.originalname, "-resized"),
      run: (ctx) =>
        resizeImage(
          req.file!.path,
          { width, height, fit: fitRaw, allowUpscale: option(req.body?.upscale) === "1" },
          ctx
        ),
    });
  }

  /** POST /api/media/image/crop — left/top/width/height in source pixels */
  static async crop(req: Request, res: Response): Promise<void> {
    const dims = await dimensionsOrReject(req, res);
    if (!dims) return;
    let region: CropRegion;
    try {
      region = parseCropRegion(req.body ?? {}, dims.width, dims.height);
    } catch (err) {
      if (err instanceof MediaProcessingError) {
        fail(req, res, err.status, err.code, err.message);
        return;
      }
      throw err;
    }

    await startImageJob(req, res, {
      userId: req.user?.sub,
      label: "image/crop",
      filePaths: [req.file!.path],
      downloadName: outputBase(req.file?.originalname, "-cropped"),
      run: (ctx) => cropImage(req.file!.path, region, ctx),
    });
  }

  /** POST /api/media/image/rotate — rotate=0|90|180|270, flip=none|h|v */
  static async rotate(req: Request, res: Response): Promise<void> {
    const rawRotate =
      req.body?.rotate === undefined || req.body?.rotate === ""
        ? 0
        : Number(req.body?.rotate);
    if (!Number.isInteger(rawRotate) || !isRotateDegreesValue(rawRotate)) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid rotation. Allowed values: 0, 90, 180, 270.");
      return;
    }
    const flip = option(req.body?.flip) || "none";
    if (!isFlipModeValue(flip)) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid flip mode. Allowed values: none, h, v.");
      return;
    }
    if (rawRotate === 0 && flip === "none") {
      fail(req, res, 400, "INVALID_CONVERSION", "Choose at least one change: rotation or flip.");
      return;
    }

    await startImageJob(req, res, {
      userId: req.user?.sub,
      label: "image/rotate",
      filePaths: [req.file!.path],
      downloadName: outputBase(req.file?.originalname, "-rotated"),
      run: (ctx) => rotateImage(req.file!.path, { rotate: rawRotate, flip }, ctx),
    });
  }

  /** POST /api/media/image/adjust — brightness/saturation/contrast/blur/sharpen */
  static async adjust(req: Request, res: Response): Promise<void> {
    let adjustments: ImageAdjustments;
    try {
      adjustments = {
        brightness: parseOptionalInt(
          req.body?.brightness,
          ADJUST_LIMITS.brightness.min,
          ADJUST_LIMITS.brightness.max,
          ADJUST_LIMITS.brightness.default,
          "Brightness"
        ),
        saturation: parseOptionalInt(
          req.body?.saturation,
          ADJUST_LIMITS.saturation.min,
          ADJUST_LIMITS.saturation.max,
          ADJUST_LIMITS.saturation.default,
          "Saturation"
        ),
        contrast: parseOptionalInt(
          req.body?.contrast,
          ADJUST_LIMITS.contrast.min,
          ADJUST_LIMITS.contrast.max,
          ADJUST_LIMITS.contrast.default,
          "Contrast"
        ),
        blur: parseOptionalInt(
          req.body?.blur,
          ADJUST_LIMITS.blur.min,
          ADJUST_LIMITS.blur.max,
          ADJUST_LIMITS.blur.default,
          "Blur"
        ),
        sharpen: parseOptionalInt(
          req.body?.sharpen,
          ADJUST_LIMITS.sharpen.min,
          ADJUST_LIMITS.sharpen.max,
          ADJUST_LIMITS.sharpen.default,
          "Sharpen"
        ),
      };
    } catch (err) {
      if (err instanceof MediaProcessingError) {
        fail(req, res, err.status, err.code, err.message);
        return;
      }
      throw err;
    }

    const unchanged =
      adjustments.brightness === ADJUST_LIMITS.brightness.default &&
      adjustments.saturation === ADJUST_LIMITS.saturation.default &&
      adjustments.contrast === ADJUST_LIMITS.contrast.default &&
      adjustments.blur === ADJUST_LIMITS.blur.default &&
      adjustments.sharpen === ADJUST_LIMITS.sharpen.default;
    if (unchanged) {
      fail(
        req,
        res,
        400,
        "INVALID_CONVERSION",
        "Choose at least one adjustment: brightness, saturation, contrast, blur or sharpen."
      );
      return;
    }

    await startImageJob(req, res, {
      userId: req.user?.sub,
      label: "image/adjust",
      filePaths: [req.file!.path],
      downloadName: outputBase(req.file?.originalname, "-adjusted"),
      run: (ctx) => adjustImage(req.file!.path, adjustments, ctx),
    });
  }

  /** POST /api/media/image/blur-regions — regions=JSON, effect, intensity */
  static async blurRegions(req: Request, res: Response): Promise<void> {
    const dims = await dimensionsOrReject(req, res);
    if (!dims) return;

    const effect = option(req.body?.effect) || "blur";
    if (!isRegionEffect(effect)) {
      fail(req, res, 400, "INVALID_CONVERSION", "Invalid effect. Allowed values: blur, pixelate.");
      return;
    }
    let intensity: number;
    let regions;
    try {
      intensity = parseOptionalInt(
        req.body?.intensity,
        BLUR_REGION_LIMITS.intensity.min,
        BLUR_REGION_LIMITS.intensity.max,
        BLUR_REGION_LIMITS.intensity.default,
        "Intensity"
      );
      regions = parseBlurRegions(req.body?.regions, dims.width, dims.height);
    } catch (err) {
      if (err instanceof MediaProcessingError) {
        fail(req, res, err.status, err.code, err.message);
        return;
      }
      throw err;
    }

    await startImageJob(req, res, {
      userId: req.user?.sub,
      label: `image/blur-regions/${effect}`,
      filePaths: [req.file!.path],
      downloadName: outputBase(req.file?.originalname, "-hidden"),
      run: (ctx) => blurRegionsImage(req.file!.path, regions, effect, intensity, ctx),
    });
  }

  /**
   * POST /api/media/image/watermark
   * type=text: text, fontSize?, opacity?, color?, position?, rotation?
   * type=image: logo upload + sizePercent?, opacity?, position?, rotation?
   */
  static async watermark(req: Request, res: Response): Promise<void> {
    const parts = req.files as
      | Record<string, Express.Multer.File[]>
      | undefined;
    const base = parts?.file?.[0];
    const logo = parts?.logo?.[0];
    const allPaths = [base?.path, logo?.path];

    const type = option(req.body?.type);
    if (type !== "text" && type !== "image") {
      failAll(res, 400, "INVALID_CONVERSION", "Invalid watermark type. Allowed values: text, image.", allPaths);
      return;
    }

    let opacityPercent: number;
    let position: WatermarkPosition;
    let rotationDeg: number;
    try {
      opacityPercent = parseOptionalInt(
        req.body?.opacity,
        WATERMARK_LIMITS.opacityPercent.min,
        WATERMARK_LIMITS.opacityPercent.max,
        WATERMARK_LIMITS.opacityPercent.default,
        "Opacity"
      );
      rotationDeg = parseOptionalInt(
        req.body?.rotation,
        WATERMARK_LIMITS.rotationDeg.min,
        WATERMARK_LIMITS.rotationDeg.max,
        WATERMARK_LIMITS.rotationDeg.default,
        "Rotation"
      );
      const positionRaw = option(req.body?.position) || "bottom-right";
      if (!isWatermarkPosition(positionRaw)) {
        throw new MediaProcessingError(
          "INVALID_CONVERSION",
          "Invalid watermark position.",
          400
        );
      }
      position = positionRaw;

      if (type === "text") {
        const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
        if (!text || text.length > WATERMARK_LIMITS.textMaxLength) {
          throw new MediaProcessingError(
            "INVALID_CONVERSION",
            `Provide watermark text of up to ${WATERMARK_LIMITS.textMaxLength} characters.`,
            400
          );
        }
        const fontSizePercent = parseOptionalInt(
          req.body?.fontSize,
          WATERMARK_LIMITS.fontSizePercent.min,
          WATERMARK_LIMITS.fontSizePercent.max,
          WATERMARK_LIMITS.fontSizePercent.default,
          "Font size"
        );
        const color = parseHexColor(req.body?.color, "#ffffff");
        await startImageJob(req, res, {
          userId: req.user?.sub,
          label: "image/watermark-text",
          filePaths: [base!.path],
          contentNames: [base!.originalname],
          downloadName: outputBase(base?.originalname, "-watermarked"),
          run: (ctx) =>
            watermarkWithText(
              base!.path,
              { type: "text", text, fontSizePercent, opacityPercent, color, position, rotationDeg },
              ctx
            ),
        });
        return;
      }

      // Logo mode requires the second upload.
      if (!logo) {
        throw new MediaProcessingError(
          "INVALID_CONVERSION",
          "Upload a logo image (multipart field 'logo') for this operation.",
          400
        );
      }
      const sizePercent = parseOptionalInt(
        req.body?.sizePercent,
        WATERMARK_LIMITS.logoSizePercent.min,
        WATERMARK_LIMITS.logoSizePercent.max,
        WATERMARK_LIMITS.logoSizePercent.default,
        "Logo size"
      );
      await startImageJob(req, res, {
        userId: req.user?.sub,
        label: "image/watermark-logo",
        filePaths: [base!.path, logo.path],
        contentNames: [base!.originalname, logo.originalname],
        downloadName: outputBase(base?.originalname, "-watermarked"),
        run: (ctx) =>
          watermarkWithLogo(
            base!.path,
            { type: "image", logoPath: logo.path, sizePercent, opacityPercent, position, rotationDeg },
            ctx
          ),
      });
      return;
    } catch (err) {
      await cleanup(allPaths);
      if (err instanceof MediaProcessingError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[media] image/watermark unexpected failure:", err);
      res.status(500).json({
        code: "PROCESSING_FAILED",
        error: "Unexpected image processing error.",
      });
    }
  }

  /** POST /api/media/image/strip-metadata — removes EXIF/GPS/XMP/IPTC. */
  static async stripMetadata(req: Request, res: Response): Promise<void> {
    await startImageJob(req, res, {
      userId: req.user?.sub,
      label: "image/strip-metadata",
      filePaths: [req.file!.path],
      downloadName: outputBase(req.file?.originalname, "-clean"),
      run: (ctx) => stripImageMetadata(req.file!.path, ctx),
    });
  }
}
