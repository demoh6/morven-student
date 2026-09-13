import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { startBackend } from "./helpers/server.mjs";

const prisma = new PrismaClient();

async function register(baseUrl, role) {
  const n = `${role}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const suffix = n.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 28);
  const email = `${suffix}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      username: suffix,
      password: "SecurePass123!",
      displayName: role,
    }),
  });
  assert.equal(res.status, 201, `register ${role} should succeed`);
  const data = await res.json();
  return { ...data, email, password: "SecurePass123!", id: data.user.id };
}

async function login(baseUrl, { email, password }) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).accessToken;
}

const withTimeout = (ms, p) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms)),
  ]);

describe("Phase 2 - Resource authorization", () => {
  let server;

  before(async () => {
    server = await startBackend();
  });
  after(async () => {
    await server?.stop();
    await prisma.$disconnect().catch(() => {});
  });

  it("enforces full admin/owner control and member view-only access", async () => {
    const owner = await register(server.baseUrl, "owner");
    const member = await register(server.baseUrl, "member");
    const stranger = await register(server.baseUrl, "stranger");
    const adminUser = await register(server.baseUrl, "admincandidate");

    // Promote adminUser to ADMIN in DB, then log in again to embed the role.
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { role: "ADMIN" },
    });
    const adminToken = await login(server.baseUrl, adminUser);

    // 1. Create a resource as owner.
    const createRes = await fetch(`${server.baseUrl}/api/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.accessToken}` },
      body: JSON.stringify({ title: "ملخص الرياضيات", description: "وصف", type: "file" }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()).resource;
    const resourceId = created.id;
    assert.ok(created.ownerId, "resource must expose ownerId");
    assert.equal(created.ownerId, owner.id, "owner must be the creating user");

    const authOf = (token) => ({ Authorization: `Bearer ${token}` });

    // 2. Owner can update + delete (full control).
    const ownerPatch = await fetch(`${server.baseUrl}/api/resources/${resourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authOf(owner.accessToken) },
      body: JSON.stringify({ title: "ملخص الرياضيات المتقدم" }),
    });
    assert.equal(ownerPatch.status, 200, "owner can update");

    // 3. Member / stranger can view but NOT mutate.
    const memberView = await fetch(`${server.baseUrl}/api/resources/${resourceId}`, {
      headers: authOf(member.accessToken),
    });
    assert.equal(memberView.status, 200, "member can view detail");
    const memberBody = (await memberView.json()).resource;
    assert.equal(memberBody.ownerId, owner.id, "detail includes ownerId for frontend role-gating");

    const memberList = await fetch(`${server.baseUrl}/api/resources`, {
      headers: authOf(member.accessToken),
    });
    assert.equal(memberList.status, 200, "member can list");
    assert.ok((await memberList.json()).resources.some((r) => r.id === resourceId));

    const mutations = [
      ["PATCH", `${server.baseUrl}/api/resources/${resourceId}`, { title: "x" }],
      ["DELETE", `${server.baseUrl}/api/resources/${resourceId}`, null],
      ["POST", `${server.baseUrl}/api/resources/${resourceId}/notes`, { title: "ملاحظة", content: "نص" }],
      ["POST", `${server.baseUrl}/api/resources/${resourceId}/links`, { url: "https://example.com", title: "رابط" }],
    ];

    for (const [method, url, body] of mutations) {
      for (const actor of [member, stranger]) {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", ...authOf(actor.accessToken) },
          body: body ? JSON.stringify(body) : undefined,
        });
        assert.equal(res.status, 403, `${method} ${url} by ${actor.email} should be 403`);
      }
    }

    // 4. Owner uploads a file; member can list + download, member cannot delete.
    const fileName = "notes.txt";
    const fd = new FormData();
    fd.append("files", new Blob(["resource file content"], { type: "text/plain" }), fileName);
    const upload = await withTimeout(
      15000,
      fetch(`${server.baseUrl}/api/resources/${resourceId}/files`, {
        method: "POST",
        headers: authOf(owner.accessToken),
        body: fd,
      }),
    );
    assert.equal(upload.status, 201, "owner can upload");
    const { files } = await upload.json();
    const fileId = files[0].id;
    assert.ok(files[0].name, "file metadata includes name");

    const memberFiles = await fetch(`${server.baseUrl}/api/resources/${resourceId}/files`, {
      headers: authOf(member.accessToken),
    });
    assert.equal(memberFiles.status, 200, "member can list files");
    assert.equal((await memberFiles.json()).files.length, 1);

    const memberDownload = await fetch(
      `${server.baseUrl}/api/resources/${resourceId}/files/${fileId}/download`,
      { headers: authOf(member.accessToken) },
    );
    assert.equal(memberDownload.status, 200, "member can download");

    const memberDelFile = await fetch(
      `${server.baseUrl}/api/resources/${resourceId}/files/${fileId}`,
      { method: "DELETE", headers: authOf(member.accessToken) },
    );
    assert.equal(memberDelFile.status, 403, "member cannot delete file");

    const strangerDelFile = await fetch(
      `${server.baseUrl}/api/resources/${resourceId}/files/${fileId}`,
      { method: "DELETE", headers: authOf(stranger.accessToken) },
    );
    assert.equal(strangerDelFile.status, 403, "stranger cannot delete file");

    // 5. Per-child delete checks: member cannot delete another's note/link.
    const addNote = await fetch(`${server.baseUrl}/api/resources/${resourceId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authOf(owner.accessToken) },
      body: JSON.stringify({ title: "ملاحظة أصلية", content: "نص" }),
    });
    assert.equal(addNote.status, 201);
    const noteId = (await addNote.json()).note.id;

    const memberDelNote = await fetch(
      `${server.baseUrl}/api/resources/${resourceId}/notes/${noteId}`,
      { method: "DELETE", headers: authOf(member.accessToken) },
    );
    assert.equal(memberDelNote.status, 403, "member cannot delete note");

    const addLink = await fetch(`${server.baseUrl}/api/resources/${resourceId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authOf(owner.accessToken) },
      body: JSON.stringify({ url: "https://example.com", title: "رابط أصلي" }),
    });
    assert.equal(addLink.status, 201);
    const linkId = (await addLink.json()).link.id;

    const memberDelLink = await fetch(
      `${server.baseUrl}/api/resources/${resourceId}/links/${linkId}`,
      { method: "DELETE", headers: authOf(member.accessToken) },
    );
    assert.equal(memberDelLink.status, 403, "member cannot delete link");

    // 6. Owner can clean up their own children.
    const ownerDelFile = await fetch(
      `${server.baseUrl}/api/resources/${resourceId}/files/${fileId}`,
      { method: "DELETE", headers: authOf(owner.accessToken) },
    );
    assert.equal(ownerDelFile.status, 200);
    const ownerDelNote = await fetch(
      `${server.baseUrl}/api/resources/${resourceId}/notes/${noteId}`,
      { method: "DELETE", headers: authOf(owner.accessToken) },
    );
    assert.equal(ownerDelNote.status, 200);
    const ownerDelLink = await fetch(
      `${server.baseUrl}/api/resources/${resourceId}/links/${linkId}`,
      { method: "DELETE", headers: authOf(owner.accessToken) },
    );
    assert.equal(ownerDelLink.status, 200);

    // 7. Admin can update + delete a resource owned by another user.
    const adminPatch = await fetch(`${server.baseUrl}/api/resources/${resourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authOf(adminToken) },
      body: JSON.stringify({ title: "عدله الأدمن" }),
    });
    assert.equal(adminPatch.status, 200, "admin can update another user's resource");

    const adminDel = await fetch(`${server.baseUrl}/api/resources/${resourceId}`, {
      method: "DELETE",
      headers: authOf(adminToken),
    });
    assert.equal(adminDel.status, 200, "admin can delete another user's resource");

    const gone = await fetch(`${server.baseUrl}/api/resources/${resourceId}`, {
      headers: authOf(owner.accessToken),
    });
    assert.equal(gone.status, 404, "resource removed after admin delete");
  });

  it("requires authentication to list resources", async () => {
    const res = await fetch(`${server.baseUrl}/api/resources`);
    assert.equal(res.status, 401);
  });

  it("rejects dangerous/executable upload types (H2) and blocks direct serving", async () => {
    const owner = await register(server.baseUrl, "h2owner");
    const authOf = (token) => ({ Authorization: `Bearer ${token}` });

    const createRes = await fetch(`${server.baseUrl}/api/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authOf(owner.accessToken) },
      body: JSON.stringify({ title: "H2 file guard", description: "x", type: "note" }),
    });
    assert.equal(createRes.status, 201);
    const resourceId = (await createRes.json()).resource.id;

    // Denied types: even with a spoofed safe MIME, the extension blocks them.
    const blockedCases = [
      ["evil.html", "text/html"],
      ["evil.svg", "image/svg+xml"],
      ["evil.js", "text/javascript"],
      ["payload.pdf.html", "application/pdf"],
    ];

    for (const [fileName, mime] of blockedCases) {
      const fd = new FormData();
      fd.append("files", new Blob(["<script>alert(1)</script>"], { type: mime }), fileName);
      const res = await withTimeout(15000, fetch(
        `${server.baseUrl}/api/resources/${resourceId}/files`,
        { method: "POST", headers: authOf(owner.accessToken), body: fd },
      ));
      assert.equal(res.status, 422, `${fileName} should be rejected`);
    }

    // Allowed type still uploads (sanity that the allowlist didn't break legit files).
    const ok = new FormData();
    ok.append("files", new Blob(["safe file"], { type: "text/plain" }), "safe.txt");
    const okRes = await fetch(
      `${server.baseUrl}/api/resources/${resourceId}/files`,
      { method: "POST", headers: authOf(owner.accessToken), body: ok },
    );
    assert.equal(okRes.status, 201, "allowed text/plain upload should succeed");

    // The dedicated resource dir is never served via the public static mount.
    const direct = await fetch(`${server.baseUrl}/uploads/resources/somefile.txt`);
    assert.equal(direct.status, 404, "/uploads/resources must not be publicly served");
  });

  it("enforces private resources with 6-digit access codes end-to-end", async () => {
    const owner = await register(server.baseUrl, "pown");
    const member = await register(server.baseUrl, "pmem");
    const stranger = await register(server.baseUrl, "pstr");
    const adminUser = await register(server.baseUrl, "padm");
    await prisma.user.update({ where: { id: adminUser.id }, data: { role: "ADMIN" } });
    const adminToken = await login(server.baseUrl, adminUser);
    const authOf = (token) => ({ Authorization: `Bearer ${token}` });

    // 1. Owner creates a PRIVATE resource and receives a fresh 6-digit code.
    const createRes = await fetch(`${server.baseUrl}/api/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authOf(owner.accessToken) },
      body: JSON.stringify({ title: "ملخص خاص", description: "سري", type: "file", isPrivate: true }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()).resource;
    assert.equal(created.isPrivate, true, "isPrivate flag returned on create");
    assert.match(created.accessCode ?? "", /^\d{6}$/, "owner receives a 6-digit access code on create");
    const accessCode = created.accessCode;

    // 2. The code is never stored in plaintext.
    const dbRow = await prisma.resource.findUnique({ where: { id: created.id } });
    assert.ok(dbRow.accessCodeHash, "access code hash stored");
    assert.ok(dbRow.accessCodeCiphertext, "access code ciphertext stored");
    assert.notEqual(dbRow.accessCodeCiphertext, accessCode, "plaintext code is never stored");

    // 3. Lists + detail stay private for non-owners.
    const ownerList = await fetch(`${server.baseUrl}/api/resources`, { headers: authOf(owner.accessToken) });
    const ownerListEntry = (await ownerList.json()).resources.find((r) => r.id === created.id);
    assert.ok(ownerListEntry, "owner sees their own private resource in list");
    assert.equal(ownerListEntry.accessCode, undefined, "list never leaks the code");

    const memberList = await fetch(`${server.baseUrl}/api/resources`, { headers: authOf(member.accessToken) });
    assert.ok(!(await memberList.json()).resources.some((r) => r.id === created.id), "private resource hidden from other members");

    const memberDetail = await fetch(`${server.baseUrl}/api/resources/${created.id}`, { headers: authOf(member.accessToken) });
    assert.equal(memberDetail.status, 403, "other members cannot open a private resource");
    const locked = await memberDetail.json();
    assert.equal(locked.code, "PRIVATE_RESOURCE", "error carries PRIVATE_RESOURCE code");
    assert.equal(locked.error, "هذا المورد خاص");

    const strangerFiles = await fetch(`${server.baseUrl}/api/resources/${created.id}/files`, { headers: authOf(stranger.accessToken) });
    assert.equal(strangerFiles.status, 403, "files list is gated behind the code too");

    // 4. Wrong code rejected; correct code unlocks (and never leaks the code).
    const wrong = await fetch(`${server.baseUrl}/api/resources/${created.id}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authOf(member.accessToken) },
      body: JSON.stringify({ code: "000000" }),
    });
    assert.equal(wrong.status, 403, "wrong code rejected");

    const unlockRes = await fetch(`${server.baseUrl}/api/resources/${created.id}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authOf(member.accessToken) },
      body: JSON.stringify({ code: accessCode }),
    });
    assert.equal(unlockRes.status, 200, "correct code unlocks");
    const unlocked = (await unlockRes.json()).resource;
    assert.equal(unlocked.accessCode, undefined, "unlocked member never receives the code itself");

    // 5. After unlock: member sees it in their list and can download files.
    const memberList2 = await fetch(`${server.baseUrl}/api/resources`, { headers: authOf(member.accessToken) });
    assert.ok((await memberList2.json()).resources.some((r) => r.id === created.id), "unlocked resource visible to member");

    const fd = new FormData();
    fd.append("files", new Blob(["private payload"], { type: "text/plain" }), "secret.txt");
    const upload = await withTimeout(
      15000,
      fetch(`${server.baseUrl}/api/resources/${created.id}/files`, {
        method: "POST",
        headers: authOf(owner.accessToken),
        body: fd,
      }),
    );
    assert.equal(upload.status, 201);
    const fileId = (await upload.json()).files[0].id;

    const memberFiles = await fetch(`${server.baseUrl}/api/resources/${created.id}/files`, { headers: authOf(member.accessToken) });
    assert.equal(memberFiles.status, 200, "unlocked member can list files");
    const dl = await fetch(
      `${server.baseUrl}/api/resources/${created.id}/files/${fileId}/download`,
      { headers: authOf(member.accessToken) },
    );
    assert.equal(dl.status, 200, "unlocked member can download");
    const strangerDl = await fetch(
      `${server.baseUrl}/api/resources/${created.id}/files/${fileId}/download`,
      { headers: authOf(stranger.accessToken) },
    );
    assert.equal(strangerDl.status, 403, "stranger still cannot download");

    // 6. Public → access endpoint rejected; stranger can open it directly.
    const publicRes = await fetch(`${server.baseUrl}/api/resources/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authOf(owner.accessToken) },
      body: JSON.stringify({ isPrivate: false }),
    });
    assert.equal(publicRes.status, 200);
    assert.equal((await publicRes.json()).resource.isPrivate, false, "owner can make resource public");

    const accessPublic = await fetch(`${server.baseUrl}/api/resources/${created.id}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authOf(stranger.accessToken) },
      body: JSON.stringify({ code: "123456" }),
    });
    assert.equal(accessPublic.status, 400, "access endpoint rejected on public resource");

    const strangerDetail = await fetch(`${server.baseUrl}/api/resources/${created.id}`, { headers: authOf(stranger.accessToken) });
    assert.equal(strangerDetail.status, 200, "public resource is open to everyone");

    // 7. Re-privatizing mints a fresh access code.
    const rePrivate = await fetch(`${server.baseUrl}/api/resources/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authOf(owner.accessToken) },
      body: JSON.stringify({ isPrivate: true }),
    });
    assert.equal(rePrivate.status, 200);
    const rePrivateBody = (await rePrivate.json()).resource;
    assert.equal(rePrivateBody.isPrivate, true);
    assert.match(rePrivateBody.accessCode ?? "", /^\d{6}$/, "re-privatizing returns a fresh 6-digit code");
    assert.notEqual(rePrivateBody.accessCode, accessCode, "new code differs from the old one");

    // 8. Admin bypasses the code (can open + sees the code like the owner).
    const adminDetail = await fetch(`${server.baseUrl}/api/resources/${created.id}`, { headers: authOf(adminToken) });
    assert.equal(adminDetail.status, 200, "admin opens any private resource");
    const adminBody = (await adminDetail.json()).resource;
    assert.equal(adminBody.isPrivate, true);
    assert.match(adminBody.accessCode ?? "", /^\d{6}$/, "admin receives the code like the owner");

    // 9. Adding a resource by code alone (no resource ID) grants access in one step.
    const addUnknown = await fetch(`${server.baseUrl}/api/resources/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authOf(stranger.accessToken) },
      body: JSON.stringify({ code: "999999" }),
    });
    assert.equal(addUnknown.status, 404, "unknown code rejected");

    const addByCode = await fetch(`${server.baseUrl}/api/resources/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authOf(stranger.accessToken) },
      body: JSON.stringify({ code: rePrivateBody.accessCode }),
    });
    assert.equal(addByCode.status, 200, "correct code adds the private resource");
    const added = (await addByCode.json()).resource;
    assert.equal(added.id, created.id, "added resource matches the owner's private resource");
    assert.equal(added.accessCode, undefined, "added resource never leaks the code to a non-owner");

    const strangerList = await fetch(`${server.baseUrl}/api/resources`, { headers: authOf(stranger.accessToken) });
    assert.ok((await strangerList.json()).resources.some((r) => r.id === created.id), "resource now visible to stranger");

    const addAgain = await fetch(`${server.baseUrl}/api/resources/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authOf(stranger.accessToken) },
      body: JSON.stringify({ code: rePrivateBody.accessCode }),
    });
    assert.equal(addAgain.status, 200, "re-adding an already-unlocked code stays idempotent (200)");
  });
});
