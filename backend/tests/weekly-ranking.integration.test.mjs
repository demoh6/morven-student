import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBackend } from "./helpers/server.mjs";
import { config as loadDotEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getWeekBounds } from "../dist/services/week.service.js";
import { getWeeklyGroupRanking } from "../dist/services/pomodoro.service.js";

loadDotEnv();

const prisma = new PrismaClient();

const createdUserIds = [];
const createdGroupIds = [];

const TZ = "Asia/Hebron";
const DAY_MS = 86_400_000;

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
      email: `wk-${safe}@example.com`,
      username: `wk_${safe}`,
      password: "SecurePass123!",
      displayName: `Weekly ${suffix}`,
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
  return res.json();
}

async function submitSession(baseUrl, token, groupId, durationSeconds, sessionId) {
  const res = await fetch(`${baseUrl}/api/pomodoro/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, durationSeconds, sessionId }),
  });
  return { status: res.status, body: await res.json() };
}

async function getWeeklyRanking(baseUrl, token, groupId) {
  const res = await fetch(`${baseUrl}/api/groups/${groupId}/leaderboard/weekly`, {
    headers: { Authorization: `Bearer ${token}` },
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

function sumSessions(rows) {
  return rows.reduce((acc, r) => acc + r.durationSeconds, 0);
}

function weeklyOf(rows, uid) {
  return rows.find((e) => e.userId === uid).weeklySeconds;
}

function dailyOf(rows, uid) {
  return rows.find((e) => e.userId === uid).dailySeconds;
}

describe("Weekly Group Ranking", () => {
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
  // 1. Current week calculation (pure unit tests against week.service)
  // -------------------------------------------------------------------------

  it("Saturday belongs to the week starting that Saturday", () => {
    // 2026-09-05 is a Saturday. 10:00 local (+03 Asia/Hebron) = 07:00 UTC.
    const now = new Date("2026-09-05T07:00:00.000Z");
    const bounds = getWeekBounds(now, TZ);
    assert.equal(bounds.weekStart.toISOString(), "2026-09-04T21:00:00.000Z");
    assert.equal(bounds.nextWeekStart.toISOString(), "2026-09-11T21:00:00.000Z");
    assert.equal(bounds.weekEnd.toISOString(), "2026-09-11T20:59:59.000Z");
  });

  it("Friday late at night still belongs to the current week", () => {
    // 2026-09-11 is the Friday of the week that started Saturday 2026-09-05.
    // 23:59:59 local (+03) = 20:59:59 UTC.
    const friday = new Date("2026-09-11T20:59:59.000Z");
    const bounds = getWeekBounds(friday, TZ);
    assert.equal(bounds.weekStart.toISOString(), "2026-09-04T21:00:00.000Z");
    // The Friday instant is inside [weekStart, nextWeekStart).
    assert.ok(friday >= bounds.weekStart && friday < bounds.nextWeekStart);
  });

  it("Saturday 00:00 starts a new week and drops the previous week", () => {
    // Friday 23:59:59 of the previous period...
    const beforeBoundary = getWeekBounds(new Date("2026-09-11T20:59:59.000Z"), TZ);
    // ...and exactly Saturday 00:00 local (+03) = 21:00 UTC.
    const atBoundary = getWeekBounds(new Date("2026-09-11T21:00:00.000Z"), TZ);
    assert.equal(beforeBoundary.weekStart.toISOString(), "2026-09-04T21:00:00.000Z");
    assert.equal(atBoundary.weekStart.toISOString(), "2026-09-11T21:00:00.000Z");
    // The new week is exactly one boundary later — a new period, no overlap.
    assert.equal(
      atBoundary.weekStart.getTime(),
      beforeBoundary.nextWeekStart.getTime(),
    );
  });

  it("week boundaries are deterministic and DST aware across the year", () => {
    for (const iso of [
      "2026-01-01T12:00:00.000Z", // winter (UTC+2)
      "2026-03-28T00:00:00.000Z", // spring DST transition
      "2026-06-15T12:00:00.000Z", // summer (UTC+3)
      "2026-10-24T00:00:00.000Z", // autumn DST transition
      "2026-12-31T23:59:59.000Z", // year end
    ]) {
      const now = new Date(iso);
      const bounds = getWeekBounds(now, TZ);
      // weekStart must be Saturday 00:00 local in Asia/Hebron.
      const parts = intoHebronParts(bounds.weekStart);
      assert.equal(parts.weekday, "Sat", `weekStart for ${iso} is not a Saturday`);
      assert.equal(parts.hour, 0, `weekStart for ${iso} is not at 00:00`);
      assert.equal(parts.minute, 0);
      assert.equal(parts.second, 0);
      assert.ok(now >= bounds.weekStart, `now must be >= weekStart for ${iso}`);
      assert.ok(now < bounds.nextWeekStart, `now must be < nextWeekStart for ${iso}`);
      // Period is ~7 days.
      const span = bounds.nextWeekStart.getTime() - bounds.weekStart.getTime();
      assert.ok(span >= 6.9 * DAY_MS && span <= 7.1 * DAY_MS, `bad span ${span} for ${iso}`);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Ranking order
  // -------------------------------------------------------------------------

  it("ranks members by weekly duration descending", async () => {
    const owner = await register(baseUrl, uniqueSuffix("rorder"));
    const userB = await register(baseUrl, uniqueSuffix("rb"));   // 20h
    const userA = await register(baseUrl, uniqueSuffix("ra"));   // 10h
    const userC = await register(baseUrl, uniqueSuffix("rc"));   // 5h
    const group = await createGroup(baseUrl, owner.accessToken, "RankOrder");

    await joinGroup(baseUrl, userA.accessToken, group.joinCode);
    await joinGroup(baseUrl, userB.accessToken, group.joinCode);
    await joinGroup(baseUrl, userC.accessToken, group.joinCode);

    const tag = uniqueSuffix("ro");
    const sessions = [];
    for (let i = 0; i < 5; i++) sessions.push({ groupId: group.id, userId: userA.user.id, durationSeconds: 7200, sessionId: `${tag}-a${i}` }); // 36000 (10h)
    for (let i = 0; i < 10; i++) sessions.push({ groupId: group.id, userId: userB.user.id, durationSeconds: 7200, sessionId: `${tag}-b${i}` }); // 72000 (20h)
    for (let i = 0; i < 5; i++) sessions.push({ groupId: group.id, userId: userC.user.id, durationSeconds: 3600, sessionId: `${tag}-c${i}` }); // 18000 (5h)
    await seedSessions(sessions);

    const { status, body } = await getWeeklyRanking(baseUrl, owner.accessToken, group.id);
    assert.equal(status, 200);
    for (const entry of body.ranking) {
      assert.equal(typeof entry.rank, "number");
      assert.equal(typeof entry.weeklySeconds, "number");
      assert.equal(typeof entry.dailySeconds, "number");
      assert.ok(entry.userId);
      assert.ok(entry.username);
    }
    assert.equal(body.ranking.length, 4); // owner has 0h and is still listed
    assert.equal(body.ranking[0].userId, userB.user.id);
    assert.equal(body.ranking[0].weeklySeconds, 72000);
    assert.equal(body.ranking[1].userId, userA.user.id);
    assert.equal(body.ranking[1].weeklySeconds, 36000);
    assert.equal(body.ranking[2].userId, userC.user.id);
    assert.equal(body.ranking[2].weeklySeconds, 18000);
    assert.equal(body.ranking[0].rank, 1);
    assert.equal(body.ranking[1].rank, 2);
    assert.equal(body.ranking[2].rank, 3);
    // All seeded sessions completed "now", so they are also today's activity.
    assert.equal(body.ranking[0].dailySeconds, 72000);
    assert.equal(body.ranking[1].dailySeconds, 36000);
    assert.equal(body.ranking[2].dailySeconds, 18000);
    assert.equal(body.ranking[3].dailySeconds, 0);
  });

  // -------------------------------------------------------------------------
  // 3. Tie handling
  // -------------------------------------------------------------------------

  it("ties (identical weekly durations) are ordered deterministically by userId", async () => {
    const owner = await register(baseUrl, uniqueSuffix("tieown"));
    const userX = await register(baseUrl, uniqueSuffix("tiex"));
    const userY = await register(baseUrl, uniqueSuffix("tiey"));
    const group = await createGroup(baseUrl, owner.accessToken, "TieGroup");
    await joinGroup(baseUrl, userX.accessToken, group.joinCode);
    await joinGroup(baseUrl, userY.accessToken, group.joinCode);

    const tag = uniqueSuffix("tie");
    // userX and userY each accumulate exactly 5400s.
    await seedSessions([
      { groupId: group.id, userId: userX.user.id, durationSeconds: 2700, sessionId: `${tag}-x1` },
      { groupId: group.id, userId: userX.user.id, durationSeconds: 2700, sessionId: `${tag}-x2` },
      { groupId: group.id, userId: userY.user.id, durationSeconds: 5400, sessionId: `${tag}-y1` },
    ]);

    const { body } = await getWeeklyRanking(baseUrl, owner.accessToken, group.id);
    const entries = body.ranking.filter((e) => [userX.user.id, userY.user.id].includes(e.userId));
    assert.equal(entries.length, 2);
    assert.equal(entries[0].weeklySeconds, 5400);
    assert.equal(entries[1].weeklySeconds, 5400);
    // Equal duration → ascending userId order.
    const sortedById = [...entries].sort((a, b) => a.userId.localeCompare(b.userId));
    assert.deepEqual(
      entries.map((e) => e.userId),
      sortedById.map((e) => e.userId),
    );
    // The two consecutive ranks are distinct (1 and 2).
    assert.deepEqual(entries.map((e) => e.rank).sort((a, b) => a - b), [1, 2]);
  });

  // -------------------------------------------------------------------------
  // 4 + 10. Cross-group consistency + multiple groups
  // -------------------------------------------------------------------------

  it("reports the same weekly hours for a user in every group they belong to", async () => {
    const owner = await register(baseUrl, uniqueSuffix("gown"));
    const peer = await register(baseUrl, uniqueSuffix("gpeer"));
    const groupA = await createGroup(baseUrl, owner.accessToken, "ConsistencyA");
    const groupB = await createGroup(baseUrl, owner.accessToken, "ConsistencyB");
    await joinGroup(baseUrl, peer.accessToken, groupA.joinCode);
    await joinGroup(baseUrl, peer.accessToken, groupB.joinCode);

    const tag = uniqueSuffix("iso");
    // The same users' personal sessions, recorded while different groups were
    // active. Focus time is personal, so it must appear identically everywhere.
    await seedSessions([
      { groupId: groupA.id, userId: owner.user.id, durationSeconds: 3600, sessionId: `${tag}-a-own` },
      { groupId: groupB.id, userId: owner.user.id, durationSeconds: 10800, sessionId: `${tag}-b-own` },
      { groupId: groupA.id, userId: peer.user.id, durationSeconds: 7200, sessionId: `${tag}-a-peer` },
      { groupId: groupB.id, userId: peer.user.id, durationSeconds: 14400, sessionId: `${tag}-b-peer` },
    ]);

    const ra = (await getWeeklyRanking(baseUrl, owner.accessToken, groupA.id)).body.ranking;
    const rb = (await getWeeklyRanking(baseUrl, owner.accessToken, groupB.id)).body.ranking;

    const sum = (rows, uid) => rows.find((e) => e.userId === uid).weeklySeconds;

    // Each user's weekly total is the sum of ALL their sessions this week —
    // identical in both groups (owner 3600+10800, peer 7200+14400).
    assert.equal(sum(ra, owner.user.id), 14400);
    assert.equal(sum(rb, owner.user.id), 14400);
    assert.equal(sum(ra, peer.user.id), 21600);
    assert.equal(sum(rb, peer.user.id), 21600);

    // Positions differ between groups only when the member sets differ; here
    // both groups share the same members, so the order matches in each.
    assert.equal(ra[0].userId, peer.user.id); // 21600 > 14400
    assert.equal(rb[0].userId, peer.user.id);
  });

  // -------------------------------------------------------------------------
  // 5. Week isolation + 7. historical data preserved
  // -------------------------------------------------------------------------

  it("excludes previous-week Pomodoro time without deleting those sessions", async () => {
    const owner = await register(baseUrl, uniqueSuffix("wown"));
    const peer = await register(baseUrl, uniqueSuffix("wpeer"));
    const group = await createGroup(baseUrl, owner.accessToken, "WeekIsolation");
    await joinGroup(baseUrl, peer.accessToken, group.joinCode);

    const tag = uniqueSuffix("wi");
    // owner: an old (previous-week / far past) session of 99999s.
    const oldOwner = {
      groupId: group.id,
      userId: owner.user.id,
      durationSeconds: 99999,
      sessionId: `${tag}-old-own`,
      completedAt: new Date("2025-01-01T00:00:00.000Z"),
    };
    // peer: an old session of 88888s AND a current session of 7200s.
    const oldPeer = {
      groupId: group.id,
      userId: peer.user.id,
      durationSeconds: 88888,
      sessionId: `${tag}-old-peer`,
      completedAt: new Date("2025-01-01T00:00:00.000Z"),
    };
    const currentPeer = { groupId: group.id, userId: peer.user.id, durationSeconds: 7200, sessionId: `${tag}-now-peer` };
    await seedSessions([oldOwner, oldPeer, currentPeer]);

    // The current leaderboard must only reflect the current week.
    const { body } = await getWeeklyRanking(baseUrl, owner.accessToken, group.id);
    const sum = (rows, uid) => rows.find((e) => e.userId === uid).weeklySeconds;
    assert.equal(sum(body.ranking, owner.user.id), 0, "old owner hours must not count");
    assert.equal(sum(body.ranking, peer.user.id), 7200, "only the current session counts for peer");

    // Daily totals derive from the same log: the far-past session is excluded.
    assert.equal(dailyOf(body.ranking, owner.user.id), 0, "old owner hours must not count today");
    assert.equal(dailyOf(body.ranking, peer.user.id), 7200, "only the current session counts today");

    // 7. Historical data remains in the database (nothing was deleted).
    const stored = await prisma.pomodoroSession.findMany({ where: { groupId: group.id } });
    assert.equal(stored.length, 3, "previous-week sessions must still exist");
    const oldStillThere = stored.find((s) => s.sessionId === `${tag}-old-own`);
    assert.ok(oldStillThere, "old owner session must still be stored");
    assert.equal(oldStillThere.durationSeconds, 99999);
    assert.ok(stored.some((s) => s.sessionId === `${tag}-old-peer`), "old peer session must still be stored");
  });

  // -------------------------------------------------------------------------
  // 5b. Restart safety around the Saturday boundary
  // -------------------------------------------------------------------------

  it("still resets at Saturday 00:00 after a backend restart (query-time, not stored)", async () => {
    const owner = await register(baseUrl, uniqueSuffix("rstart"));
    const group = await createGroup(baseUrl, owner.accessToken, "RestartReset");

    const tag = uniqueSuffix("rs");
    // The only session is Friday 23:59:59 local (+03) = 20:59:59Z — the last
    // second of the previous competition week. A process restart can never lose
    // this reset because nothing mutable is stored for the week.
    await seedSessions([
      {
        groupId: group.id,
        userId: owner.user.id,
        durationSeconds: 7200,
        sessionId: `${tag}-prev`,
        completedAt: new Date("2026-09-04T20:59:59.000Z"),
      },
    ]);

    const sum = (rows, uid) => rows.find((e) => e.userId === uid).weeklySeconds;

    // One second before the boundary the previous week's hours are still shown.
    const before = await getWeeklyGroupRanking(group.id, new Date("2026-09-04T20:59:59.000Z"));
    assert.equal(sum(before.ranking, owner.user.id), 7200);

    // Exactly Saturday 00:00 local (+03) = 21:00Z the totals reset to zero...
    const atBoundary = await getWeeklyGroupRanking(group.id, new Date("2026-09-04T21:00:00.000Z"));
    assert.equal(sum(atBoundary.ranking, owner.user.id), 0);

    // ...and the historical session is untouched (personal/history preserved).
    const stored = await prisma.pomodoroSession.findUnique({ where: { sessionId: `${tag}-prev` } });
    assert.ok(stored, "previous-week session must remain stored");
    assert.equal(stored.durationSeconds, 7200);
  });

  // -------------------------------------------------------------------------
  // 6. Personal statistics protection
  // -------------------------------------------------------------------------

  it("does not modify personal statistics or achievements", async () => {
    const owner = await register(baseUrl, uniqueSuffix("pown"));
    const peer = await register(baseUrl, uniqueSuffix("ppeer"));
    const group = await createGroup(baseUrl, owner.accessToken, "PersonalProtect");
    await joinGroup(baseUrl, peer.accessToken, group.joinCode);

    await submitSession(baseUrl, owner.accessToken, group.id, 1800, `pp-${uniqueSuffix("s1")}`);
    await submitSession(baseUrl, owner.accessToken, group.id, 2400, `pp-${uniqueSuffix("s2")}`);

    const achievementBefore = await prisma.userAchievement.findUnique({ where: { userId: owner.user.id } });
    assert.equal(achievementBefore, null, "pomodoro submission must not create achievements");

    const sessionCountBefore = await prisma.pomodoroSession.count({ where: { userId: owner.user.id, groupId: group.id } });
    assert.equal(sessionCountBefore, 2);

    // Reading the weekly ranking several times must not write anything.
    for (let i = 0; i < 3; i++) {
      const { status } = await getWeeklyRanking(baseUrl, owner.accessToken, group.id);
      assert.equal(status, 200);
    }

    const achievementAfter = await prisma.userAchievement.findUnique({ where: { userId: owner.user.id } });
    assert.equal(achievementAfter, null, "ranking reads must not create statistics");

    const sessionCountAfter = await prisma.pomodoroSession.count({ where: { userId: owner.user.id, groupId: group.id } });
    assert.equal(sessionCountAfter, 2, "ranking reads must not alter personal pomodoro history");

    // Personal history rows are still intact with their exact durations.
    const sessions = await prisma.pomodoroSession.findMany({ where: { userId: owner.user.id, groupId: group.id } });
    const total = sumSessions(sessions.map((s) => ({ durationSeconds: s.durationSeconds })));
    assert.equal(total, 4200, "personal accumulated duration must remain untouched");
  });

  // -------------------------------------------------------------------------
  // 8. Authorization
  // -------------------------------------------------------------------------

  it("rejects non-members with 403", async () => {
    const owner = await register(baseUrl, uniqueSuffix("aown"));
    const outsider = await register(baseUrl, uniqueSuffix("aout"));
    const group = await createGroup(baseUrl, owner.accessToken, "AuthGroup");
    const res = await getWeeklyRanking(baseUrl, outsider.accessToken, group.id);
    assert.equal(res.status, 403);
  });

  it("returns 404 for a nonexistent group", async () => {
    const user = await register(baseUrl, uniqueSuffix("g404"));
    const res = await getWeeklyRanking(baseUrl, user.accessToken, "00000000-0000-4000-8000-000000000000");
    assert.equal(res.status, 404);
  });

  // -------------------------------------------------------------------------
  // 9. Empty week
  // -------------------------------------------------------------------------

  it("returns a zero ranking for a newly started week with no activity", async () => {
    const owner = await register(baseUrl, uniqueSuffix("eown"));
    const member = await register(baseUrl, uniqueSuffix("emem"));
    const group = await createGroup(baseUrl, owner.accessToken, "EmptyWeek");
    await joinGroup(baseUrl, member.accessToken, group.joinCode);

    const { status, body } = await getWeeklyRanking(baseUrl, owner.accessToken, group.id);
    assert.equal(status, 200);
    assert.ok(body.weekStart, "weekStart must be present");
    assert.ok(body.weekEnd, "weekEnd must be present");
    assert.ok(new Date(body.weekStart) <= new Date(), "weekStart must be in the past");
    assert.ok(body.ranking.length >= 2, "all members must be listed");
    for (const entry of body.ranking) {
      assert.equal(entry.weeklySeconds, 0, "no activity means zero weekly duration");
      assert.equal(entry.dailySeconds, 0, "no activity means zero daily duration");
    }
  });
});

/** Wall-clock components of a Date in Asia/Hebron (for assertion helpers). */
function intoHebronParts(date) {
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
    weekday: map.weekday,
    hour: Number(map.hour) === 24 ? 0 : Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}