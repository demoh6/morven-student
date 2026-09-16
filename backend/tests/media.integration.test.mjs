import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "./helpers/server.mjs";
import { registerAndLogin } from "./helpers/auth.mjs";
import { ensureFixtures, fixturesDir, isFfmpegUsable } from "./helpers/fixtures.mjs";

const FFMPEG_PATH =
  process.env.FFMPEG_PATH || (process.platform === "win32" ? null : "ffmpeg");

let ffmpegUsable = false;
if (FFMPEG_PATH) {
  ffmpegUsable = await isFfmpegUsable(FFMPEG_PATH);
}

const skipReason = !FFMPEG_PATH
  ? "FFMPEG_PATH is not set - real FFmpeg integration tests are skipped"
  : !ffmpegUsable
    ? `FFMPEG_PATH (${FFMPEG_PATH}) is not a working ffmpeg binary`
    : false;

const TEMP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "temp"
);

async function tempRootEntries() {
  try {
    return await readdir(TEMP_ROOT);
  } catch {
    return [];
  }
}

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
    await new Promise((r) => setTimeout(r, 400));
  }
  return { jobId, status };
}

async function multipartPost(baseUrl, endpoint, filePath, fields) {
  const form = new FormData();
  const bytes = await readFile(filePath);
  form.append("file", new Blob([bytes]), path.basename(filePath));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return apiFetch(`${baseUrl}${endpoint}`, { method: "POST", body: form });
}

describe("media API (real FFmpeg integration)", { skip: skipReason }, () => {
  let server;
  let fixtures;

  before(async () => {
    fixtures = await ensureFixtures(FFMPEG_PATH);
    // Start from a clean temp root so cleanup assertions only see files
    // created by this run (older runs may have left stale artifacts).
    await rm(path.join(TEMP_ROOT, "media"), { recursive: true, force: true });
    for (const entry of await readdir(TEMP_ROOT).catch(() => [])) {
      if (entry !== "media" && entry !== ".gitkeep") {
        await rm(path.join(TEMP_ROOT, entry), { force: true });
      }
    }
    server = await startBackend({ FFMPEG_PATH });
    token = await registerAndLogin(server.baseUrl, "mediauser");
  });

  after(async () => {
    if (server) await server.stop();
  });

  it("POST /api/media/extract-audio produces a valid MP3", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/extract-audio",
      fixtures.small,
      { format: "mp3" }
    );
    assert.equal(status?.status, "done", JSON.stringify(status));
    assert.ok(status.progress > 0 && status.progress <= 1);

    const dl = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get("content-disposition") || "", /audio\.mp3/i);
    const blob = await dl.blob();
    assert.ok(blob.size > 1000, "audio output should not be empty");
    const head = Buffer.from(await blob.slice(0, 3).arrayBuffer());
    const isMp3 =
      (head[0] === 0x49 && head[1] === 0x44) || head[0] === 0xff;
    assert.ok(isMp3, "output should carry an MP3 magic header");
  });

  it("POST /api/media/extract-audio supports wav and m4a formats", async () => {
    for (const format of ["wav", "m4a"]) {
      const { jobId, status } = await uploadAndAwait(
        server.baseUrl,
        "/api/media/extract-audio",
        fixtures.small,
        { format }
      );
      assert.equal(status?.status, "done", `${format}: ${JSON.stringify(status)}`);
      assert.ok(status.outputSize > 1000);
      // Download so the job's temp files are reclaimed immediately.
      const dl = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
      assert.equal(dl.status, 200);
    }
  });

  it(
    "POST /api/media/compress-video reduces file size while keeping the MP4 container",
    { timeout: 320000 },
    async () => {
      const originalBytes = (await readFile(fixtures.large)).length;
      const { jobId, status } = await uploadAndAwait(
        server.baseUrl,
        "/api/media/compress-video",
        fixtures.large,
        { preset: "strong" },
        { timeoutMs: 300000 }
      );
      assert.equal(status?.status, "done", JSON.stringify(status));
      assert.ok(
        status.outputSize < originalBytes * 0.9,
        "compression must shrink the file significantly"
      );
      assert.equal(
        status.fileName,
        path.basename(fixtures.large, ".mp4") + "-compressed.mp4"
      );

      const dl = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
      assert.equal(dl.status, 200);
      const blob = await dl.blob();
      const boxType = Buffer.from(await blob.slice(4, 8).arrayBuffer()).toString("latin1");
      assert.equal(boxType, "ftyp", "output must be an MP4 container");
    }
  );

  it(
    "POST /api/media/convert-video mp4->webm yields an EBML/WebM file",
    async () => {
      const { jobId, status } = await uploadAndAwait(
        server.baseUrl,
        "/api/media/convert-video",
        fixtures.small,
        { target: "webm" }
      );
      assert.equal(status?.status, "done", JSON.stringify(status));
      const dl = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
      assert.equal(dl.status, 200);
      assert.match(dl.headers.get("content-disposition") || "", /converted\.webm/i);
      const magic = Buffer.from(await (await dl.blob()).slice(0, 4).arrayBuffer());
      assert.deepEqual([...magic], [0x1a, 0x45, 0xdf, 0xa3]);
    }
  );

  it("convert-video rejects same-format conversions with INVALID_CONVERSION", async () => {
    const res = await multipartPost(server.baseUrl, "/api/media/convert-video", fixtures.small, {
      target: "mp4",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, "INVALID_CONVERSION");
  });

  it("uploads with unsupported extensions/MIME get 415", async () => {
    const txt = path.join(fixturesDir(), "not-video.txt");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(txt, "plain text, definitely not a video");
    const res = await multipartPost(server.baseUrl, "/api/media/compress-video", txt, {});
    assert.equal(res.status, 415);
    const body = await res.json();
    assert.equal(body.code, "UNSUPPORTED_FILE_TYPE");
  });

  it("invalid option values get 400 without starting jobs", async () => {
    const badFormat = await multipartPost(server.baseUrl, "/api/media/extract-audio", fixtures.small, {
      format: "flac",
    });
    assert.equal(badFormat.status, 400);

    const missingFormat = await multipartPost(server.baseUrl, "/api/media/extract-audio", fixtures.small, {});
    assert.equal(missingFormat.status, 400);

    const badPreset = await multipartPost(server.baseUrl, "/api/media/compress-video", fixtures.small, {
      preset: "ultra",
    });
    assert.equal(badPreset.status, 400);

    const badTarget = await multipartPost(server.baseUrl, "/api/media/convert-video", fixtures.small, {
      target: "avi",
    });
    assert.equal(badTarget.status, 400);
  });

  it("corrupted video fails cleanly with PROCESSING_FAILED and no stderr leakage", async () => {
    const { status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/compress-video",
      fixtures.corrupted,
      { preset: "light" }
    );
    assert.equal(status?.status, "error", JSON.stringify(status));
    assert.equal(status.code, "PROCESSING_FAILED");
    assert.match(status.error, /corrupted/i);
    assert.doesNotMatch(
      status.error,
      /[\\/]|\bexec\b|command|argv/i,
      "raw technical detail must not leak"
    );
  });

  it("unknown job ids return 404", async () => {
    const res = await apiFetch(`${server.baseUrl}/api/media/jobs/nope/status`);
    assert.equal(res.status, 404);
  });

  it(
    "DELETE cancels a running job",
    { timeout: 60000 },
    async () => {
      const form = new FormData();
      const bytes = await readFile(fixtures.large);
      form.append("file", new Blob([bytes]), "video-large-quality.mp4");
      form.append("preset", "medium");
      const started = await apiFetch(`${server.baseUrl}/api/media/compress-video`, {
        method: "POST",
        body: form,
      });
      assert.equal(started.status, 202);
      const { jobId } = await started.json();

      const del = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}`, { method: "DELETE" });
      assert.equal(del.status, 200);

      await new Promise((r) => setTimeout(r, 1500));
      const res = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/status`);
      assert.equal(res.status, 404, "cancelled job must disappear immediately");
    }
  );

  it(
    "cleans up temp files after success and failure",
    { timeout: 180000 },
    async () => {
      // success path
      const okJob = await uploadAndAwait(server.baseUrl, "/api/media/extract-audio", fixtures.small, {
        format: "m4a",
      });
      assert.equal(okJob.status?.status, "done");
      await apiFetch(`${server.baseUrl}/api/media/jobs/${okJob.jobId}/download`);

      // failure path
      const failJob = await uploadAndAwait(
        server.baseUrl,
        "/api/media/compress-video",
        fixtures.corrupted,
        {}
      );
      assert.equal(failJob.status?.status, "error");

      await new Promise((r) => setTimeout(r, 1500));
      const leftovers = (await tempRootEntries()).filter((f) => f !== "media" && f !== ".gitkeep");
      assert.deepEqual(leftovers, [], "no uploaded files may remain in the temp root");
      assert.deepEqual(await mediaWorkDirs(), [], "no job work directories may remain");
    }
  );
});

describe("media API limits", { skip: skipReason }, () => {
  it(
    "rejects uploads above MAX_VIDEO_SIZE_MB with 413 FILE_TOO_LARGE",
    { timeout: 120000 },
    async () => {
      const fixtures = await ensureFixtures(FFMPEG_PATH);
      const server = await startBackend({ FFMPEG_PATH, MAX_VIDEO_SIZE_MB: "1" });
      const prevToken = token;
      token = await registerAndLogin(server.baseUrl, "medsize");
      try {
        const res = await multipartPost(server.baseUrl, "/api/media/compress-video", fixtures.large, {
          preset: "light",
        });
        assert.equal(res.status, 413);
        const body = await res.json();
        assert.equal(body.code, "FILE_TOO_LARGE");
      } finally {
        token = prevToken;
        await server.stop();
      }
    }
  );

  it(
    "surfaces PROCESSING_TIMEOUT when ffmpeg exceeds FFMPEG_TIMEOUT_MS",
    { timeout: 150000 },
    async () => {
      const fixtures = await ensureFixtures(FFMPEG_PATH);
      const server = await startBackend({ FFMPEG_PATH, FFMPEG_TIMEOUT_MS: "800" });
      const prevToken = token;
      token = await registerAndLogin(server.baseUrl, "medtimeout");
      try {
        const { status } = await uploadAndAwait(
          server.baseUrl,
          "/api/media/compress-video",
          fixtures.large,
          { preset: "strong" },
          { timeoutMs: 120000 }
        );
        assert.equal(status?.status, "error", JSON.stringify(status));
        assert.equal(status.code, "PROCESSING_TIMEOUT");
      } finally {
        token = prevToken;
        await server.stop();
      }
    }
  );

  it(
    "removes undownloaded outputs once MEDIA_JOB_TTL_MINUTES elapses",
    { timeout: 60000 },
    async () => {
      const fixtures = await ensureFixtures(FFMPEG_PATH);
      const server = await startBackend({ FFMPEG_PATH, MEDIA_JOB_TTL_MINUTES: "0.05" });
      const beforeDirs = new Set(await mediaWorkDirs());
      const prevToken = token;
      token = await registerAndLogin(server.baseUrl, "medttl");
      try {
        const { jobId, status } = await uploadAndAwait(
          server.baseUrl,
          "/api/media/extract-audio",
          fixtures.small,
          { format: "mp3" }
        );
        assert.equal(status?.status, "done");

        // TTL is 3s; the job must still be fetchable right away...
        const immediate = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/status`);
        assert.equal(immediate.status, 200);

        // ...and gone (with its files) shortly after the TTL.
        await new Promise((r) => setTimeout(r, 5000));
        const after = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/status`);
        assert.equal(after.status, 404);
        const afterDirs = await mediaWorkDirs();
        assert.equal(
          afterDirs.filter((d) => !beforeDirs.has(d)).length,
          0,
          "no unexpected work dirs"
        );
      } finally {
        token = prevToken;
        await server.stop();
      }
    }
  );
});
