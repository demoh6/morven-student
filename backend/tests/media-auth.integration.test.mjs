import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBackend } from "./helpers/server.mjs";
import { registerAndLogin } from "./helpers/auth.mjs";

/**
 * Media endpoints must enforce authentication (production 401 root-cause).
 *
 * Every /api/media/* route requires `Authorization: Bearer <access token>`;
 * these tests pin the exact boundary: unauthenticated traffic is rejected
 * with 401 BEFORE multer/processing, an invalid bearer is rejected, and a
 * valid bearer reaches the handler (validation 400 / job 404 — never 401).
 */

async function post(baseUrl, path, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, { method: "POST", headers, body: "{}" });
}

describe("Media routes require authentication", () => {
  let server;
  let token;

  before(async () => {
    server = await startBackend({ MEDIA_RATE_LIMIT_MAX: "500" });
    token = await registerAndLogin(server.baseUrl, "mediaauth");
  });
  after(async () => {
    await server?.stop();
  });

  it("rejects an unauthenticated video upload with 401 before any processing", async () => {
    const res = await post(server.baseUrl, "/api/media/edit-video");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "غير مصرح");
    assert.notEqual(body.code, "INVALID_CONVERSION", "must fail auth, not reach validation");
  });

  it("rejects an invalid bearer token with 401", async () => {
    const res = await post(server.baseUrl, "/api/media/edit-video", "not.a.valid.token");
    assert.equal(res.status, 401);
  });

  it("lets a valid bearer token past authentication (validation error, never 401)", async () => {
    const res = await post(server.baseUrl, "/api/media/edit-video", token);
    assert.equal(res.status, 400, "authenticated request must reach handler validation");
    const body = await res.json();
    assert.equal(body.code, "INVALID_CONVERSION");
  });

  it("requires authentication for job status, download and cancel", async () => {
    const jobId = "any-job-id";

    const status = await fetch(`${server.baseUrl}/api/media/jobs/${jobId}/status`);
    assert.equal(status.status, 401);

    const download = await fetch(`${server.baseUrl}/api/media/jobs/${jobId}/download`);
    assert.equal(download.status, 401);

    const cancel = await fetch(`${server.baseUrl}/api/media/jobs/${jobId}`, { method: "DELETE" });
    assert.equal(cancel.status, 401);
  });

  it("returns 404 JOB_NOT_FOUND (not 401) for an authenticated request to an unknown job", async () => {
    const headers = { Authorization: `Bearer ${token}` };

    const status = await fetch(`${server.baseUrl}/api/media/jobs/any-job-id/status`, { headers });
    assert.equal(status.status, 404);
    assert.equal((await status.json()).code, "JOB_NOT_FOUND");

    const cancel = await fetch(`${server.baseUrl}/api/media/jobs/any-job-id`, {
      method: "DELETE",
      headers,
    });
    assert.equal(cancel.status, 404);
    assert.equal((await cancel.json()).code, "JOB_NOT_FOUND");
  });

  it("requires authentication for image and audio tools", async () => {
    const resize = await post(server.baseUrl, "/api/media/image/resize");
    assert.equal(resize.status, 401);

    const cut = await post(server.baseUrl, "/api/media/audio/cut");
    assert.equal(cut.status, 401);

    const extract = await post(server.baseUrl, "/api/media/extract-audio");
    assert.equal(extract.status, 401);
  });
});
