import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startBackend } from "./helpers/server.mjs";
import { registerAndLogin } from "./helpers/auth.mjs";

const execFileAsync = promisify(execFile);

/**
 * Real end-to-end coverage for the dedicated audio tools API. Everything
 * runs against the compiled backend with genuine FFmpeg processing and the
 * actual Whisper model - no mocks. Fixtures are generated on the fly with
 * FFmpeg's signal sources; durations/volumes are verified with ffprobe and
 * volumedetect so the assertions measure the produced audio itself.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, ".fixtures", "audio");
const SPEECH_FIXTURE = path.join(HERE, "fixtures", "speech-sample.wav");

// Same convention as the video integration suite: real FFmpeg is required,
// otherwise the whole file is skipped with an explicit reason.
const FFMPEG_PATH =
  process.env.FFMPEG_PATH || (process.platform === "win32" ? null : "ffmpeg");
let ffmpegUsable = false;
if (FFMPEG_PATH) {
  try {
    await execFileAsync(FFMPEG_PATH, ["-version"]);
    ffmpegUsable = true;
  } catch {
    ffmpegUsable = false;
  }
}
const skipReason = !FFMPEG_PATH
  ? "FFMPEG_PATH is not set - real FFmpeg audio integration tests are skipped"
  : !ffmpegUsable
    ? `FFMPEG_PATH (${FFMPEG_PATH}) is not a working ffmpeg binary`
    : undefined;

const FFPROBE_PATH = process.env.FFPROBE_PATH || "ffprobe";

async function runFfmpeg(args) {
  await execFileAsync(FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
}

async function ensureAudioFixtures() {
  await mkdir(FIXTURES_DIR, { recursive: true });

  // Deterministic tones used by cut / enhance / merge.
  const mp3 = path.join(FIXTURES_DIR, "tone440_6s.mp3");
  const wav = path.join(FIXTURES_DIR, "tone880_8s.wav");
  const m4a = path.join(FIXTURES_DIR, "tone660_4s.m4a");
  await runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-c:a", "libmp3lame", "-q:a", "4", mp3,
  ]);
  // Low-amplitude source so a +100% boost cannot clip the samples.
  await runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=880:duration=8",
    "-af", "volume=0.25", "-c:a", "pcm_s16le", wav,
  ]);
  await runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=660:duration=4",
    "-c:a", "aac", "-b:a", "128k", m4a,
  ]);

  // Pink noise + tone mix: realistic input for the noise-reduction tool.
  const noisy = path.join(FIXTURES_DIR, "noisy_5s.wav");
  await runFfmpeg([
    "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.08:duration=5",
    "-f", "lavfi", "-i", "sine=frequency=500:duration=5",
    "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first",
    "-c:a", "pcm_s16le", noisy,
  ]);

  const silence = path.join(FIXTURES_DIR, "silence_3s.wav");
  await runFfmpeg([
    "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
    "-t", "3", "-c:a", "pcm_s16le", silence,
  ]);

  // Large enough to exceed a 1MB limit configured on the oversize server.
  const big = path.join(FIXTURES_DIR, "big_30s.wav");
  await runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=300:duration=30",
    "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", big,
  ]);

  // Spoofed upload: text bytes wearing an .mp3 extension.
  const spoofed = path.join(FIXTURES_DIR, "not-audio.mp3");
  await writeFile(spoofed, Buffer.from("this is definitely not an mp3 file", "utf8"));

  // Valid RIFF/WAVE header followed by junk: passes metadata + magic checks
  // but must fail during real decoding (job-level safe error).
  const corrupt = path.join(FIXTURES_DIR, "corrupt.wav");
  await writeFile(
    corrupt,
    Buffer.concat([Buffer.from("RIFF\x24\x00\x00\x00WAVEfmt ", "latin1"), Buffer.alloc(4096, 0x5a)])
  );

  // Arabic-named copy exercises UTF-8 filenames end to end.
  const arabic = path.join(FIXTURES_DIR, "تسجيل تجربة.mp3");
  await copyFile(mp3, arabic);

  return { mp3, wav, m4a, noisy, silence, big, spoofed, corrupt, arabic };
}

async function probeDurationSeconds(filePath) {
  const { stdout } = await execFileAsync(FFPROBE_PATH, [
    "-v", "error", "-print_format", "json", "-show_format", filePath,
  ]);
  const payload = JSON.parse(stdout);
  const value = Number(payload.format?.duration);
  return Number.isFinite(value) ? value : null;
}

async function measureMeanVolumeDb(filePath) {
  const { stderr } = await execFileAsync(
    FFMPEG_PATH,
    ["-hide_banner", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"]
  );
  const match = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  assert.ok(match, `volumedetect produced no mean_volume for ${path.basename(filePath)}`);
  return Number(match[1]);
}

async function bytes(filePath) {
  return readFile(filePath);
}

function multipartPost(baseUrl, endpoint, files, fields) {
  const form = new FormData();
  for (const f of files) {
    form.append(f.field, new Blob([f.bytes]), f.name);
  }
  for (const [k, v] of Object.entries(fields ?? {})) form.append(k, String(v));
  return apiFetch(`${baseUrl}${endpoint}`, { method: "POST", body: form });
}

/** Drain an unused response body to release its socket. */
async function drain(res) {
  try {
    await res.arrayBuffer();
  } catch {}
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

/**
 * GET-only fetch with network-level retries. During Whisper's first model
 * load the event loop can stall long enough for Windows to reset freshly
 * queued localhost connections; status polling must survive that.
 */
async function fetchStatus(url) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await apiFetch(url);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr;
}

async function uploadAndAwait(baseUrl, endpoint, files, fields = {}, timeoutMs = 90000) {
  const started = await multipartPost(baseUrl, endpoint, files, fields);
  if (started.status !== 202) {
    const problem = await started.json().catch(() => null);
    assert.fail(`start failed: ${started.status} ${JSON.stringify(problem)}`);
  }
  const { jobId } = await started.json();

  const deadline = Date.now() + timeoutMs;
  let status = null;
  while (Date.now() < deadline) {
    const res = await fetchStatus(`${baseUrl}/api/media/jobs/${jobId}/status`);
    status = await res.json();
    if (status.status === "done" || status.status === "error") break;
    await new Promise((r) => setTimeout(r, 300));
  }
  return { jobId, status };
}

describe("audio tools API (real FFmpeg + Whisper integration)", { skip: skipReason }, () => {
  let server;
  let fx;
  /** Every JSON body seen during the suite, for the leak scan at the end. */
  const seenBodies = [];

  function note(body) {
    seenBodies.push(JSON.stringify(body ?? {}));
    return body;
  }

  async function downloadTo(jobId, outPath) {
    const dl = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
    assert.equal(dl.status, 200, `download failed with ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    if (outPath) await writeFile(outPath, buf);
    return { buf, disposition: dl.headers.get("content-disposition") || "", type: dl.headers.get("content-type") || "" };
  }

  before(async () => {
    fx = await ensureAudioFixtures();
    server = await startBackend({});
    token = await registerAndLogin(server.baseUrl, "audiouser");
  });

  after(async () => {
    if (server) await server.stop();
    await rm(FIXTURES_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("cuts an MP3 segment with correct duration and format", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/audio/cut",
      [{ field: "file", name: "tone440_6s.mp3", bytes: await bytes(fx.mp3) }],
      { start: "1", end: "4" }
    );
    assert.equal(status?.status, "done", JSON.stringify(note(status)));

    const outPath = path.join(FIXTURES_DIR, "cut-result.mp3");
    const { disposition, type } = await downloadTo(jobId, outPath);
    assert.match(disposition, /-cut\.mp3/);
    assert.match(type, /audio\/mpeg/);

    const duration = await probeDurationSeconds(outPath);
    assert.ok(duration !== null && Math.abs(duration - 3) < 0.35, `cut duration was ${duration}`);
  });

  it("rejects cut windows with end <= start or beyond file duration", async () => {
    const badOrder = await multipartPost(
      server.baseUrl,
      "/api/media/audio/cut",
      [{ field: "file", name: "tone440_6s.mp3", bytes: await bytes(fx.mp3) }],
      { start: "4", end: "1" }
    );
    assert.equal(badOrder.status, 400);
    assert.equal((await badOrder.json()).code, "INVALID_CONVERSION");

    const beyond = await multipartPost(
      server.baseUrl,
      "/api/media/audio/cut",
      [{ field: "file", name: "tone440_6s.mp3", bytes: await bytes(fx.mp3) }],
      { start: "100", end: "105" }
    );
    assert.equal(beyond.status, 400);
    const beyondBody = note(await beyond.json());
    assert.equal(beyondBody.code, "INVALID_CONVERSION");
  });

  it("boosts volume by ~6dB through enhance while preserving WAV output", async () => {
    const inputMean = await measureMeanVolumeDb(fx.wav);
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/audio/enhance",
      [{ field: "file", name: "tone880_8s.wav", bytes: await bytes(fx.wav) }],
      { volume: "200" }
    );
    assert.equal(status?.status, "done", JSON.stringify(note(status)));
    assert.ok(status.outputSize > 0, "enhance must report an output size");

    const outPath = path.join(FIXTURES_DIR, "enhance-result.wav");
    const { disposition } = await downloadTo(jobId, outPath);
    assert.match(disposition, /-enhanced\.wav/);

    const outputMean = await measureMeanVolumeDb(outPath);
    const gain = outputMean - inputMean;
    assert.ok(
      gain > 4.5 && gain < 7.5,
      `expected ~+6dB gain, measured ${gain.toFixed(2)}dB`
    );
    const duration = await probeDurationSeconds(outPath);
    assert.ok(Math.abs(duration - 8) < 0.5, `enhanced duration ${duration}`);
  });

  it("rejects no-op enhance requests and invalid fade values", async () => {
    const noop = await multipartPost(
      server.baseUrl,
      "/api/media/audio/enhance",
      [{ field: "file", name: "tone880_8s.wav", bytes: await bytes(fx.wav) }],
      {}
    );
    assert.equal(noop.status, 400);
    assert.equal((await noop.json()).code, "INVALID_CONVERSION");

    const badFade = await multipartPost(
      server.baseUrl,
      "/api/media/audio/enhance",
      [{ field: "file", name: "tone880_8s.wav", bytes: await bytes(fx.wav) }],
      { fadeIn: "99" }
    );
    assert.equal(badFade.status, 400);
    drain(badFade);
  });

  it("applies normalization + clarity + fade-out as one pass", async () => {
    const { status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/audio/enhance",
      [{ field: "file", name: "noisy_5s.wav", bytes: await bytes(fx.noisy) }],
      { normalize: "true", clarity: "true", fadeOut: "2" }
    );
    assert.equal(status?.status, "done", JSON.stringify(note(status)));
  });

  it("cleans noise while keeping duration stable", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/audio/clean",
      [{ field: "file", name: "noisy_5s.wav", bytes: await bytes(fx.noisy) }],
      { strength: "strong" }
    );
    assert.equal(status?.status, "done", JSON.stringify(note(status)));

    const outPath = path.join(FIXTURES_DIR, "clean-result.wav");
    await downloadTo(jobId, outPath);
    const duration = await probeDurationSeconds(outPath);
    assert.ok(duration !== null && Math.abs(duration - 5) < 0.5, `cleaned duration ${duration}`);
  });

  it("merges mp3+wav+m4a in order into one MP3 of summed length", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/audio/merge",
      [
        { field: "files", name: "a.mp3", bytes: await bytes(fx.mp3) },
        { field: "files", name: "b.wav", bytes: await bytes(fx.wav) },
        { field: "files", name: "c.m4a", bytes: await bytes(fx.m4a) },
      ],
      {},
      120000
    );
    assert.equal(status?.status, "done", JSON.stringify(note(status)));

    const outPath = path.join(FIXTURES_DIR, "merge-result.mp3");
    const { disposition, type } = await downloadTo(jobId, outPath);
    assert.match(disposition, /merged\.mp3/);
    assert.match(type, /audio\/mpeg/);

    const duration = await probeDurationSeconds(outPath);
    assert.ok(duration !== null && duration > 17 && duration < 19.5, `merged duration ${duration}`);
  });

  it("rejects merge with fewer than two files or more than ten", async () => {
    const single = await multipartPost(
      server.baseUrl,
      "/api/media/audio/merge",
      [{ field: "files", name: "a.mp3", bytes: await bytes(fx.mp3) }]
    );
    assert.equal(single.status, 400);
    assert.match((await single.json()).error, /at least 2/);
    drain(single);

    const eleven = [];
    for (let i = 0; i < 11; i++) {
      eleven.push({ field: "files", name: `p${i}.mp3`, bytes: await bytes(fx.mp3) });
    }
    const tooMany = await multipartPost(server.baseUrl, "/api/media/audio/merge", eleven);
    assert.equal(tooMany.status, 400);
    const body = note(await tooMany.json());
    assert.match(body.error, /up to 10/);
  });

  it("transcribes real speech into text containing the expected words", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/audio/transcribe",
      [{ field: "file", name: "speech-sample.wav", bytes: await bytes(SPEECH_FIXTURE) }],
      { language: "auto" },
      240000
    );
    assert.equal(status?.status, "done", JSON.stringify(note(status)));

    const dl = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get("content-disposition") || "", /-transcript\.txt/);
    const text = (await dl.text()).trim().toLowerCase();
    assert.ok(
      text.includes("americans") || text.includes("country"),
      `transcript did not contain expected keywords: "${text}"`
    );
  });

  it("returns an empty transcript for pure silence instead of hallucinating", async () => {
    const { status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/audio/transcribe",
      [{ field: "file", name: "silence_3s.wav", bytes: await bytes(fx.silence) }],
      {},
      60000
    );
    assert.equal(status?.status, "done", JSON.stringify(note(status)));
    // Silence short-circuits inference; the transcript stays empty.
  });

  it("rejects unsupported transcription languages", async () => {
    const res = await multipartPost(
      server.baseUrl,
      "/api/media/audio/transcribe",
      [{ field: "file", name: "tone440_6s.mp3", bytes: await bytes(fx.mp3) }],
      { language: "xx" }
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "INVALID_CONVERSION");
  });

  it("rejects spoofed uploads whose contents do not match the extension", async () => {
    const res = await multipartPost(
      server.baseUrl,
      "/api/media/audio/cut",
      [{ field: "file", name: "not-audio.mp3", bytes: await bytes(fx.spoofed) }],
      { start: "0", end: "1" }
    );
    assert.equal(res.status, 415);
    assert.equal((await res.json()).code, "UNSUPPORTED_FILE_TYPE");
  });

  it("surfaces a safe error when decoding valid-header junk fails", async () => {
    const { status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/audio/clean",
      [{ field: "file", name: "corrupt.wav", bytes: await bytes(fx.corrupt) }],
      {}
    );
    assert.equal(status?.status, "error");
    assert.equal(status.code, "PROCESSING_FAILED");
    assert.doesNotMatch(status.error, /[A-Z]:\\|ffmpeg|node_modules/i);
  });

  it("answers 404 for unknown job ids on every job endpoint", async () => {
    const bogus = "00000000-0000-4000-8000-000000000000";
    for (const [method, url] of [
      ["GET", `/api/media/jobs/${bogus}/status`],
      ["GET", `/api/media/jobs/${bogus}/download`],
      ["DELETE", `/api/media/jobs/${bogus}`],
    ]) {
      const res = await apiFetch(`${server.baseUrl}${url}`, { method });
      assert.equal(res.status, 404, `${method} ${url}`);
      assert.equal((await res.json()).code, "JOB_NOT_FOUND");
    }
  });

  it("allows only one download per completed job (single consumer)", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/audio/clean",
      [{ field: "file", name: "noisy_5s.wav", bytes: await bytes(fx.noisy) }],
      { strength: "light" }
    );
    assert.equal(status?.status, "done");

    const first = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
    assert.equal(first.status, 200);
    await drain(first);
    const second = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
    assert.equal(second.status, 404);
    await drain(second);
  });

  it("supports cancelling a running job and removes its record", async () => {
    const started = await multipartPost(
      server.baseUrl,
      "/api/media/audio/merge",
      [
        { field: "files", name: "a.wav", bytes: await bytes(fx.big) },
        { field: "files", name: "b.wav", bytes: await bytes(fx.big) },
      ]
    );
    assert.equal(started.status, 202);
    const { jobId } = await started.json();

    const del = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}`, { method: "DELETE" });
    assert.equal(del.status, 200);
    assert.equal((await del.json()).status, "cancelled");

    const gone = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/status`);
    assert.equal(gone.status, 404);
  });

  it("handles Arabic filenames across processing and download", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/audio/cut",
      [{ field: "file", name: "تسجيل تجربة.mp3", bytes: await bytes(fx.arabic) }],
      { start: "0.5", end: "2.5" }
    );
    assert.equal(status?.status, "done", JSON.stringify(note(status)));

    const dl = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
    assert.equal(dl.status, 200);
    const disposition = decodeURIComponent(dl.headers.get("content-disposition") || "");
    assert.match(disposition, /-cut\.mp3/);
    assert.match(disposition, /تسجيل/, `arabic base missing from: ${disposition}`);
    await drain(dl);
  });

  it("enforces MAX_AUDIO_SIZE_MB with a 413 FILE_TOO_LARGE response", async () => {
    const small = await startBackend({ MAX_AUDIO_SIZE_MB: "1" });
    // Sub-server has its own DB registry; register a fresh user so the auth
    // middleware on small.baseUrl does not reject the request with 401 before
    // the size-limit check can fire.
    const prevToken = token;
    token = await registerAndLogin(small.baseUrl, "sizeuser");
    try {
      const res = await multipartPost(
        small.baseUrl,
        "/api/media/audio/clean",
        [{ field: "file", name: "big_30s.wav", bytes: await bytes(fx.big) }],
        {}
      );
      assert.equal(res.status, 413);
      const body = note(await res.json());
      assert.equal(body.code, "FILE_TOO_LARGE");
      assert.match(body.error, /1MB/);
    } finally {
      token = prevToken;
      await small.stop();
    }
  });

  it("never leaks internals across all responses observed in this suite", () => {
    const everything = seenBodies.join("\n");
    assert.doesNotMatch(everything, /[A-Z]:[\\/]\S+/i, "filesystem path leaked");
    assert.doesNotMatch(everything, /node_modules/i, "module path leaked");
    assert.doesNotMatch(everything, /ffmpeg\.exe|-hide_banner|spawn/i, "command detail leaked");
    assert.doesNotMatch(everything, /\bat .+:\d+:\d+\)/, "stack frame leaked");
  });
});
