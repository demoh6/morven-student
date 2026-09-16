import { randomUUID } from "crypto";
import {
  MediaProcessingError,
} from "./media.types";
import type { MediaErrorCode } from "./media.types";
import { removeUploadTempFiles } from "./media.utils";
import { sweepStaleMediaDirs } from "./media.service";

// Completed jobs (and their temp files) are kept briefly so slow clients can
// still fetch the download URL; override with MEDIA_JOB_TTL_MINUTES.
const JOB_TTL_MS =
  (Number(process.env.MEDIA_JOB_TTL_MINUTES) || 30) * 60 * 1000;

// Guard against resource exhaustion by capping concurrently running jobs.
const MAX_RUNNING_JOBS = Number(process.env.MAX_CONCURRENT_MEDIA_JOBS) || 6;

// How often the single periodic sweeper runs. It reclaims expired in-memory
// job records and stale temp artifacts (orphaned workdirs / root uploads)
// through the shared media lifecycle. Override only for tests/special deploys.
const SWEEP_INTERVAL_MS = Number(process.env.MEDIA_SWEEP_INTERVAL_MS) || 5 * 60 * 1000;

export type MediaJobStatus = "processing" | "done" | "error";

export interface MediaJobResultPayload {
  outputPath: string;
  workDir?: string;
  originalSize: number;
  outputSize: number;
  /** Optional secondary output (e.g. processed audio). */
  audioOutputPath?: string;
}

export interface MediaJob {
  id: string;
  status: MediaJobStatus;
  /** Real FFmpeg-derived fraction (0..1); -1 while unknown. */
  progress: number;
  code?: MediaErrorCode;
  error?: string;
  outputPath?: string;
  /** Optional secondary output path (e.g. processed audio for remove-music). */
  audioOutputPath?: string;
  /** Download name for the secondary audio output. */
  audioFileName?: string;
  workDir?: string;
  /** Primary uploaded input (single-file operations). */
  inputPath?: string;
  /** All uploaded inputs (multi-file operations such as merge). */
  inputPaths?: string[];
  fileName?: string;
  originalSize?: number;
  outputSize?: number;
  /**
   * Owner of the job: the authenticated user's JWT `sub`, assigned at creation
   * from req.user.sub. Never accepted from the client. Jobs created before
   * ownership was enforced have no userId and are treated as unowned — they
   * are invisible to every authenticated caller and only expire via the TTL
   * sweeper.
   */
  userId?: string;
  /**
   * Set synchronously when the first download request starts streaming.
   * Guarantees single-consumer download semantics: every later request
   * (concurrent or sequential) is deterministically rejected with 404.
   */
  downloadClaimed?: boolean;
  readonly controller: AbortController;
  readonly createdAt: number;
}

function ttlMs(): number {
  return JOB_TTL_MS;
}

/**
 * Registry of asynchronous media-processing jobs.
 *
 * Lifecycle:
 *   POST operation -> createJob() + start()  -> 202 { jobId }
 *   GET  /jobs/:id/status   -> progress / result metadata
 *   GET  /jobs/:id/download -> file stream, then cleanup
 *   DELETE /jobs/:id        -> abort + immediate cleanup
 *
 * A sweeper removes abandoned jobs and orphaned temp directories.
 */
export class MediaJobsService {
  private static jobs = new Map<string, MediaJob>();
  private static sweeperStarted = false;

  static ensureSweeper(): void {
    if (MediaJobsService.sweeperStarted) return;
    MediaJobsService.sweeperStarted = true;
    const interval = setInterval(() => MediaJobsService.sweep(), SWEEP_INTERVAL_MS);
    // Do not keep the process alive just for the sweeper.
    interval.unref?.();
  }

  static countRunning(): number {
    let running = 0;
    for (const job of MediaJobsService.jobs.values()) {
      if (job.status === "processing") running += 1;
    }
    return running;
  }

  static assertCapacity(): void {
    if (MediaJobsService.countRunning() >= MAX_RUNNING_JOBS) {
      throw new MediaProcessingError(
        "PROCESSING_FAILED",
        "The media server is busy. Please try again shortly.",
        503
      );
    }
  }

  static createJob(
    inputPath: string | string[],
    fileName: string,
    userId?: string
  ): MediaJob {
    MediaJobsService.ensureSweeper();
    const paths = Array.isArray(inputPath) ? inputPath : [inputPath];
    const job: MediaJob = {
      id: randomUUID(),
      status: "processing",
      progress: -1,
      inputPath: paths[0],
      inputPaths: paths,
      fileName,
      // Stamped from req.user.sub at creation; never client-supplied.
      userId,
      controller: new AbortController(),
      createdAt: Date.now(),
    };
    MediaJobsService.jobs.set(job.id, job);
    return job;
  }

  /**
   * Ownership check used by every job access endpoint (status, download,
   * download-audio, DELETE). A job is reachable only by its owner. Jobs that
   * predate ownership enforcement have no userId and are unowned — no caller
   * can access them, and the TTL sweeper cleans them up as usual.
   */
  static canAccess(job: MediaJob | undefined, userId: string): job is MediaJob {
    if (!job) return false;
    return job.userId !== undefined && job.userId === userId;
  }

  /**
   * Run the actual FFmpeg work for a job. Never throws: failures are stored
   * on the job record and surfaced through the status endpoint.
   */
  static start(
    job: MediaJob,
    workDir: string,
    run: (
      ctx: { signal: AbortSignal; onProgress: (fraction: number) => void }
    ) => Promise<MediaJobResultPayload>
  ): void {
    job.workDir = workDir;
    void run({
      signal: job.controller.signal,
      onProgress: (fraction) => {
        if (job.status === "processing") {
          job.progress = Math.max(0, Math.min(0.99, fraction));
        }
      },
    })
      .then(async (result) => {
        job.status = "done";
        job.progress = 1;
        job.outputPath = result.outputPath;
        if (result.audioOutputPath) job.audioOutputPath = result.audioOutputPath;
        if (result.workDir) job.workDir = result.workDir;
        job.originalSize = result.originalSize;
        job.outputSize = result.outputSize;
        // The uploaded originals are fully consumed once processing
        // succeeds; drop them right away instead of holding them for the
        // whole TTL. Only the (much smaller) output stays available for
        // download.
        await removeUploadTempFiles([
          ...(job.inputPaths ?? []),
          job.inputPath && !(job.inputPaths ?? []).includes(job.inputPath) ? job.inputPath : undefined,
        ]);
        job.inputPath = undefined;
        job.inputPaths = undefined;
        MediaJobsService.scheduleCleanup(job);
      })
      .catch(async (err) => {
        // Client cancellation: the DELETE endpoint already cleaned up.
        if (job.controller.signal.aborted && !MediaJobsService.jobs.has(job.id)) {
          return;
        }
        const mediaErr =
          err instanceof MediaProcessingError
            ? err
            : new MediaProcessingError("PROCESSING_FAILED", "Unexpected media processing error.");
        console.error(
          `[media] job ${job.id} failed (${mediaErr.code}):`,
          mediaErr.message
        );
        job.status = "error";
        job.code = mediaErr.code;
        job.error = mediaErr.message;
        // Failed jobs have nothing to download: delete temp files now and
        // keep only the in-memory record so clients can still poll the
        // failure reason until the TTL sweeper drops it.
        await MediaJobsService.deleteJobFiles(job);
        MediaJobsService.scheduleCleanup(job);
      });
  }

  static get(id: string): MediaJob | undefined {
    return MediaJobsService.jobs.get(id);
  }

  /** Cancel a running job and delete all its temporary files. */
  static async cancel(id: string): Promise<boolean> {
    const job = MediaJobsService.jobs.get(id);
    if (!job) return false;
    job.controller.abort();
    await MediaJobsService.deleteJobFiles(job);
    MediaJobsService.jobs.delete(id);
    return true;
  }

  /**
   * Atomically claim the right to stream a completed job's output.
   * Node handles requests on one thread, so check-and-set is atomic:
   * exactly one download request can ever win the claim. Losers (and any
   * request after the record is gone) are told the job is unknown.
   */
  static claimDownload(id: string): MediaJob | undefined {
    const job = MediaJobsService.jobs.get(id);
    if (!job || job.downloadClaimed) return undefined;
    job.downloadClaimed = true;
    return job;
  }

  /** Mark a job as fetched after download and clean everything up. */
  static async completeDownload(job: MediaJob): Promise<void> {
    await MediaJobsService.deleteJobFiles(job);
    MediaJobsService.jobs.delete(job.id);
  }

  private static scheduleCleanup(job: MediaJob): void {
    const timer = setTimeout(() => {
      void MediaJobsService.cancel(job.id);
    }, ttlMs());
    timer.unref?.();
  }

  private static async deleteJobFiles(job: MediaJob): Promise<void> {
    const paths: (string | undefined)[] = [job.workDir];
    for (const p of job.inputPaths ?? []) {
      paths.push(p);
    }
    if (job.inputPath && !(job.inputPaths ?? []).includes(job.inputPath)) {
      paths.push(job.inputPath);
    }
    await removeUploadTempFiles(paths);
  }

  private static async sweep(): Promise<void> {
    const now = Date.now();
    for (const job of Array.from(MediaJobsService.jobs.values())) {
      if (now - job.createdAt > ttlMs()) {
        await MediaJobsService.cancel(job.id);
      }
    }
    // Same periodic tick also reclaims stale temp artifacts (orphaned
    // workdirs from crashed processes, root uploads whose unlink lost a
    // Windows handle race) after MEDIA_JOB_TTL_MINUTES. One cleanup system.
    await sweepStaleMediaDirs();
  }
}
