import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { startBackend } from "./helpers/server.mjs";
import { registerAndLogin } from "./helpers/auth.mjs";

/**
 * Real end-to-end coverage for the image tools API. Everything runs against
 * the compiled backend with genuine libvips/sharp processing — no mocks.
 * Fixtures are generated on the fly with sharp itself (deterministic pixels
 * make pixel-level assertions possible).
 */

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".fixtures");

// Media endpoints require authentication; every request carries the bearer
// token obtained at server start.
let token = null;

/** fetch wrapper that always injects the auth header. */
function apiFetch(url, init) {
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function ensureImageFixtures() {
  await mkdir(FIXTURES_DIR, { recursive: true });

  // Subject on a uniform background (for background removal).
  const subjectPath = path.join(FIXTURES_DIR, "subject-bg.png");
  const subjectSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150">
       <rect width="200" height="150" fill="#f0f0f0"/>
       <circle cx="100" cy="75" r="50" fill="#dd2222"/>
     </svg>`
  );
  await sharp(subjectSvg).png().toFile(subjectPath);

  // Photo-like JPEG carrying EXIF metadata (for metadata stripping + general ops).
  const photoPath = path.join(FIXTURES_DIR, "photo.jpg");
  const photoSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="#2244cc"/><stop offset="1" stop-color="#ccaa22"/>
       </linearGradient></defs>
       <rect width="320" height="240" fill="url(#g)"/>
       <rect x="40" y="40" width="80" height="60" fill="#112233"/>
     </svg>`
  );
  await sharp(photoSvg)
    .withMetadata({
      exif: { IFD0: { Copyright: "MorvenTest", ImageDescription: "private-photo-description" } },
    })
    .jpeg({ quality: 95 })
    .toFile(photoPath);
  const exifPresent = (await sharp(photoPath).metadata()).exif;
  assert.ok(exifPresent, "fixture JPEG must contain EXIF before tests run");

  // Rich-content PNG for lossless region tests (byte-exact comparisons).
  const regionsPath = path.join(FIXTURES_DIR, "regions.png");
  const regionsSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="#ff8800"/><stop offset="1" stop-color="#00aa88"/>
       </linearGradient></defs>
       <rect width="320" height="240" fill="url(#g)"/>
       <rect x="40" y="40" width="80" height="60" fill="#102030"/>
       <circle cx="240" cy="180" r="35" fill="#ffee00"/>
       <ellipse cx="90" cy="190" rx="45" ry="20" fill="#cc00cc"/>
       <polygon points="250,30 300,80 200,80" fill="#00cc33"/>
     </svg>`
  );
  await sharp(regionsSvg).png().toFile(regionsPath);

  // Small logo with alpha (watermark graphic).
  const logoPath = path.join(FIXTURES_DIR, "logo.png");
  const logoSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20">
       <rect width="40" height="20" rx="4" fill="#1144ff"/>
     </svg>`
  );
  await sharp(logoSvg).png().toFile(logoPath);

  // Spoofed file: text bytes wearing a .png extension.
  const spoofedPath = path.join(FIXTURES_DIR, "not-an-image.png");
  await writeFile(spoofedPath, Buffer.from("this is definitely not a png image", "utf8"));

  // Corrupt image: valid PNG signature followed by junk.
  const corruptedPath = path.join(FIXTURES_DIR, "corrupted.png");
  const junk = Buffer.alloc(2048);
  for (let i = 0; i < junk.length; i++) junk[i] = (i * 37 + 11) % 253;
  await writeFile(corruptedPath, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), junk]));

  return { subjectPath, photoPath, regionsPath, logoPath, spoofedPath, corruptedPath };
}

async function uploadAndAwait(baseUrl, endpoint, filePath, fields = {}, fileName, timeoutMs = 60000) {
  const form = new FormData();
  const bytes = await readFile(filePath);
  form.append("file", new Blob([bytes]), fileName || path.basename(filePath));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);

  const started = await apiFetch(`${baseUrl}${endpoint}`, { method: "POST", body: form });
  if (!started.ok) {
    // Consume the body so the undici socket can be released (otherwise the
    // test runner's event loop never drains and the process hangs).
    await started.arrayBuffer().catch(() => {});
    return { started };
  }

  const startBody = await started.json();
  const { jobId } = startBody;
  const deadline = Date.now() + timeoutMs;
  let status = null;
  while (Date.now() < deadline) {
    const res = await apiFetch(`${baseUrl}/api/media/jobs/${jobId}/status`);
    status = await res.json();
    if (status.status === "done" || status.status === "error") break;
    await new Promise((r) => setTimeout(r, 300));
  }
  return { started, jobId, status };
}

/** Drain an unused response body to release its socket. */
async function drain(res) {
  try {
    await res.arrayBuffer();
  } catch {}
}

async function downloadResult(baseUrl, jobId) {
  const dl = await apiFetch(`${baseUrl}/api/media/jobs/${jobId}/download`);
  assert.equal(dl.status, 200, `download failed with ${dl.status}`);
  return Buffer.from(await dl.arrayBuffer());
}

function multipartPost(baseUrl, endpoint, filePath, fields, fieldName = "file") {
  return buildAndPost(baseUrl, endpoint, [{ field: fieldName, path: filePath }], fields);
}

async function buildAndPost(baseUrl, endpoint, files, fields) {
  const form = new FormData();
  for (const f of files) {
    const bytes = await readFile(f.path);
    form.append(f.field, new Blob([bytes]), path.basename(f.path));
  }
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return apiFetch(`${baseUrl}${endpoint}`, { method: "POST", body: form });
}

describe("image tools API (real sharp integration)", () => {
  let server;
  let fixtures;

  before(async () => {
    try {
      fixtures = await ensureImageFixtures();
      server = await startBackend({});
      token = await registerAndLogin(server.baseUrl, "imguser");
      const { appendFileSync } = await import("node:fs");
      appendFileSync("test-debug.log", `before ok: ${server.baseUrl}\n`);
    } catch (err) {
      const { appendFileSync } = await import("node:fs");
      appendFileSync("test-debug.log", `before FAILED: ${err && err.stack}\n`);
      throw err;
    }
  });

  it("removes a uniform background and returns transparent PNG", async () => {
    const { started, jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/remove-bg",
      fixtures.subjectPath
    );
    if (started && !started.ok) {
      const { appendFileSync } = await import("node:fs");
      appendFileSync("test-debug.log", `remove-bg start ${started.status}: ${JSON.stringify(await started.json())}\n`);
    }
    assert.equal(started.status, 202, JSON.stringify(started));
    assert.equal(status?.status, "done", JSON.stringify(status));

    const out = await downloadResult(server.baseUrl, jobId);
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.hasAlpha, true, "output must carry an alpha channel");
    assert.equal(meta.width, 200);
    assert.equal(meta.height, 150);

    const raw = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x, y) => raw.data[(y * raw.info.width + x) * 4 + 3];
    assert.equal(alphaAt(2, 2), 0, "corner must be fully transparent");
    assert.equal(alphaAt(100, 75), 255, "subject center must stay opaque");

    // Count transparency to confirm a real cutout happened.
    let transparent = 0;
    for (let i = 3; i < raw.data.length; i += 4) if (raw.data[i] === 0) transparent++;
    const fraction = transparent / (raw.info.width * raw.info.height);
    assert.ok(fraction > 0.4 && fraction < 0.95, `suspicious removed fraction ${fraction}`);
  });

  it("resizes by width and preserves aspect ratio", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/resize",
      fixtures.photoPath,
      { width: "160" }
    );
    assert.equal(status?.status, "done", JSON.stringify(status));
    const out = await downloadResult(server.baseUrl, jobId);
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, 160);
    assert.equal(meta.height, 120); // 320x240 scaled proportionally
  });

  it("crops an exact region", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/crop",
      fixtures.photoPath,
      { left: "10", top: "20", width: "100", height: "80" }
    );
    assert.equal(status?.status, "done", JSON.stringify(status));
    const out = await downloadResult(server.baseUrl, jobId);
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 100);
    assert.equal(meta.height, 80);
  });

  it("rotates 90 degrees swapping dimensions", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/rotate",
      fixtures.photoPath,
      { rotate: "90" }
    );
    assert.equal(status?.status, "done", JSON.stringify(status));
    const out = await downloadResult(server.baseUrl, jobId);
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 240);
    assert.equal(meta.height, 320);
  });

  it("flips horizontally with mirrored pixels", async () => {
    const original = await sharp(fixtures.photoPath).raw().toBuffer({ resolveWithObject: true });
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/rotate",
      fixtures.photoPath,
      { rotate: "0", flip: "h" }
    );
    assert.equal(status?.status, "done", JSON.stringify(status));
    const out = await downloadResult(server.baseUrl, jobId);
    const flipped = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true });

    const { width, height } = original.info;
    const at = (buf, info, x, y) => {
      const o = (y * info.width + x) * info.channels;
      return [buf[o], buf[o + 1], buf[o + 2]];
    };
    const sampleX = Math.floor(width * 0.2);
    const sampleY = Math.floor(height * 0.3);
    const mirrored = at(flipped.data, flipped.info, width - 1 - sampleX, sampleY);
    const source = at(original.data, original.info, sampleX, sampleY);
    assert.deepEqual(mirrored, source, "flip h must mirror pixels horizontally");
  });

  it("adjusts brightness measurably", async () => {
    const originalStats = await sharp(fixtures.photoPath).stats();
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/adjust",
      fixtures.photoPath,
      { brightness: "150" }
    );
    assert.equal(status?.status, "done", JSON.stringify(status));
    const out = await downloadResult(server.baseUrl, jobId);
    const brighter = await sharp(out).stats();
    assert.ok(
      brighter.channels[0].mean > originalStats.channels[0].mean + 5,
      "brightness 150% must raise mean luminance"
    );
  });

  it("blurs selected regions only", async () => {
    const region = { left: 40, top: 40, width: 80, height: 60 };
    const originalRegion = await sharp(fixtures.regionsPath)
      .extract(region)
      .stats();

    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/blur-regions",
      fixtures.regionsPath,
      { regions: JSON.stringify([region]), effect: "blur", intensity: "10" }
    );
    assert.equal(status?.status, "done", JSON.stringify(status));
    const out = await downloadResult(server.baseUrl, jobId);
    assert.equal((await sharp(out).metadata()).format, "png", "PNG in -> PNG out (lossless)");
    const full = await sharp(out).raw().toBuffer({ resolveWithObject: true });

    const blurredRegion = await sharp(full.data, {
      raw: { width: full.info.width, height: full.info.height, channels: full.info.channels },
    })
      .extract(region)
      .stats();
    assert.ok(
      blurredRegion.channels[0].stdev < originalRegion.channels[0].stdev,
      "blurred region must lose local contrast"
    );

    // A far-away patch must be untouched (byte-identical pixels, lossless).
    const cornerOriginal = await sharp(fixtures.regionsPath)
      .extract({ left: 280, top: 200, width: 30, height: 30 })
      .raw()
      .toBuffer();
    const cornerProcessed = await sharp(full.data, {
      raw: { width: full.info.width, height: full.info.height, channels: full.info.channels },
    })
      .extract({ left: 280, top: 200, width: 30, height: 30 })
      .raw()
      .toBuffer();
    assert.ok(cornerOriginal.equals(cornerProcessed), "outside pixels identical");
  });

  it("pixelates selected regions only", async () => {
    const region = { left: 40, top: 40, width: 80, height: 60 };
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/blur-regions",
      fixtures.regionsPath,
      { regions: JSON.stringify([region]), effect: "pixelate", intensity: "12" }
    );
    assert.equal(status?.status, "done", JSON.stringify(status));
    const out = await downloadResult(server.baseUrl, jobId);
    const full = await sharp(out).raw().toBuffer({ resolveWithObject: true });

    // Inside the blocky region many horizontal neighbours are identical.
    let equalNeighbours = 0;
    const stride = full.info.width * full.info.channels;
    const base = region.top * stride + region.left * full.info.channels;
    const rowLen = region.width * full.info.channels;
    for (let y = 0; y < region.height; y += 7) {
      for (let x = 0; x < rowLen - full.info.channels; x++) {
        if (full.data[base + y * stride + x] === full.data[base + y * stride + x + full.info.channels]) {
          equalNeighbours++;
        }
      }
    }
    assert.ok(equalNeighbours > rowLen / 2, "pixelated rows must contain flat runs");
  });

  it("applies a text watermark in the requested corner", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/watermark",
      fixtures.photoPath,
      {
        type: "text",
        text: "علامة مائية",
        color: "#ff0000",
        opacity: "100",
        fontSize: "15",
        position: "bottom-right",
        rotation: "0",
      },
      "صورة اختبار.jpg"
    );
    assert.equal(status?.status, "done", JSON.stringify(status));

    // Arabic filenames survive the round trip in the download name.
    const head = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
    const disposition = head.headers.get("content-disposition") || "";
    assert.match(disposition, /\.jpg/i);
    const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    assert.ok(utf8Name, "UTF-8 filename variant expected");
    const decoded = decodeURIComponent(utf8Name[1]);
    assert.ok(decoded.includes("صورة اختبار"), `unexpected download name: ${decoded}`);

    const out = Buffer.from(await head.arrayBuffer());
    const full = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    // Look for strongly red pixels near the bottom-right corner.
    let redPixels = 0;
    const W = full.info.width;
    const H = full.info.height;
    for (let y = H - 45; y < H; y++) {
      for (let x = W - 220; x < W; x++) {
        const o = (y * W + x) * full.info.channels;
        if (full.data[o] > 180 && full.data[o + 1] < 110 && full.data[o + 2] < 110) redPixels++;
      }
    }
    assert.ok(redPixels > 30, `expected red watermark glyphs in bottom-right, got ${redPixels}`);
  });

  it("composites a logo watermark onto the nine-grid anchor", async () => {
    const form = new FormData();
    form.append("file", new Blob([await readFile(fixtures.photoPath)]), "photo.jpg");
    form.append("logo", new Blob([await readFile(fixtures.logoPath)]), "logo.png");
    form.append("type", "image");
    form.append("sizePercent", "25");
    form.append("opacity", "90");
    // Bottom-right background is yellow in this fixture, so any blue pixel
    // found there must come from the logo itself.
    form.append("position", "bottom-right");
    form.append("rotation", "0");

    const started = await apiFetch(`${server.baseUrl}/api/media/image/watermark`, {
      method: "POST",
      body: form,
    });
    const startText = await started.text();
    assert.equal(started.status, 202, startText);
    const { jobId } = JSON.parse(startText);

    let status = null;
    for (let i = 0; i < 200; i++) {
      const res = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/status`);
      status = await res.json();
      if (status.status !== "processing") break;
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.equal(status?.status, "done", JSON.stringify(status));

    const out = await downloadResult(server.baseUrl, jobId);
    const full = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    let bluePixels = 0;
    const W = full.info.width;
    const H = full.info.height;
    for (let y = H - 70; y < H; y++) {
      for (let x = W - 220; x < W; x++) {
        const o = (y * W + x) * full.info.channels;
        if (full.data[o + 2] > 170 && full.data[o] < 130) bluePixels++;
      }
    }
    assert.ok(bluePixels > 200, `expected blue logo pixels bottom-right, got ${bluePixels}`);
  });

  it("strips EXIF metadata while keeping format and dimensions", async () => {
    const { jobId, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/strip-metadata",
      fixtures.photoPath
    );
    assert.equal(status?.status, "done", JSON.stringify(status));
    const out = await downloadResult(server.baseUrl, jobId);
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, "jpeg", "format must be preserved");
    assert.equal(meta.width, 320);
    assert.equal(meta.height, 240);
    assert.equal(meta.exif, undefined, "EXIF block must be gone");
  });

  it("rejects spoofed uploads whose content is not an image", async () => {
    const res = await multipartPost(
      server.baseUrl,
      "/api/media/image/resize",
      fixtures.spoofedPath,
      { width: "100" }
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, "UNSUPPORTED_FILE_TYPE");
  });

  it("reports corrupt images as job errors without leaking details", async () => {
    const { started, status } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/strip-metadata",
      fixtures.corruptedPath
    );
    assert.equal(started.status, 202);
    assert.equal(status?.status, "error", JSON.stringify(status));
    assert.match(status?.error || "", /corrupted|readable/i);
  });

  it("validates parameters synchronously", async () => {
    const cases = [
      ["/api/media/image/crop", { left: "300", top: "0", width: "100", height: "80" }, 400],
      ["/api/media/image/crop", { left: "0", top: "0", width: "9999", height: "80" }, 400],
      ["/api/media/image/rotate", { rotate: "0" }, 400],
      ["/api/media/image/adjust", {}, 400],
      ["/api/media/image/resize", {}, 400],
      ["/api/media/image/blur-regions", { regions: "not-json" }, 400],
      ["/api/media/image/blur-regions", { regions: "[]" }, 400],
      ["/api/media/image/remove-bg", { tolerance: "5000" }, 400],
      ["/api/media/image/watermark", { type: "text", text: "" }, 400],
    ];
    for (const [endpoint, fields, expectedStatus] of cases) {
      const res = await multipartPost(server.baseUrl, endpoint, fixtures.photoPath, fields);
      assert.equal(res.status, expectedStatus, `${endpoint} ${JSON.stringify(fields)}`);
      const body = await res.json();
      assert.ok(body.code, `error body must include code for ${endpoint}`);
    }
  });

  it("requires a logo upload in image watermark mode", async () => {
    const res = await multipartPost(server.baseUrl, "/api/media/image/watermark", fixtures.photoPath, {
      type: "image",
      sizePercent: "20",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /logo/i);
  });

  it("enforces job lifecycle rules on shared endpoints", async () => {
    // Unknown job id.
    const missing = await apiFetch(`${server.baseUrl}/api/media/jobs/does-not-exist/status`);
    assert.equal(missing.status, 404);
    const body = await missing.json();
    assert.equal(body.code, "JOB_NOT_FOUND");

    // Single-consumer download semantics.
    const { jobId } = await uploadAndAwait(
      server.baseUrl,
      "/api/media/image/resize",
      fixtures.photoPath,
      { width: "64" }
    );
    const first = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
    assert.equal(first.status, 200);
    await drain(first);
    const second = await apiFetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
    assert.equal(second.status, 404);
    await drain(second);
  });

  after(async () => {
    if (server) await server.stop();
    await new Promise((r) => setTimeout(r, 800));
    try {
      const proc = await import("node:process");
      console.log("ACTIVE_RESOURCES:", JSON.stringify(proc.default.getActiveResourcesInfo()));
      const { readdirSync } = await import("node:fs");
      void readdirSync;
    } catch {}
    await rm(FIXTURES_DIR, { recursive: true, force: true }).catch(() => {});
  });
});
