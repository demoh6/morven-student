import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBackend } from "./helpers/server.mjs";
import { config as loadDotEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getDayBounds } from "../dist/services/day.service.js";
import { getWeeklyGroupRanking } from "../dist/services/pomodoro.service.js";

loadDotEnv();

const prisma = new PrismaClient();

const createdUserIds = [];
const createdGroupIds = [];

const TZ = "Asia/Hebron";
const HOUR = 3600;
const MINUTE = 60;

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
      email: `df-${safe}@example.com`,
      username: `df_${safe}`,
      password: "SecurePass123!",
      displayName: `Daily ${suffix}`,
    }),
  });
  const data = await res.json();
  assert.ok([200, 201].includes(res.status), `register failed: ${JSON.stringify(data)}`);
  createdUserIds.push(data.user.id);
  return data;
}

async function createGroup(baseUrl, token, name) {
  const res = await fetch(`${baseUrl}/api/groups`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  assert.equal(res.status, 201, `createGroup failed: ${JSON.stringify(data)}`);
  createdGroupIds.push(data.group.id);
  return data.group;
}

async function joinGroup(baseUrl, token, joinCode) {
  const res = await fetch(`${baseUrl}/api/groups/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ joinCode }),
  });
  return { status: res.status, body: await res.json() };
}

async function submitSession(baseUrl, token, groupId, durationSeconds, sessionId) {
  const res = await fetch(`${baseUrl}/api/pomodoro/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, durationSeconds, sessionId }),
  });
  return { status: res.status, body: await res.json() };
}

async function seedSessions(rows) {
  for (const r of rows) {
    await prisma.pomodoroSession.create({
      data: {
        userId: r.userId,
        groupId: r.groupId,
        durationSeconds: r.durationSeconds,
        sessionId: r.sessionId,
        completedAt: r.completedAt ?? new Date(),
      },
    });
  }
}

function entry(ranking, userId) {
  const e = ranking.find((r) => r.userId === userId);
  assert.ok(e, `user ${userId} must be present`);
  return e;
}

/** Wall-clock components of a Date in Asia/Hebron. */
function zonedParts(date) {
  const map = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    map[part.type] = part.value;
  }
  return {
    hour: Number(map.hour) === 24 ? 0 : Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

describe("Daily focus time", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = await startBackend();
    baseUrl = server.baseUrl;
  });

  after(async () => {
    for (const id of createdGroupIds) {
      try { await prisma.group.delete({ where: { id } }); } catch { /* already gone */ }
    }
    for (const id of createdUserIds) {
      try { await prisma.user.delete({ where: { id } }); } catch { /* already gone */ }
    }
    await prisma.$disconnect();
    await server?.stop();
  });

  // -------------------------------------------------------------------------
  // 1. Day boundary math (pure unit tests)
  // -------------------------------------------------------------------------

  it("day boundaries are local 00:00 and cover the instant", () => {
    // 2026-09-05 is a Saturday. 10:00 local (+03) = 07:00 UTC.
    const now = new Date("2026-09-05T07:00:00.000Z");
    const bounds = getDayBounds(now, TZ);
    assert.equal(bounds.dayStart.toISOString(), "2026-09-04T21:00:00.000Z");
    assert.equal(bounds.nextDayStart.toISOString(), "2026-09-05T21:00:00.000Z");
    assert.ok(now >= bounds.dayStart && now < bounds.nextDayStart);
  });

  it("midnight is the exact boundary: the last second is still today", () => {
    const beforeMidnight = new Date("2026-09-07T20:59:59.000Z"); // Mon 23:59:59 local
    const atMidnight = new Date("2026-09-07T21:00:00.000Z"); // Tue 00:00:00 local

    const before = getDayBounds(beforeMidnight, TZ);
    assert.equal(before.dayStart.toISOString(), "2026-09-06T21:00:00.000Z");
    assert.ok(beforeMidnight >= before.dayStart && beforeMidnight < before.nextDayStart);

    const at = getDayBounds(atMidnight, TZ);
    assert.equal(at.dayStart.toISOString(), "2026-09-07T21:00:00.000Z");
    // The previous day's exclusive upper bound is exactly the new day's start.
    assert.equal(at.dayStart.getTime(), before.nextDayStart.getTime());
  });

  it("day boundaries stay local 00:00 and are deterministic across DST", () => {
    for (const iso of [
      "2026-01-01T12:00:00.000Z", // winter (UTC+2)
      "2026-03-28T00:00:00.000Z", // spring DST transition
      "2026-06-15T12:00:00.000Z", // summer (UTC+3)
      "2026-10-24T00:00:00.000Z", // autumn DST transition
      "2026-12-31T23:59:59.000Z", // year end
    ]) {
      const now = new Date(iso);
      const bounds = getDayBounds(now, TZ);
      const start = zonedParts(bounds.dayStart);
      const next = zonedParts(bounds.nextDayStart);
      assert.equal(start.hour, 0, `dayStart for ${iso} is not at 00:00`);
      assert.equal(start.minute, 0);
      assert.equal(start.second, 0);
      assert.equal(next.hour, 0, `nextDayStart for ${iso} is not at 00:00`);
      assert.ok(now >= bounds.dayStart, `now must be >= dayStart for ${iso}`);
      assert.ok(now < bounds.nextDayStart, `now must be < nextDayStart for ${iso}`);
      const span = bounds.nextDayStart.getTime() - bounds.dayStart.getTime();
      assert.ok(span >= 23 * HOUR * 1000 && span <= 25 * HOUR * 1000, `bad span ${span} for ${iso}`);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Daily accumulation
  // -------------------------------------------------------------------------

  it("accumulates only the current day's sessions", async () => {
    const owner = await register(baseUrl, uniqueSuffix("acc-own"));
    const member = await register(baseUrl, uniqueSuffix("acc-mem"));
    const group = await createGroup(baseUrl, owner.accessToken, "DailyAcc");
    await joinGroup(baseUrl, member.accessToken, group.joinCode);

    const tag = uniqueSuffix("acc");
    // Tuesday 2026-09-08 local. Tuesday 08:00 local = 05:00Z.
    const now = new Date("2026-09-08T05:00:00.000Z");
    await seedSessions([
      // Today: 06:00 local = 03:00Z (2 sessions, 1h + 30m).
      { groupId: group.id, userId: member.user.id, durationSeconds: HOUR, sessionId: `${tag}-t1`, completedAt: new Date("2026-09-08T03:00:00.000Z") },
      { groupId: group.id, userId: member.user.id, durationSeconds: 30 * MINUTE, sessionId: `${tag}-t2`, completedAt: new Date("2026-09-08T04:00:00.000Z") },
      // Yesterday (Monday) 22:00 local = 19:00Z — same week, not today.
      { groupId: group.id, userId: member.user.id, durationSeconds: 4 * HOUR, sessionId: `${tag}-y1`, completedAt: new Date("2026-09-07T19:00:00.000Z") },
    ]);

    const { ranking } = await getWeeklyGroupRanking(group.id, now);
    const e = entry(ranking, member.user.id);
    assert.equal(e.dailySeconds, HOUR + 30 * MINUTE, "only today's sessions count");
    assert.equal(e.weeklySeconds, HOUR + 30 * MINUTE + 4 * HOUR, "weekly still spans the week");
  });

  // -------------------------------------------------------------------------
  // 3. Daily reset at midnight without resetting the weekly total
  // -------------------------------------------------------------------------

  it("resets daily at midnight while the weekly total is unchanged", async () => {
    const owner = await register(baseUrl, uniqueSuffix("rst-own"));
    const group = await createGroup(baseUrl, owner.accessToken, "DailyReset");

    const tag = uniqueSuffix("rst");
    // Monday 22:00 local (Sep 7) = 19:00Z, 1h.
    await seedSessions([
      { groupId: group.id, userId: owner.user.id, durationSeconds: HOUR, sessionId: `${tag}-1`, completedAt: new Date("2026-09-07T19:00:00.000Z") },
    ]);

    // One second before midnight: the session is still "today".
    const before = await getWeeklyGroupRanking(group.id, new Date("2026-09-07T20:59:59.000Z"));
    assert.equal(entry(before.ranking, owner.user.id).dailySeconds, HOUR);
    assert.equal(entry(before.ranking, owner.user.id).weeklySeconds, HOUR);

    // Exactly midnight: daily drops to zero, weekly is untouched.
    const at = await getWeeklyGroupRanking(group.id, new Date("2026-09-07T21:00:00.000Z"));
    assert.equal(entry(at.ranking, owner.user.id).dailySeconds, 0, "daily must reset at midnight");
    assert.equal(entry(at.ranking, owner.user.id).weeklySeconds, HOUR, "weekly must NOT reset at midnight");
  });

  // -------------------------------------------------------------------------
  // 4. Weekly reset on Saturday (daily behaves independently)
  // -------------------------------------------------------------------------

  it("resets weekly at Saturday 00:00 exactly, with no overlap", async () => {
    const owner = await register(baseUrl, uniqueSuffix("sat-own"));
    const group = await createGroup(baseUrl, owner.accessToken, "SatReset");

    const tag = uniqueSuffix("sat");
    // Friday 23:00 local (Sep 11) = 20:00Z, 2h — last day of the week.
    await seedSessions([
      { groupId: group.id, userId: owner.user.id, durationSeconds: 2 * HOUR, sessionId: `${tag}-1`, completedAt: new Date("2026-09-11T20:00:00.000Z") },
    ]);

    // Friday 23:59:59 local: still counted.
    const before = await getWeeklyGroupRanking(group.id, new Date("2026-09-11T20:59:59.000Z"));
    assert.equal(entry(before.ranking, owner.user.id).weeklySeconds, 2 * HOUR);
    assert.equal(entry(before.ranking, owner.user.id).dailySeconds, 2 * HOUR);

    // Saturday 00:00 local = 21:00Z: new week AND new day.
    const at = await getWeeklyGroupRanking(group.id, new Date("2026-09-11T21:00:00.000Z"));
    assert.equal(entry(at.ranking, owner.user.id).weeklySeconds, 0, "weekly must reset Saturday 00:00");
    assert.equal(entry(at.ranking, owner.user.id).dailySeconds, 0, "daily also rolls over at midnight");

    // The historical session is never deleted or mutated.
    const stored = await prisma.pomodoroSession.findUnique({ where: { sessionId: `${tag}-1` } });
    assert.ok(stored, "previous-period session must remain stored");
    assert.equal(stored.durationSeconds, 2 * HOUR);
  });

  // -------------------------------------------------------------------------
  // 5. Duplicate-event prevention (reconnects / retries / concurrency)
  // -------------------------------------------------------------------------

  it("counts a retried / duplicate session exactly once", async () => {
    const owner = await register(baseUrl, uniqueSuffix("dup-own"));
    const group = await createGroup(baseUrl, owner.accessToken, "DupGroup");

    const sid = uniqueSuffix("dup");
    // Two concurrent submits of the SAME session id.
    const [a, b] = await Promise.all([
      submitSession(baseUrl, owner.accessToken, group.id, HOUR, sid),
      submitSession(baseUrl, owner.accessToken, group.id, HOUR, sid),
    ]);
    assert.ok([a.status, b.status].every((s) => s === 201));

    // A third retry after "reconnect".
    const c = await submitSession(baseUrl, owner.accessToken, group.id, HOUR, sid);
    assert.equal(c.status, 201);

    const rows = await prisma.pomodoroSession.count({ where: { userId: owner.user.id, sessionId: sid } });
    assert.equal(rows, 1, "the same session must be stored exactly once");

    const { ranking } = await getWeeklyGroupRanking(group.id);
    assert.equal(entry(ranking, owner.user.id).dailySeconds, HOUR, "duplicates must not double-count today");
    assert.equal(entry(ranking, owner.user.id).weeklySeconds, HOUR);
  });

  // -------------------------------------------------------------------------
  // 6. Group creation / joining
  // -------------------------------------------------------------------------

  it("reflects existing daily hours immediately when a member joins a new group", async () => {
    const owner = await register(baseUrl, uniqueSuffix("join-own"));
    const member = await register(baseUrl, uniqueSuffix("join-mem"));
    const groupA = await createGroup(baseUrl, owner.accessToken, "DailyJoinA");
    await joinGroup(baseUrl, member.accessToken, groupA.joinCode);

    const tag = uniqueSuffix("join");
    await seedSessions([
      { groupId: groupA.id, userId: member.user.id, durationSeconds: 90 * MINUTE, sessionId: `${tag}-1`, completedAt: new Date() },
    ]);

    // Join a brand-new group after activity — the same daily total appears.
    const groupB = await createGroup(baseUrl, owner.accessToken, "DailyJoinB");
    const joined = await joinGroup(baseUrl, member.accessToken, groupB.joinCode);
    assert.equal(joined.status, 200);

    const ra = (await getWeeklyGroupRanking(groupA.id)).ranking;
    const rb = (await getWeeklyGroupRanking(groupB.id)).ranking;
    assert.equal(entry(ra, member.user.id).dailySeconds, 90 * MINUTE);
    assert.equal(entry(rb, member.user.id).dailySeconds, 90 * MINUTE);
    assert.equal(entry(rb, member.user.id).weeklySeconds, 90 * MINUTE);
  });

  // -------------------------------------------------------------------------
  // 7. Backward compatibility with existing timestamped records
  // -------------------------------------------------------------------------

  it("derives daily totals from legacy session rows that predate any counter", async () => {
    const owner = await register(baseUrl, uniqueSuffix("leg-own"));
    const member = await register(baseUrl, uniqueSuffix("leg-mem"));
    const group = await createGroup(baseUrl, owner.accessToken, "LegacyDaily");

    // Legacy shape: session rows exist, but the account has no PomodoroStats row
    // (registering does not create one) and has not yet joined a group.
    assert.equal(await prisma.pomodoroStats.findUnique({ where: { userId: member.user.id } }), null);
    const tag = uniqueSuffix("leg");
    await seedSessions([
      { groupId: group.id, userId: member.user.id, durationSeconds: 45 * MINUTE, sessionId: `${tag}-1`, completedAt: new Date() },
    ]);

    const joined = await joinGroup(baseUrl, member.accessToken, group.joinCode);
    assert.equal(joined.status, 200);

    const { ranking } = await getWeeklyGroupRanking(group.id);
    assert.equal(entry(ranking, member.user.id).dailySeconds, 45 * MINUTE);
    assert.equal(entry(ranking, member.user.id).weeklySeconds, 45 * MINUTE);
  });
});
