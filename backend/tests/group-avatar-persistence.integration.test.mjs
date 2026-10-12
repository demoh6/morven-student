import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "./helpers/server.mjs";
import { register } from "./helpers/auth.mjs";

/**
 * Regression coverage for the group avatar root cause: the production backend
 * stores uploads on an ephemeral container filesystem, so an avatar file can
 * vanish (restart/redeploy) while the DB still references "/uploads/<file>".
 * The durable mirror in PostgreSQL must keep serving the exact same bytes under
 * the same URL. These tests simulate the wipe by deleting the on-disk file while
 * the backend keeps running, and by fully restarting the backend.
 */

const BACKEND_DIR = fileURLToPath(new URL("..", import.meta.url));
const UPLOADS_DIR = path.join(BACKEND_DIR, "uploads");

// A valid 1x1 PNG. Content is not validated for avatar uploads (only MIME type),
// but a real PNG keeps the flow honest.
const PNG_A = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const PNG_B = Buffer.concat([PNG_A, Buffer.from("\nsecond-image-bytes")]);

const createdFiles = new Set();

function trackFrom(imageUrl) {
  if (imageUrl && imageUrl.startsWith("/uploads/")) {
    createdFiles.add(path.basename(imageUrl));
  }
}

async function createGroupWithImage(baseUrl, token, name, bytes) {
  const form = new FormData();
  form.append("name", name);
  form.append("image", new Blob([bytes], { type: "image/png" }), "avatar.png");
  const res = await fetch(`${baseUrl}/api/groups`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json();
  trackFrom(body?.group?.imageUrl);
  return { res, body };
}

async function patchGroup(baseUrl, token, groupId, { name, bytes } = {}) {
  if (bytes) {
    const form = new FormData();
    if (name !== undefined) form.append("name", name);
    form.append("image", new Blob([bytes], { type: "image/png" }), "avatar.png");
    const res = await fetch(`${baseUrl}/api/groups/${groupId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = await res.json();
    trackFrom(body?.group?.imageUrl);
    return { res, body };
  }
  const res = await fetch(`${baseUrl}/api/groups/${groupId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return { res, body: await res.json() };
}

async function patchRemoveImage(baseUrl, token, groupId) {
  const form = new FormData();
  form.append("removeImage", "true");
  const res = await fetch(`${baseUrl}/api/groups/${groupId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { res, body: await res.json() };
}

async function fetchImage(baseUrl, imageUrl) {
  const res = await fetch(`${baseUrl}${imageUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, contentType: res.headers.get("content-type") };
}

async function wipeDiskFile(imageUrl) {
  await unlink(path.join(UPLOADS_DIR, path.basename(imageUrl))).catch(() => {});
}

describe("Group avatar durability (durable mirror in PostgreSQL)", () => {
  let server;
  let member;

  before(async () => {
    server = await startBackend();
    member = await register(server.baseUrl, "avatarmember");
  });

  after(async () => {
    for (const filename of createdFiles) {
      await unlink(path.join(UPLOADS_DIR, filename)).catch(() => {});
    }
    await server?.stop();
  });

  it("serves the uploaded avatar, then keeps serving it after the disk file is wiped", async () => {
    const owner = await register(server.baseUrl, "avatarowner");
    const { res, body } = await createGroupWithImage(server.baseUrl, owner.accessToken, "Durable Group", PNG_A);
    assert.equal(res.status, 201, JSON.stringify(body));
    const imageUrl = body.group.imageUrl;
    assert.match(imageUrl, /^\/uploads\/.+\.png$/);

    const fresh = await fetchImage(server.baseUrl, imageUrl);
    assert.equal(fresh.status, 200);
    assert.ok(fresh.buf.equals(PNG_A), "served bytes must equal the uploaded bytes");

    // Simulate the ephemeral container losing the file while the DB reference
    // (and durable mirror) remain — the exact production failure.
    await wipeDiskFile(imageUrl);

    const afterWipe = await fetchImage(server.baseUrl, imageUrl);
    assert.equal(afterWipe.status, 200, "avatar must survive the disk wipe via the durable store");
    assert.ok(afterWipe.buf.equals(PNG_A), "durable bytes must match the uploaded bytes");
    assert.match(afterWipe.contentType || "", /image\/png/);
  });

  it("returns the same avatar URL to every member, including one who joins later", async () => {
    const owner = await register(server.baseUrl, "avatarowner");
    const created = await createGroupWithImage(server.baseUrl, owner.accessToken, "Shared Group", PNG_A);
    const group = created.body.group;

    const joinRes = await fetch(`${server.baseUrl}/api/groups/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${member.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode: group.joinCode }),
    });
    assert.equal(joinRes.status, 200);

    const detailsRes = await fetch(`${server.baseUrl}/api/groups/${group.id}`, {
      headers: { Authorization: `Bearer ${member.accessToken}` },
    });
    const details = await detailsRes.json();
    assert.equal(details.group.imageUrl, group.imageUrl, "members must see the identical avatar URL");

    // Even after the on-disk copy is gone, the later joiner can load it.
    await wipeDiskFile(group.imageUrl);
    const img = await fetchImage(server.baseUrl, group.imageUrl);
    assert.equal(img.status, 200);
    assert.ok(img.buf.equals(PNG_A));
  });

  it("does not erase the avatar on a partial update (name only)", async () => {
    const owner = await register(server.baseUrl, "avatarowner");
    const created = await createGroupWithImage(server.baseUrl, owner.accessToken, "Partial Group", PNG_A);
    const group = created.body.group;

    const patched = await patchGroup(server.baseUrl, owner.accessToken, group.id, { name: "Renamed Group" });
    assert.equal(patched.res.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.group.name, "Renamed Group");
    assert.equal(patched.body.group.imageUrl, group.imageUrl, "avatar URL must be untouched");

    await wipeDiskFile(group.imageUrl);
    const img = await fetchImage(server.baseUrl, group.imageUrl);
    assert.equal(img.status, 200, "avatar must still be served after a partial update");
  });

  it("does not erase the avatar when an update is rejected as invalid", async () => {
    const owner = await register(server.baseUrl, "avatarowner");
    const created = await createGroupWithImage(server.baseUrl, owner.accessToken, "Reject Group", PNG_A);
    const group = created.body.group;

    const bad = await patchGroup(server.baseUrl, owner.accessToken, group.id, { name: "" });
    assert.equal(bad.res.status, 400);

    const detailsRes = await fetch(`${server.baseUrl}/api/groups/${group.id}`, {
      headers: { Authorization: `Bearer ${owner.accessToken}` },
    });
    const details = await detailsRes.json();
    assert.equal(details.group.imageUrl, group.imageUrl, "a rejected update must not clear the avatar");

    await wipeDiskFile(group.imageUrl);
    const img = await fetchImage(server.baseUrl, group.imageUrl);
    assert.equal(img.status, 200);
  });

  it("replaces an avatar durably and stops serving the previous file", async () => {
    const owner = await register(server.baseUrl, "avatarowner");
    const created = await createGroupWithImage(server.baseUrl, owner.accessToken, "Replace Group", PNG_A);
    const group = created.body.group;
    const oldUrl = group.imageUrl;

    const replaced = await patchGroup(server.baseUrl, owner.accessToken, group.id, { bytes: PNG_B });
    assert.equal(replaced.res.status, 200, JSON.stringify(replaced.body));
    const newUrl = replaced.body.group.imageUrl;
    assert.notEqual(newUrl, oldUrl);

    // New avatar is durable (survives a disk wipe).
    await wipeDiskFile(newUrl);
    const newImg = await fetchImage(server.baseUrl, newUrl);
    assert.equal(newImg.status, 200);
    assert.ok(newImg.buf.equals(PNG_B));

    // Previous avatar is fully removed (disk + durable row) → 404.
    const oldImg = await fetchImage(server.baseUrl, oldUrl);
    assert.equal(oldImg.status, 404);
  });

  it("removes the avatar (disk + durable row) on removeImage", async () => {
    const owner = await register(server.baseUrl, "avatarowner");
    const created = await createGroupWithImage(server.baseUrl, owner.accessToken, "Remove Image Group", PNG_A);
    const group = created.body.group;

    const removed = await patchRemoveImage(server.baseUrl, owner.accessToken, group.id);
    assert.equal(removed.res.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.group.imageUrl, null);

    const img = await fetchImage(server.baseUrl, group.imageUrl);
    assert.equal(img.status, 404);
  });

  it("removes the durable row when the group is deleted", async () => {
    const owner = await register(server.baseUrl, "avatarowner");
    const created = await createGroupWithImage(server.baseUrl, owner.accessToken, "Delete Group", PNG_A);
    const group = created.body.group;

    const del = await fetch(`${server.baseUrl}/api/groups/${group.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${owner.accessToken}` },
    });
    assert.ok(del.ok, `delete failed: ${del.status}`);

    const img = await fetchImage(server.baseUrl, group.imageUrl);
    assert.equal(img.status, 404, "deleted group's avatar must no longer be served");
  });

  it("keeps a profile avatar after the disk file is wiped", async () => {
    const form = new FormData();
    form.append("avatar", new Blob([PNG_A], { type: "image/png" }), "me.png");
    const res = await fetch(`${server.baseUrl}/api/profile/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${member.accessToken}` },
      body: form,
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    trackFrom(body.avatarUrl);

    await wipeDiskFile(body.avatarUrl);
    const img = await fetchImage(server.baseUrl, body.avatarUrl);
    assert.equal(img.status, 200, "profile avatar must survive the disk wipe");
    assert.ok(img.buf.equals(PNG_A));
  });
});

describe("Group avatar survives a full backend restart with a wiped disk", () => {
  let server;
  let owner;
  let group;

  before(async () => {
    server = await startBackend();
    owner = await register(server.baseUrl, "restartowner");
  });

  after(async () => {
    for (const filename of createdFiles) {
      await unlink(path.join(UPLOADS_DIR, filename)).catch(() => {});
    }
    await server?.stop();
  });

  it("still serves the avatar from the durable store after restart", async () => {
    const created = await createGroupWithImage(server.baseUrl, owner.accessToken, "Restart Group", PNG_A);
    group = created.body.group;
    assert.equal(created.res.status, 201, JSON.stringify(created.body));

    // Act like a redeploy: stop the process, wipe its (ephemeral) disk, start a
    // brand-new process. The DB keeps the reference + the durable mirror.
    await server.stop();
    await wipeDiskFile(group.imageUrl);
    server = await startBackend();

    const after = await fetchImage(server.baseUrl, group.imageUrl);
    assert.equal(after.status, 200, "avatar must survive a full restart with a wiped disk");
    assert.ok(after.buf.equals(PNG_A), "durable bytes must match the original upload");
  });
});
