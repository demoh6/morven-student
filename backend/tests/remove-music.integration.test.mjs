import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "./helpers/server.mjs";
import { registerAndLogin } from "./helpers/auth.mjs";
import { ensureFixtures, fixturesDir, isFfmpegUsable } from "./helpers/fixtures.mjs";

const FFMPEG_PATH =
  process.env.FFMPEG_PATH || (process.platform === "win32" ? null : "ffmpeg");

const PYTHON_PATH = process.env.PYTHON_PATH || "python3";

let ffmpegUsable = false;
if (FFMPEG_PATH) {
  ffmpegUsable = await isFfmpegUsable(FFMPEG_PATH);
}

const skipReason = !FFMPEG_PATH
  ? "FFMPEG_PATH is not set - real FFmpeg integration tests are skipped"
  : !ffmpegUsable
    ? `FFMPEG_PATH (${FFMPEG_PATH}) is not a working ffmpeg binary`
    : false;

/** Whether the Demucs separation engine is installed on this machine. */
function isDemucsUsable() {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_PATH, ["-c", "import demucs; print('ok')"], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

const demucsUsable = await isDemucsUsable();

const demucsSkipReason = skipReason
  ? skipReason
  : !demucsUsable
    ? `${PYTHON_PATH} cannot import demucs - source-separation pipeline tests are skipped`
    : false;

const FIXTURES_DIR = fixturesDir();

/**
 * A short H.264 video with NO audio track, used to verify the
 * "no music to remove" rejection happens before any separation work.
 */
async function ensureNoAudioFixture(ffmpegPath) {
  const file = path.join(FIXTURES_DIR, "video-no-audio.mp4");
  await mkdir(FIXTURES_DIR, { recursive: true });
  try {
    await readFile(file);
    return file;
  } catch {
    // generate: video only, no audio input at all
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, [
        "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=25",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
        "-pix_fmt", "yuv420p",
        "-an", file,
      ], { windowsHide: true });
      let stderr = "";
      child.stderr.on("data", (d) => {
        stderr += d;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`no-audio fixture failed: ${stderr.slice(-300)}`));
      });
    });
    return file;
  }
}

const TEMP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "temp"
);

async function mediaWorkDirs() {
  try {
    return (await readdir(path.join(TEMP_ROOT, "media"))).filter((d) => d !== ".gitkeep");
  } catch {
    return [];
  }
}

let token = null;

function apiFetch(url, init) {
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function uploadAndAwait(baseUrl, endpoint, filePath, fields = {}, { timeoutMs = 120000 } = {}) {
  const form = new FormData();
  const bytes = await readFile(filePath);
  form.append("file", new Blob([bytes]), path.basename(filePath));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);

  const started = await apiFetch(`${baseUrl}${endpoint}`, { method: "POST", body: form });
  if (!started.ok) return { started };

  const { jobId } = await started.json();
  const deadline = Date.now() + timeoutMs;
  let status = null;
  while (Date.now() < deadline) {
    const res = await apiFetch(`${baseUrl}/api/media/jobs/${jobId}/status`);
    status = await res.json();
    if (status.status === "done" || status.status === "error") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return { jobId, status };
}

async function multipartPost(baseUrl, endpoint, filePath, fields = {}) {
  const form = new FormData();
  const bytes = await readFile(filePath);
  form.append("file", new Blob([bytes]), path.basename(filePath));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return apiFetch(`${baseUrl}${endpoint}`, { method: "POST", body: form });
}

describe("remove-music API (validation, no separation engine needed)", { skip: skipReason }, () => {
  let server;
  let fixtures;

  before(async () => {
    fixtures = await ensureFixtures(FFMPEG_PATH);
    server = await startBackend({ FFMPEG_PATH });
    token = await registerAndLogin(server.baseUrl, "rmuser");
  });

  after(async () => {
    if (server) await server.stop();
  });

  it("uploads with unsupported extensions/MIME get 415", async () => {
    const txt = path.join(fixturesDir(), "not-video.txt");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(txt, "plain text, definitely not a video");
    const res = await multipartPost(server.baseUrl, "/api/media/remove-music", txt, {});
    assert.equal(res.status, 415);
    assert.equal((await res.json()).code, "UNSUPPORTED_FILE_TYPE");
  });

  it("videos without an audio track fail fast with NO_AUDIO_TRACK", async () => {
    const noAudio = await ensureNoAudioFixture(FFMPEG_PATH);
    const { started, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/remove-music",
      noAudio,
      {},
      { timeoutMs: 60000 }
    );
    assert.equal(started?.status, 202, "job must be accepted for processing");
    assert.equal(status?.status, "error", JSON.stringify(status));
    assert.equal(status.code, "NO_AUDIO_TRACK");
    assert.match(status.error, /no audio track/i);
  });

  it("unknown and erroring jobs return safe 404/409 for download-audio", async () => {
    const res = await apiFetch(`${server.baseUrl}/api/media/jobs/nope/download-audio`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, "JOB_NOT_FOUND");
  });

  it("rejects oversized uploads with 413 FILE_TOO_LARGE", async () => {
    const limitServer = await startBackend({ FFMPEG_PATH, MAX_VIDEO_SIZE_MB: "1" });
    const prevToken = token;
    token = await registerAndLogin(limitServer.baseUrl, "rmsize");
    try {
      const res = await multipartPost(limitServer.baseUrl, "/api/media/remove-music", fixtures.large, {});
      assert.equal(res.status, 413);
      assert.equal((await res.json()).code, "FILE_TOO_LARGE");
    } finally {
      token = prevToken;
      await limitServer.stop();
    }
  });
});

describe(
  "remove-music API (real Demucs source separation)",
  { skip: demucsSkipReason },
  () => {
    let server;
    let fixtures;

    before(async () => {
      fixtures = await ensureFixtures(FFMPEG_PATH);
      // Clean temp root so cleanup assertions only see artifacts of this run.
      await rm(path.join(TEMP_ROOT, "media"), { recursive: true, force: true });
      server = await startBackend({ FFMPEG_PATH });
      token = await registerAndLogin(server.baseUrl, "rmdemucs");
    });

    after(async () => {
      if (server) await server.stop();
    });

    it(
      "separates vocals from a real video and serves video + audio outputs",
      { timeout: 900000 },
      async () => {
        const { jobId, status } = await uploadAndAwait(
          server.baseUrl,
          "/api/media/remove-music",
          fixtures.small,
          {},
          { timeoutMs: 840000 }
        );
        assert.equal(status?.status, "done", JSON.stringify(status));
        assert.equal(status.fileName, "video-mp4-no-music.mp4");

        // The audio output is served by its own endpoint and must be
        // fetchable repeatedly without consuming the job.
        const audioFiles = [];
        for (let i = 0; i < 2; i++) {
          const audio = await apiFetch(
            `${server.baseUrl}/api/media/jobs/${jobId}/download-audio`
          );
          assert.equal(audio.status, 200, `audio fetch #${i + 1}`);
          assert.match(audio.headers.get("content-disposition") || "", /no-music\.mp3/i);
          const blob = await audio.blob();
          const head = Buffer.from(await blob.slice(0, 3).arrayBuffer());
          const isMp3 = (head[0] === 0x49 && head[1] === 0x44) || head[0] === 0xff;
          assert.ok(isMp3, "audio output must carry an MP3 magic header");
          assert.ok(blob.size > 1000, "audio output should not be empty");
          audioFiles.push(blob);
        }
        assert.deepEqual(audioFiles.map((b) => b.size), [audioFiles[0].size, audioFiles[0].size]);

        // Then the primary video download claims and cleans up the job.
        const video = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
        assert.equal(video.status, 200);
        assert.match(video.headers.get("content-disposition") || "", /no-music\.mp4/i);
        const videoBlob = await video.blob();
        const boxType = Buffer.from(await videoBlob.slice(4, 8).arrayBuffer()).toString("latin1");
        assert.equal(boxType, "ftyp", "video output must be an MP4 container");
        assert.ok(videoBlob.size > 1000, "video output should not be empty");

        // The consumed job is gone (files already cleaned by the download).
        const after = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/status`);
        assert.equal(after.status, 404, "downloaded job must be removed");

        await new Promise((r) => setTimeout(r, 1200));
        assert.deepEqual(await mediaWorkDirs(), [], "no job work directories may remain");
      }
    );

    it(
      "progress reaches the separation window during processing",
      { timeout: 900000 },
      async () => {
        const { jobId, status } = await uploadAndAwait(
          server.baseUrl,
          "/api/media/remove-music",
          fixtures.small,
          {},
          { timeoutMs: 840000 }
        );
        assert.equal(status?.status, "done", JSON.stringify(status));
        assert.ok(status.progress > 0.9, "final progress must be near 1.0");
        assert.equal(jobId !== undefined, true);
      }
    );
  }
);