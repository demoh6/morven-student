import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startBackend } from "./helpers/server.mjs";
import { config as loadDotEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadDotEnv();

const prisma = new PrismaClient();

const createdUserIds = [];
const createdNotificationIds = [];
const createdReadIds = [];

function uniqueSuffix(tag) {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${tag}${ts}${rnd}`;
}

async function register(baseUrl, suffix, prefix = "notif") {
  const safe = suffix.replace(/[^a-zA-Z0-9]/g, "_");
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${prefix}-${safe}@example.com`,
      username: `${prefix}_${safe}`,
      password: "SecurePass123!",
      displayName: `Notification Test ${suffix}`,
    }),
  });
  const data = await res.json();
  assert.ok(
    [200, 201].includes(res.status),
    `register failed: ${JSON.stringify(data)}`
  );
  if (data.user?.id) createdUserIds.push(data.user.id);
  return data;
}

async function login(baseUrl, email) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "SecurePass123!" }),
  });
  return res.json();
}

async function api(baseUrl, token, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function makeNotification() {
  const suffix = uniqueSuffix("ntf");
  return {
    title: `إشعار تجريبي ${suffix}`,
    body: `هذا إشعار عام تجريبي ${suffix}`,
    type: "announcement",
  };
}

describe("Global Notifications (ADMIN vs USER)", () => {
  let server;
  let normalUser, adminUser;
  let normalToken, adminToken;

  before(async () => {
    server = await startBackend();
    // Register two users; promote one to ADMIN purely for this test.
    adminUser = await register(server.baseUrl, uniqueSuffix("adm"));
    normalUser = await register(server.baseUrl, uniqueSuffix("usr"));
    await prisma.user.update({
      where: { id: adminUser.user.id },
      data: { role: "ADMIN" },
    });
    const adminLogin = await login(server.baseUrl, adminUser.user.email);
    assert.equal(adminLogin.user.role, "ADMIN");
    adminToken = adminLogin.accessToken;
    normalToken = normalUser.accessToken;
  });

  beforeEach(async () => {
    // Isolate each test from any notifications created by previous tests.
    for (const id of createdNotificationIds.splice(0)) {
      try {
        await prisma.appNotification.delete({ where: { id } });
      } catch {
        /* already gone */
      }
    }
  });

  after(async () => {
    for (const id of createdNotificationIds) {
      try {
        await prisma.appNotification.delete({ where: { id } });
      } catch {
        /* already gone */
      }
    }
    for (const id of createdUserIds) {
      try {
        await prisma.user.delete({ where: { id } });
      } catch {
        /* already gone */
      }
    }
    await server.stop();
  });

  it("GET /api/notifications requires authentication", async () => {
    const { res } = await api(server.baseUrl, null, "/api/notifications");
    assert.equal(res.status, 401);
  });

  it("a normal USER can list global notifications", async () => {
    const { res, data } = await api(server.baseUrl, normalToken, "/api/notifications");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(data.notifications));
  });

  it("a normal USER cannot create or delete global notifications (403)", async () => {
    const { res: createRes, data: createData } = await api(
      server.baseUrl,
      normalToken,
      "/api/notifications",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeNotification()),
      }
    );
    assert.equal(createRes.status, 403, JSON.stringify(createData));

    const { res: deleteRes } = await api(
      server.baseUrl,
      normalToken,
      "/api/notifications/some-id",
      { method: "DELETE" }
    );
    assert.equal(deleteRes.status, 403);
  });

  it("an ADMIN can create a notification visible to ALL users", async () => {
    const payload = makeNotification();
    const { res, data: createData } = await api(
      server.baseUrl,
      adminToken,
      "/api/notifications",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    assert.equal(res.status, 201, JSON.stringify(createData));
    assert.equal(createData.notification.title, payload.title);
    assert.equal(createData.notification.type, payload.type);
    createdNotificationIds.push(createData.notification.id);

    const { data: userList } = await api(server.baseUrl, normalToken, "/api/notifications");
    assert.ok(
      userList.notifications.some((n) => n.id === createData.notification.id),
      "normal USER should see the ADMIN-created notification"
    );

    const { data: adminList } = await api(server.baseUrl, adminToken, "/api/notifications");
    assert.ok(
      adminList.notifications.some((n) => n.id === createData.notification.id)
    );
  });

  it("validates the create payload", async () => {
    const { res } = await api(
      server.baseUrl,
      adminToken,
      "/api/notifications",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", body: "", type: "info" }),
      }
    );
    assert.equal(res.status, 400);
  });

  it("an ADMIN can delete a notification and it disappears for ALL users", async () => {
    const { data: createData } = await api(
      server.baseUrl,
      adminToken,
      "/api/notifications",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeNotification()),
      }
    );
    assert.equal(createData.notification.id.length > 0, true);
    createdNotificationIds.push(createData.notification.id);

    const { res } = await api(
      server.baseUrl,
      adminToken,
      `/api/notifications/${createData.notification.id}`,
      { method: "DELETE" }
    );
    assert.equal(res.status, 200);

    const { data: userList } = await api(server.baseUrl, normalToken, "/api/notifications");
    assert.ok(
      !userList.notifications.some((n) => n.id === createData.notification.id),
      "deleted notification should be gone for normal USER"
    );
  });

  it("deleting a missing notification returns 404", async () => {
    const { res } = await api(
      server.baseUrl,
      adminToken,
      "/api/notifications/does-not-exist",
      { method: "DELETE" }
    );
    assert.equal(res.status, 404);
  });
});

describe("Notification per-user read state", () => {
  let server;
  let normalUser, adminUser;
  let normalToken, adminToken;

  before(async () => {
    server = await startBackend();
    adminUser = await register(server.baseUrl, uniqueSuffix("radm"));
    normalUser = await register(server.baseUrl, uniqueSuffix("rusr"));
    await prisma.user.update({
      where: { id: adminUser.user.id },
      data: { role: "ADMIN" },
    });
    const adminLogin = await login(server.baseUrl, adminUser.user.email);
    adminToken = adminLogin.accessToken;
    normalToken = normalUser.accessToken;
  });

  beforeEach(async () => {
    for (const id of createdNotificationIds.splice(0)) {
      try {
        await prisma.appNotification.delete({ where: { id } });
      } catch {
        /* already gone */
      }
    }
  });

  after(async () => {
    for (const id of createdNotificationIds) {
      try {
        await prisma.appNotification.delete({ where: { id } });
      } catch {
        /* already gone */
      }
    }
    for (const id of createdUserIds) {
      try {
        await prisma.user.delete({ where: { id } });
      } catch {
        /* already gone */
      }
    }
    await server.stop();
  });

  async function createNotice(tag) {
    const { data } = await api(
      server.baseUrl,
      adminToken,
      "/api/notifications",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `قراءة ${tag}`,
          body: `اختبار حالة القراءة ${tag}`,
          type: "info",
        }),
      }
    );
    createdNotificationIds.push(data.notification.id);
    return data.notification;
  }

  it("notifications start unread for both users", async () => {
    const n = await createNotice("start");
    const { data: adminList } = await api(server.baseUrl, adminToken, "/api/notifications");
    const { data: userList } = await api(server.baseUrl, normalToken, "/api/notifications");
    const adminN = adminList.notifications.find((x) => x.id === n.id);
    const userN = userList.notifications.find((x) => x.id === n.id);
    assert.equal(adminN.read, false);
    assert.equal(userN.read, false);
  });

  it("read state is scoped per user (not global)", async () => {
    const n = await createNotice("scoped");
    const mark = await api(server.baseUrl, normalToken, `/api/notifications/${n.id}/read`, {
      method: "POST",
    });
    assert.equal(mark.res.status, 200);

    const { data: userList } = await api(server.baseUrl, normalToken, "/api/notifications");
    const { data: adminList } = await api(server.baseUrl, adminToken, "/api/notifications");
    assert.equal(
      userList.notifications.find((x) => x.id === n.id).read,
      true,
      "the user who marked it read must see read=true"
    );
    assert.equal(
      adminList.notifications.find((x) => x.id === n.id).read,
      false,
      "other users must still see read=false"
    );
  });

  it("read state persists across listing calls (server-side)", async () => {
    const n = await createNotice("persist");
    await api(server.baseUrl, normalToken, `/api/notifications/${n.id}/read`, {
      method: "POST",
    });
    // Second independent fetch must still show read=true.
    const { data: list1 } = await api(server.baseUrl, normalToken, "/api/notifications");
    const { data: list2 } = await api(server.baseUrl, normalToken, "/api/notifications");
    assert.equal(list1.notifications.find((x) => x.id === n.id).read, true);
    assert.equal(list2.notifications.find((x) => x.id === n.id).read, true);
  });

  it("mark-all-as-read sets read=true for every notification of that user only", async () => {
    const n1 = await createNotice("all-1");
    const n2 = await createNotice("all-2");
    const res = await api(server.baseUrl, normalToken, "/api/notifications/read-all", {
      method: "POST",
    });
    assert.equal(res.res.status, 200);

    const { data: userList } = await api(server.baseUrl, normalToken, "/api/notifications");
    assert.ok(userList.notifications.every((x) => x.read));

    const { data: adminList } = await api(server.baseUrl, adminToken, "/api/notifications");
    assert.equal(adminList.notifications.find((x) => x.id === n1.id).read, false);
    assert.equal(adminList.notifications.find((x) => x.id === n2.id).read, false);
  });

  it("a user cannot mark another user's read state (no shared state mutation)", async () => {
    const n = await createNotice("isolate");
    await api(server.baseUrl, adminToken, `/api/notifications/${n.id}/read`, {
      method: "POST",
    });
    const { data: userList } = await api(server.baseUrl, normalToken, "/api/notifications");
    assert.equal(
      userList.notifications.find((x) => x.id === n.id).read,
      false,
      "admin marking read must not affect the other user's state"
    );
  });

  it("marking a missing notification as read returns 404", async () => {
    const { res } = await api(server.baseUrl, normalToken, "/api/notifications/nope/read", {
      method: "POST",
    });
    assert.equal(res.status, 404);
  });

  it("a user cannot mark a targeted notification read when it is not theirs", async () => {
    // A target-scoped notification (e.g. dhikr-rejection notice). The create
    // API only makes global notices, so insert the targeted row directly.
    const targeted = await prisma.appNotification.create({
      data: {
        title: "إشعار موجه",
        body: "موجه لـ normalUser فقط",
        type: "info",
        createdBy: adminUser.user.id,
        targetUserId: normalUser.user.id,
      },
    });
    createdNotificationIds.push(targeted.id);

    // The non-target user must NOT be able to mark it read (no existence oracle).
    const foreignRead = await api(
      server.baseUrl,
      adminToken,
      `/api/notifications/${targeted.id}/read`,
      { method: "POST" }
    );
    assert.equal(foreignRead.res.status, 404, "foreign mark-as-read must be 404");

    const foreignReadRow = await prisma.userNotificationRead.findUnique({
      where: { userId_notificationId: { userId: adminUser.user.id, notificationId: targeted.id } },
    });
    assert.equal(foreignReadRow, null, "no read row may be created for a non-target user");

    // The target user CAN mark it read, and it stays scoped to them.
    const ownRead = await api(
      server.baseUrl,
      normalToken,
      `/api/notifications/${targeted.id}/read`,
      { method: "POST" }
    );
    assert.equal(ownRead.res.status, 200);
    const ownReadRow = await prisma.userNotificationRead.findUnique({
      where: { userId_notificationId: { userId: normalUser.user.id, notificationId: targeted.id } },
    });
    assert.ok(ownReadRow, "target user's read row must exist");

    // The foreign user still cannot see it at all (list is target-scoped too).
    const { data: adminList } = await api(server.baseUrl, adminToken, "/api/notifications");
    assert.ok(
      !adminList.notifications.some((x) => x.id === targeted.id),
      "targeted notification must not leak into another user's list"
    );
  });

  it("unread endpoint flips a single notification back to unread", async () => {
    const n = await createNotice("unread");
    await api(server.baseUrl, normalToken, `/api/notifications/${n.id}/read`, {
      method: "POST",
    });
    const del = await api(server.baseUrl, normalToken, `/api/notifications/${n.id}/read`, {
      method: "DELETE",
    });
    assert.equal(del.res.status, 200);
    const { data: userList } = await api(server.baseUrl, normalToken, "/api/notifications");
    assert.equal(userList.notifications.find((x) => x.id === n.id).read, false);
  });

  it("global deletion also removes per-user read records (no orphans)", async () => {
    const n = await createNotice("cleanup");
    await api(server.baseUrl, normalToken, `/api/notifications/${n.id}/read`, {
      method: "POST",
    });
    await api(server.baseUrl, adminToken, `/api/notifications/${n.id}/read`, {
      method: "POST",
    });

    const del = await api(server.baseUrl, adminToken, `/api/notifications/${n.id}`, {
      method: "DELETE",
    });
    assert.equal(del.res.status, 200);

    const orphans = await prisma.userNotificationRead.count({
      where: { notificationId: n.id },
    });
    assert.equal(orphans, 0, "no orphaned user_notification_reads may remain");

    const remaining = await prisma.appNotification.findUnique({ where: { id: n.id } });
    assert.equal(remaining, null);
  });

  it("deleting a notification makes it disappear for a user who had read it", async () => {
    const n = await createNotice("gone");
    await api(server.baseUrl, normalToken, `/api/notifications/${n.id}/read`, {
      method: "POST",
    });
    await api(server.baseUrl, adminToken, `/api/notifications/${n.id}`, {
      method: "DELETE",
    });
    const { data: userList } = await api(server.baseUrl, normalToken, "/api/notifications");
    assert.ok(
      !userList.notifications.some((x) => x.id === n.id),
      "deleted notification must be gone for the reader"
    );
  });
});