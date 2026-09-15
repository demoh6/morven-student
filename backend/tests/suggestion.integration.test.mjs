import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { startBackend } from "./helpers/server.mjs";

const prisma = new PrismaClient();

async function register(baseUrl, role) {
  const n = `sug-${role}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
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

describe("Suggestions API", () => {
  let server;

  before(async () => {
    server = await startBackend();
  });
  after(async () => {
    await server?.stop();
    await prisma.$disconnect().catch(() => {});
  });

  it("allows an authenticated user to submit a suggestion", async () => {
    const user = await register(server.baseUrl, "submitter");
    const res = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({ title: "اقتراح اختبار", content: "محتوى الاقتراح" }),
    });
    assert.equal(res.status, 201);
    const { suggestion } = await res.json();
    assert.equal(suggestion.title, "اقتراح اختبار");
    assert.equal(suggestion.content, "محتوى الاقتراح");
    assert.equal(suggestion.userId, user.id);

    const stored = await prisma.suggestion.findUnique({
      where: { id: suggestion.id },
      include: { user: true },
    });
    assert.ok(stored, "suggestion must exist in the database");
    assert.equal(stored.userId, user.id, "suggestion must be related to the user");
    assert.equal(stored.user.email, user.email);
  });

  it("rejects unauthenticated submission", async () => {
    const res = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "بدون تسجيل", content: "يجب رفضه" }),
    });
    assert.equal(res.status, 401);
  });

  it("rejects an empty title", async () => {
    const user = await register(server.baseUrl, "emptytitle");
    const res = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({ title: "   ", content: "محتوى" }),
    });
    assert.equal(res.status, 400);

    const empty = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({ content: "محتوى" }),
    });
    assert.equal(empty.status, 400);
  });

  it("rejects an empty content", async () => {
    const user = await register(server.baseUrl, "emptycontent");
    const res = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({ title: "عنوان", content: "   " }),
    });
    assert.equal(res.status, 400);

    const empty = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({ title: "عنوان" }),
    });
    assert.equal(empty.status, 400);
  });

  it("ignores userId from the request body (no spoofing)", async () => {
    const user = await register(server.baseUrl, "spoiler");
    const other = await register(server.baseUrl, "victim");

    const res = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        title: "محاولة انتحال",
        content: "يجب أن يُنسب للمستخدم الحقيقي",
        userId: other.id,
        user_id: other.id,
      }),
    });
    assert.equal(res.status, 201);
    const { suggestion } = await res.json();
    assert.equal(suggestion.userId, user.id, "userId must come from the session");
    assert.notEqual(suggestion.userId, other.id);
  });

  it("keeps the user association even when the anonymous option is sent", async () => {
    const user = await register(server.baseUrl, "hidden");
    const res = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        title: "اقتراح متخفي",
        content: "يجب أن يظل مرتبطاً بالمستخدم رغم خيار التخفي",
        anonymous: true,
        isAnonymous: true,
      }),
    });
    assert.equal(res.status, 201);
    const { suggestion } = await res.json();
    assert.equal(suggestion.anonymous, true, "anonymous option must be stored");
    assert.equal(suggestion.userId, user.id, "anonymous option must not remove the user association");

    const stored = await prisma.suggestion.findUnique({
      where: { id: suggestion.id },
      include: { user: true },
    });
    assert.equal(stored.anonymous, true, "anonymous must be persisted");
    assert.equal(stored.userId, user.id, "suggestion must still be related to the user");
    assert.equal(stored.user.email, user.email);
  });

  it("stores anonymous=false by default when the option is not selected", async () => {
    const user = await register(server.baseUrl, "visible");
    const res = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({ title: "اقتراح عادي", content: "محتوى عادي" }),
    });
    assert.equal(res.status, 201);
    const { suggestion } = await res.json();
    assert.equal(suggestion.anonymous, false, "anonymous must default to false");
    assert.equal(suggestion.userId, user.id);

    const stored = await prisma.suggestion.findUnique({
      where: { id: suggestion.id },
    });
    assert.equal(stored.anonymous, false, "anonymous false must be persisted");
  });

  it("stores an explicit anonymous=false sent by the client", async () => {
    const user = await register(server.baseUrl, "explicitfalse");
    const res = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        title: "اقتراح بلا تخفي",
        content: "محتوى",
        anonymous: false,
      }),
    });
    assert.equal(res.status, 201);
    const { suggestion } = await res.json();
    assert.equal(suggestion.anonymous, false);
    assert.equal(suggestion.userId, user.id);
  });

  it("allows an admin to retrieve suggestions with user info, newest first", async () => {
    const a = await register(server.baseUrl, "adminview");

    await prisma.user.update({ where: { id: a.id }, data: { role: "ADMIN" } });
    const adminToken = await login(server.baseUrl, a);

    const submitter = await register(server.baseUrl, "viewsub");

    // Create three suggestions by the same user, ensuring timestamps are distinct.
    for (const title of ["الأقدم", "الأوسط", "الأحدث"]) {
      const res = await fetch(`${server.baseUrl}/api/suggestions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${submitter.accessToken}`,
        },
        body: JSON.stringify({ title, content: "محتوى " + title }),
      });
      assert.equal(res.status, 201);
    }

    // One more with the anonymous option selected.
    const anonymous = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${submitter.accessToken}`,
      },
      body: JSON.stringify({
        title: "الأحدث متخفي",
        content: "محتوى متخفي",
        anonymous: true,
      }),
    });
    assert.equal(anonymous.status, 201);
    const anonSuggestion = (await anonymous.json()).suggestion;
    assert.equal(anonSuggestion.anonymous, true);

    const res = await fetch(`${server.baseUrl}/api/admin/suggestions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const { suggestions } = await res.json();
    assert.ok(Array.isArray(suggestions));
    assert.ok(suggestions.length >= 4);

    // Suggestions for this submitter ordered newest first.
    const mine = suggestions.filter((s) => s.user.email === submitter.email);
    assert.equal(mine.length, 4);
    const titles = mine.map((s) => s.title);
    assert.deepEqual(titles, ["الأحدث متخفي", "الأحدث", "الأوسط", "الأقدم"]);

    assert.equal(mine[0].anonymous, true, "admin API must return the anonymous value");
    assert.equal(mine[1].anonymous, false, "anonymous must default to false");

    for (const s of mine) {
      assert.equal(s.user.email, submitter.email);
      assert.equal(s.user.displayName, submitter.user.displayName);
      assert.ok(s.user.hasOwnProperty("avatarUrl"));
      assert.equal(typeof s.user.avatarUrl, "object"); // null or string
      assert.equal(typeof s.user.id, "string");
      assert.equal(typeof s.user.username, "string");
      assert.equal(typeof s.anonymous, "boolean");
      // Sensitive fields must not leak.
      assert.equal(s.user.passwordHash, undefined);
      assert.equal(s.user.googleId, undefined);
    }
  });

  it("denies a regular user access to admin suggestions", async () => {
    const user = await register(server.baseUrl, "denieduser");
    const res = await fetch(`${server.baseUrl}/api/admin/suggestions`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    assert.equal(res.status, 403);
  });

  it("denies unauthenticated access to admin suggestions", async () => {
    const res = await fetch(`${server.baseUrl}/api/admin/suggestions`);
    assert.equal(res.status, 401);
  });

  it("does not expose a list endpoint to normal users", async () => {
    const user = await register(server.baseUrl, "nolist");
    const res = await fetch(`${server.baseUrl}/api/suggestions`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    assert.equal(res.status, 404);
  });

  it("allows an admin to permanently delete a suggestion", async () => {
    const admin = await register(server.baseUrl, "deladmin");
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
    const adminToken = await login(server.baseUrl, admin);

    const submitter = await register(server.baseUrl, "delsub");
    const create = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${submitter.accessToken}`,
      },
      body: JSON.stringify({ title: "سيتم حذفه", content: "محتوى ستحذفه" }),
    });
    assert.equal(create.status, 201);
    const { suggestion } = await create.json();

    const del = await fetch(
      `${server.baseUrl}/api/admin/suggestions/${suggestion.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.equal(del.status, 200);
    assert.equal((await del.json()).deleted, true);

    const stored = await prisma.suggestion.findUnique({
      where: { id: suggestion.id },
    });
    assert.equal(stored, null, "suggestion must be gone from the database");

    const list = await fetch(`${server.baseUrl}/api/admin/suggestions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const { suggestions } = await list.json();
    assert.ok(
      !suggestions.some((s) => s.id === suggestion.id),
      "deleted suggestion must not appear in the admin list"
    );
  });

  it("denies a regular user from deleting suggestions (403)", async () => {
    const user = await register(server.baseUrl, "deldenied");
    const admin = await register(server.baseUrl, "deladmin2");
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
    const adminToken = await login(server.baseUrl, admin);

    const create = await fetch(`${server.baseUrl}/api/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.accessToken}`,
      },
      body: JSON.stringify({ title: "هدف الحذف", content: "يجب ألا يُحذف" }),
    });
    assert.equal(create.status, 201);
    const { suggestion } = await create.json();

    const del = await fetch(
      `${server.baseUrl}/api/admin/suggestions/${suggestion.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${user.accessToken}` } }
    );
    assert.equal(del.status, 403);

    const stored = await prisma.suggestion.findUnique({
      where: { id: suggestion.id },
    });
    assert.ok(stored, "suggestion must still exist after a denied delete");
  });

  it("denies unauthenticated suggestion deletion (401)", async () => {
    const res = await fetch(
      `${server.baseUrl}/api/admin/suggestions/does-not-matter`,
      { method: "DELETE" }
    );
    assert.equal(res.status, 401);
  });

  it("returns 404 when deleting a non-existent suggestion", async () => {
    const admin = await register(server.baseUrl, "delmiss");
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
    const adminToken = await login(server.baseUrl, admin);

    const res = await fetch(
      `${server.baseUrl}/api/admin/suggestions/does-not-exist`,
      { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.equal(res.status, 404);
  });
});