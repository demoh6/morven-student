import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBackend } from "./helpers/server.mjs";
import { config as loadDotEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadDotEnv();

const prisma = new PrismaClient();

const createdUserIds = [];
const createdNotificationIds = [];
const createdGroupIds = [];

function uniqueSuffix(tag) {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${tag}${ts}${rnd}`;
}

async function register(baseUrl, suffix) {
  const safe = suffix.replace(/[^a-zA-Z0-9]/g, "_");
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `rh-${safe}@example.com`,
      username: `rh_${safe}`,
      password: "SecurePass123!",
      displayName: `RH ${suffix}`,
    }),
  });
  const data = await res.json();
  assert.ok([200, 201].includes(res.status), `register failed: ${JSON.stringify(data)}`);
  if (data.user?.id) createdUserIds.push(data.user.id);
  return data;
}

async function login(baseUrl, email) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "SecurePass123!" }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.accessToken);
  return data;
}

async function api(baseUrl, token, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { res, data: body };
}

const ROLE_ENDPOINT = (userId) => `/api/admin/users/${userId}/role`;

async function setRoleDb(userId, role) {
  await prisma.user.update({ where: { id: userId }, data: { role } });
}

async function createGroup(baseUrl, token, name) {
  const { res, data } = await api(baseUrl, token, "/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  assert.equal(res.status, 201, `createGroup failed: ${JSON.stringify(data)}`);
  createdGroupIds.push(data.group.id);
  return data.group;
}

describe("Role hierarchy: ADMIN / SUB_ADMIN / USER", () => {
  let server;
  let mainAdmin, subAdmin, normalUser;
  let adminToken, subAdminToken, userToken;

  before(async () => {
    server = await startBackend();

    // Register three users and assign roles directly in the DB (fresh login
    // tokens then carry the exact role, mirroring the existing test style).
    const a = await register(server.baseUrl, uniqueSuffix("main"));
    const s = await register(server.baseUrl, uniqueSuffix("sub"));
    const u = await register(server.baseUrl, uniqueSuffix("user"));
    await setRoleDb(a.user.id, "ADMIN");
    await setRoleDb(s.user.id, "SUB_ADMIN");

    const la = await login(server.baseUrl, a.user.email);
    const ls = await login(server.baseUrl, s.user.email);
    const lu = await login(server.baseUrl, u.user.email);
    assert.equal(la.user.role, "ADMIN");
    assert.equal(ls.user.role, "SUB_ADMIN");
    assert.equal(lu.user.role, "USER");

    mainAdmin = a.user;
    subAdmin = s.user;
    normalUser = u.user;
    adminToken = la.accessToken;
    subAdminToken = ls.accessToken;
    userToken = lu.accessToken;
  });

  after(async () => {
    for (const id of createdNotificationIds.splice(0)) {
      try { await prisma.appNotification.delete({ where: { id } }); } catch { /* already gone */ }
    }
    for (const id of createdGroupIds.splice(0)) {
      try { await prisma.group.delete({ where: { id } }); } catch { /* already gone */ }
    }
    for (const id of createdUserIds.splice(0)) {
      try { await prisma.user.delete({ where: { id } }); } catch { /* already gone */ }
    }
    await prisma.$disconnect();
    await server?.stop();
  });

  it("normal USER cannot access any admin functionality", async () => {
    const checks = await Promise.all([
      api(server.baseUrl, userToken, "/api/admin/users"),
      api(server.baseUrl, userToken, "/api/admin/suggestions"),
      api(server.baseUrl, userToken, "/api/admin/adhkar/submissions"),
      api(server.baseUrl, userToken, "/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x", body: "y", type: "info" }),
      }),
      api(server.baseUrl, userToken, ROLE_ENDPOINT(normalUser.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "SUB_ADMIN" }),
      }),
    ]);
    for (const { res } of checks) {
      assert.ok([401, 403].includes(res.status), `expected 401/403, got ${res.status}`);
    }
  });

  it("SUB_ADMIN can access all normal existing admin functionality", async () => {
    // Suggestions moderation
    const sug = await api(server.baseUrl, subAdminToken, "/api/admin/suggestions");
    assert.equal(sug.res.status, 200);
    assert.ok(Array.isArray(sug.data.suggestions));

    // Adhkar moderation
    const adk = await api(server.baseUrl, subAdminToken, "/api/admin/adhkar/submissions");
    assert.equal(adk.res.status, 200);
    assert.ok(Array.isArray(adk.data.submissions));

    // Notification management
    const notif = await api(server.baseUrl, subAdminToken, "/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "من سوب", body: "خبر", type: "info" }),
    });
    assert.equal(notif.res.status, 201);
    assert.equal(notif.data.notification.title, "من سوب");
    createdNotificationIds.push(notif.data.notification.id);
    const del = await api(server.baseUrl, subAdminToken, `/api/notifications/${notif.data.notification.id}`, {
      method: "DELETE",
    });
    assert.equal(del.res.status, 200);

    // Groups: a SUB_ADMIN is a global admin (sees every group, exempt from
    // the 3-group limit, can manage any group without joining).
    const group = await createGroup(server.baseUrl, userToken, "RhGroup");
    const groups = await api(server.baseUrl, subAdminToken, "/api/groups");
    assert.equal(groups.res.status, 200);
    assert.ok(
      groups.data.groups.some((g) => g.id === group.id),
      "SUB_ADMIN must see every group (like the current ADMIN)"
    );
    const details = await api(server.baseUrl, subAdminToken, `/api/groups/${group.id}`);
    assert.equal(details.res.status, 200);
    assert.equal(details.data.group.role, "ADMIN");
    const lb = await api(server.baseUrl, subAdminToken, `/api/groups/${group.id}/leaderboard`);
    assert.equal(lb.res.status, 200);

    // Resources: SUB_ADMIN sees every resource.
    const resources = await api(server.baseUrl, subAdminToken, "/api/resources");
    assert.equal(resources.res.status, 200);
  });

  it("SUB_ADMIN cannot promote or demote administrator roles (direct API)", async () => {
    const promoteToSubAdmin = await api(
      server.baseUrl,
      subAdminToken,
      ROLE_ENDPOINT(normalUser.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "SUB_ADMIN" }),
      },
    );
    assert.equal(promoteToSubAdmin.res.status, 403);

    const promoteToAdmin = await api(
      server.baseUrl,
      subAdminToken,
      ROLE_ENDPOINT(normalUser.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      },
    );
    assert.equal(promoteToAdmin.res.status, 403);

    const removeFromSubAdmin = await api(
      server.baseUrl,
      subAdminToken,
      ROLE_ENDPOINT(subAdmin.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "USER" }),
      },
    );
    assert.equal(removeFromSubAdmin.res.status, 403);

    const removeFromAdmin = await api(
      server.baseUrl,
      subAdminToken,
      ROLE_ENDPOINT(mainAdmin.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "USER" }),
      },
    );
    assert.equal(removeFromAdmin.res.status, 403);

    // And the admin-management user list is forbidden too.
    const list = await api(server.baseUrl, subAdminToken, "/api/admin/users");
    assert.equal(list.res.status, 403);

    // Roles were never changed server-side.
    const after = await prisma.user.findUnique({ where: { id: normalUser.id } });
    assert.equal(after.role, "USER");
  });

  it("ADMIN can promote a USER to SUB_ADMIN and later remove SUB_ADMIN privileges", async () => {
    // Promote USER -> SUB_ADMIN
    const promote = await api(
      server.baseUrl,
      adminToken,
      ROLE_ENDPOINT(normalUser.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "SUB_ADMIN" }),
      },
    );
    assert.equal(promote.res.status, 200);
    assert.equal(promote.data.user.role, "SUB_ADMIN");

    const promoted = await prisma.user.findUnique({ where: { id: normalUser.id } });
    assert.equal(promoted.role, "SUB_ADMIN");

    // Remove SUB_ADMIN -> USER
    const demote = await api(
      server.baseUrl,
      adminToken,
      ROLE_ENDPOINT(normalUser.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "USER" }),
      },
    );
    assert.equal(demote.res.status, 200);
    assert.equal(demote.data.user.role, "USER");
  });

  it("ADMIN can promote a USER all the way to ADMIN and back", async () => {
    const promote = await api(
      server.baseUrl,
      adminToken,
      ROLE_ENDPOINT(normalUser.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      },
    );
    assert.equal(promote.res.status, 200);
    assert.equal(promote.data.user.role, "ADMIN");

    const demote = await api(
      server.baseUrl,
      adminToken,
      ROLE_ENDPOINT(normalUser.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "USER" }),
      },
    );
    assert.equal(demote.res.status, 200);
    assert.equal(demote.data.user.role, "USER");
  });

  it("ADMIN retains full control over every admin feature", async () => {
    const list = await api(server.baseUrl, adminToken, "/api/admin/users");
    assert.equal(list.res.status, 200);
    const roles = list.data.users.map((u) => u.role);
    assert.ok(roles.includes("ADMIN"));
    assert.ok(roles.includes("SUB_ADMIN"));

    const sug = await api(server.baseUrl, adminToken, "/api/admin/suggestions");
    assert.equal(sug.res.status, 200);

    const adk = await api(server.baseUrl, adminToken, "/api/admin/adhkar/submissions");
    assert.equal(adk.res.status, 200);

    const notif = await api(server.baseUrl, adminToken, "/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "من الأدمن", body: "قرار", type: "announcement" }),
    });
    assert.equal(notif.res.status, 201);
    createdNotificationIds.push(notif.data.notification.id);

    const roleChange = await api(
      server.baseUrl,
      adminToken,
      ROLE_ENDPOINT(normalUser.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "SUB_ADMIN" }),
      },
    );
    assert.equal(roleChange.res.status, 200);
    const again = await api(
      server.baseUrl,
      adminToken,
      ROLE_ENDPOINT(normalUser.id),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "USER" }),
      },
    );
    assert.equal(again.res.status, 200);
  });
});