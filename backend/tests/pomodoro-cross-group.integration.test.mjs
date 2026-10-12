import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBackend } from "./helpers/server.mjs";
import { config as loadDotEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getGroupLeaderboard } from "../dist/services/pomodoro.service.js";
import { reconcilePomodoroStats } from "../dist/services/pomodoroStats.service.js";

loadDotEnv();

const prisma = new PrismaClient();

const createdUserIds = [];
const createdGroupIds = [];

const HOUR = 3600;

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
      email: `cg-${safe}@example.com`,
      username: `cg_${safe}`,
      password: "SecurePass123!",
      displayName: `CG ${suffix}`,
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

async function leaveGroup(baseUrl, token, groupId) {
  const res = await fetch(`${baseUrl}/api/groups/${groupId}/leave`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

async function recordPersonalStats(baseUrl, token, sessionSeconds) {
  const res = await fetch(`${baseUrl}/api/pomodoro/me/stats`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionSeconds }),
  });
  return { status: res.status, body: await res.json() };
}

// A single personal session is capped at 2h by the API, so larger amounts are
// recorded as consecutive real sessions (exactly how the client does it).
async function recordFocus(baseUrl, token, totalSeconds) {
  let remaining = totalSeconds;
  let last;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 2 * HOUR);
    last = await recordPersonalStats(baseUrl, token, chunk);
    assert.equal(last.status, 201, `recordFocus failed: ${JSON.stringify(last.body)}`);
    remaining -= chunk;
  }
  return last;
}

async function submitSession(baseUrl, token, groupId, durationSeconds, sessionId) {
  const res = await fetch(`${baseUrl}/api/pomodoro/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, durationSeconds, sessionId }),
  });
  return { status: res.status, body: await res.json() };
}

async function getLeaderboard(baseUrl, token, groupId) {
  const res = await fetch(`${baseUrl}/api/groups/${groupId}/leaderboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

async function getWeeklyRanking(baseUrl, token, groupId) {
  const res = await fetch(`${baseUrl}/api/groups/${groupId}/leaderboard/weekly`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

function totalOf(leaderboard, userId) {
  const entry = leaderboard.find((e) => e.userId === userId);
  assert.ok(entry, `user ${userId} must be present in the leaderboard`);
  return entry.totalSeconds;
}

function weeklyOf(ranking, userId) {
  const entry = ranking.find((e) => e.userId === userId);
  assert.ok(entry, `user ${userId} must be present in the weekly ranking`);
  return entry.weeklySeconds;
}

describe("Pomodoro cross-group synchronization", () => {
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

  // -----------------------------------------------------------------------
  // A. Existing hours on first group join
  // -----------------------------------------------------------------------
  it("A: a user's existing personal hours appear immediately on first join", async () => {
    const owner = await register(baseUrl, uniqueSuffix("aown"));
    const user = await register(baseUrl, uniqueSuffix("auser"));
    const group = await createGroup(baseUrl, owner.accessToken, "A Group");

    // 5 accumulated personal hours.
    const rec = await recordFocus(baseUrl, user.accessToken, 5 * HOUR);
    assert.equal(rec.body.stats.totalFocusSeconds, 5 * HOUR);

    const join = await joinGroup(baseUrl, user.accessToken, group.joinCode);
    assert.equal(join.status, 200);

    // Recognized immediately — no further session required.
    const first = await getLeaderboard(baseUrl, user.accessToken, group.id);
    assert.equal(first.status, 200);
    assert.equal(totalOf(first.body.leaderboard, user.user.id), 5 * HOUR);

    // A fresh request returns the same total.
    const fresh = await getLeaderboard(baseUrl, owner.accessToken, group.id);
    assert.equal(totalOf(fresh.body.leaderboard, user.user.id), 5 * HOUR);
  });

  // -----------------------------------------------------------------------
  // B. Joining multiple groups (including one added later)
  // -----------------------------------------------------------------------
  it("B: existing hours are reflected in every group, including one joined later", async () => {
    const owner = await register(baseUrl, uniqueSuffix("bown"));
    const user = await register(baseUrl, uniqueSuffix("buser"));
    const groupA = await createGroup(baseUrl, owner.accessToken, "B A");
    const groupB = await createGroup(baseUrl, owner.accessToken, "B B");

    await recordFocus(baseUrl, user.accessToken, 5 * HOUR);
    await joinGroup(baseUrl, user.accessToken, groupA.joinCode);
    await joinGroup(baseUrl, user.accessToken, groupB.joinCode);

    assert.equal(totalOf((await getLeaderboard(baseUrl, owner.accessToken, groupA.id)).body.leaderboard, user.user.id), 5 * HOUR);
    assert.equal(totalOf((await getLeaderboard(baseUrl, owner.accessToken, groupB.id)).body.leaderboard, user.user.id), 5 * HOUR);

    // Join Group C later — it must immediately see the same 5 hours.
    const groupC = await createGroup(baseUrl, owner.accessToken, "B C");
    const join = await joinGroup(baseUrl, user.accessToken, groupC.joinCode);
    assert.equal(join.status, 200);
    assert.equal(totalOf((await getLeaderboard(baseUrl, owner.accessToken, groupC.id)).body.leaderboard, user.user.id), 5 * HOUR);
  });

  // -----------------------------------------------------------------------
  // C. Future accumulation propagates to every group
  // -----------------------------------------------------------------------
  it("C: additional focus time updates every group the user belongs to", async () => {
    const owner = await register(baseUrl, uniqueSuffix("cown"));
    const user = await register(baseUrl, uniqueSuffix("cuser"));
    const groupA = await createGroup(baseUrl, owner.accessToken, "C A");
    const groupB = await createGroup(baseUrl, owner.accessToken, "C B");

    await recordFocus(baseUrl, user.accessToken, 5 * HOUR);
    await joinGroup(baseUrl, user.accessToken, groupA.joinCode);
    await joinGroup(baseUrl, user.accessToken, groupB.joinCode);

    // The supported completion flow records the personal total AND the session.
    await recordFocus(baseUrl, user.accessToken, 2 * HOUR);
    const sub = await submitSession(baseUrl, user.accessToken, groupA.id, 2 * HOUR, uniqueSuffix("csess"));
    assert.equal(sub.status, 201);

    for (const g of [groupA, groupB]) {
      const { body } = await getLeaderboard(baseUrl, owner.accessToken, g.id);
      assert.equal(totalOf(body.leaderboard, user.user.id), 7 * HOUR, `group ${g.name} must show 7h`);
    }
  });

  // -----------------------------------------------------------------------
  // D. Ranking correctness (overtake + ties)
  // -----------------------------------------------------------------------
  it("D: positions update on overtake, preserve userId tie-break, vary per group", async () => {
    const owner = await register(baseUrl, uniqueSuffix("down"));
    const userX = await register(baseUrl, uniqueSuffix("dx"));
    const userY = await register(baseUrl, uniqueSuffix("dy"));
    const groupA = await createGroup(baseUrl, owner.accessToken, "D A");
    const groupB = await createGroup(baseUrl, owner.accessToken, "D B");
    await joinGroup(baseUrl, userX.accessToken, groupA.joinCode);
    await joinGroup(baseUrl, userY.accessToken, groupA.joinCode);
    await joinGroup(baseUrl, userX.accessToken, groupB.joinCode);
    // Only X is in B (different member set → positions may legitimately differ).
    await recordPersonalStats(baseUrl, userX.accessToken, 1 * HOUR);
    await recordPersonalStats(baseUrl, userY.accessToken, 2 * HOUR);

    const beforeA = (await getLeaderboard(baseUrl, owner.accessToken, groupA.id)).body.leaderboard;
    const rankOf = (lb, uid) => lb.findIndex((e) => e.userId === uid);
    assert.ok(rankOf(beforeA, userY.user.id) < rankOf(beforeA, userX.user.id), "Y (2h) leads X (1h)");

    // X accumulates until they overtake Y.
    await recordPersonalStats(baseUrl, userX.accessToken, 2 * HOUR); // X -> 3h
    const afterA = (await getLeaderboard(baseUrl, owner.accessToken, groupA.id)).body.leaderboard;
    const afterB = (await getLeaderboard(baseUrl, owner.accessToken, groupB.id)).body.leaderboard;
    assert.equal(totalOf(afterA, userX.user.id), 3 * HOUR);
    assert.equal(totalOf(afterB, userX.user.id), 3 * HOUR);
    assert.ok(rankOf(afterA, userX.user.id) < rankOf(afterA, userY.user.id), "X now leads in group A");
    // Group B has different members, so X can rank #1 there.
    assert.equal(rankOf(afterB, userX.user.id), 0);
  });

  it("D2: equal totals keep the existing deterministic userId tie-break", async () => {
    const owner = await register(baseUrl, uniqueSuffix("d2own"));
    const p = await register(baseUrl, uniqueSuffix("d2p"));
    const q = await register(baseUrl, uniqueSuffix("d2q"));
    const group = await createGroup(baseUrl, owner.accessToken, "D2 Group");
    await joinGroup(baseUrl, p.accessToken, group.joinCode);
    await joinGroup(baseUrl, q.accessToken, group.joinCode);
    await recordFocus(baseUrl, p.accessToken, 3 * HOUR);
    await recordFocus(baseUrl, q.accessToken, 3 * HOUR);

    const lb = (await getLeaderboard(baseUrl, owner.accessToken, group.id)).body.leaderboard;
    const tied = lb.filter((e) => [p.user.id, q.user.id].includes(e.userId)).map((e) => e.userId);
    const sortedById = [...tied].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(tied, sortedById, "equal totals ordered by ascending userId");
  });

  // -----------------------------------------------------------------------
  // E. Legacy-data reconciliation (sessions without a stats row / stale stats)
  // -----------------------------------------------------------------------
  it("E: reconciliation backfills a missing counter from the session log, idempotently", async () => {
    const owner = await register(baseUrl, uniqueSuffix("eown"));
    const user = await register(baseUrl, uniqueSuffix("euser"));
    const group = await createGroup(baseUrl, owner.accessToken, "E Group");

    // Legacy shape: uploading a guest's history wrote session rows, but the
    // account has never had a counter row (registering does not create one).
    assert.equal(await prisma.pomodoroStats.findUnique({ where: { userId: user.user.id } }), null);
    const tag = uniqueSuffix("eseed");
    await prisma.pomodoroSession.create({
      data: { userId: user.user.id, groupId: group.id, durationSeconds: 4 * HOUR, sessionId: `${tag}-1` },
    });

    // Joining runs reconciliation, which backfills the missing counter.
    await joinGroup(baseUrl, user.accessToken, group.joinCode);
    const afterJoin = await prisma.pomodoroStats.findUnique({ where: { userId: user.user.id } });
    assert.equal(afterJoin.totalFocusSeconds, 4 * HOUR);

    // The leaderboard agrees with the backfilled counter.
    assert.equal(totalOf((await getLeaderboard(baseUrl, owner.accessToken, group.id)).body.leaderboard, user.user.id), 4 * HOUR);

    // Reconcile twice — value converges, never duplicates.
    await reconcilePomodoroStats(user.user.id);
    await reconcilePomodoroStats(user.user.id);
    const afterSecond = await prisma.pomodoroStats.findUnique({ where: { userId: user.user.id } });
    assert.equal(afterSecond.totalFocusSeconds, 4 * HOUR, "reconciliation must be idempotent");
  });

  it("E2: reconciliation repairs a stale (too-low) counter without losing the larger value", async () => {
    const user = await register(baseUrl, uniqueSuffix("e2user"));

    // Counter is stale/low; log holds more.
    await prisma.pomodoroStats.upsert({
      where: { userId: user.user.id },
      update: { totalFocusSeconds: 100, completedSessions: 1, lastFocusSeconds: 100 },
      create: { userId: user.user.id, totalFocusSeconds: 100, completedSessions: 1, lastFocusSeconds: 100 },
    });
    const tag = uniqueSuffix("e2seed");
    await prisma.pomodoroSession.create({
      data: { userId: user.user.id, durationSeconds: 6 * HOUR, sessionId: `${tag}-1` },
    });

    await reconcilePomodoroStats(user.user.id);
    const repaired = await prisma.pomodoroStats.findUnique({ where: { userId: user.user.id } });
    assert.equal(repaired.totalFocusSeconds, 6 * HOUR);

    // Running again must not raise it further (no double-counting).
    await reconcilePomodoroStats(user.user.id);
    const again = await prisma.pomodoroStats.findUnique({ where: { userId: user.user.id } });
    assert.equal(again.totalFocusSeconds, 6 * HOUR);

    // And a larger personal (counter-only) total is never reduced.
    await prisma.pomodoroStats.update({ where: { userId: user.user.id }, data: { totalFocusSeconds: 99 * HOUR } });
    await reconcilePomodoroStats(user.user.id);
    const kept = await prisma.pomodoroStats.findUnique({ where: { userId: user.user.id } });
    assert.equal(kept.totalFocusSeconds, 99 * HOUR, "reconciliation never lowers the personal total");
  });

  // -----------------------------------------------------------------------
  // F. Membership lifecycle
  // -----------------------------------------------------------------------
  it("F: leaving and rejoining never loses personal hours; repeated joins are safe", async () => {
    const owner = await register(baseUrl, uniqueSuffix("fown"));
    const user = await register(baseUrl, uniqueSuffix("fuser"));
    const group = await createGroup(baseUrl, owner.accessToken, "F Group");

    await recordFocus(baseUrl, user.accessToken, 3 * HOUR);
    await joinGroup(baseUrl, user.accessToken, group.joinCode);

    // Repeated join request must not duplicate membership.
    const repeat = await joinGroup(baseUrl, user.accessToken, group.joinCode);
    assert.equal(repeat.status, 409);
    const memberCount = await prisma.groupMember.count({ where: { groupId: group.id, userId: user.user.id } });
    assert.equal(memberCount, 1);

    // Leave and rejoin: hours preserved.
    const left = await leaveGroup(baseUrl, user.accessToken, group.id);
    assert.equal(left.status, 200);
    const rejoin = await joinGroup(baseUrl, user.accessToken, group.joinCode);
    assert.equal(rejoin.status, 200);
    assert.equal(totalOf((await getLeaderboard(baseUrl, owner.accessToken, group.id)).body.leaderboard, user.user.id), 3 * HOUR);

    // Accumulate after rejoining, then join a brand-new group: both consistent.
    await recordPersonalStats(baseUrl, user.accessToken, 1 * HOUR);
    const group2 = await createGroup(baseUrl, owner.accessToken, "F Group 2");
    await joinGroup(baseUrl, user.accessToken, group2.joinCode);
    assert.equal(totalOf((await getLeaderboard(baseUrl, owner.accessToken, group.id)).body.leaderboard, user.user.id), 4 * HOUR);
    assert.equal(totalOf((await getLeaderboard(baseUrl, owner.accessToken, group2.id)).body.leaderboard, user.user.id), 4 * HOUR);
  });

  // -----------------------------------------------------------------------
  // G. Concurrency and idempotency
  // -----------------------------------------------------------------------
  it("G: concurrent joins and duplicate submits cannot duplicate or lose time", async () => {
    const owner = await register(baseUrl, uniqueSuffix("gown"));
    const user = await register(baseUrl, uniqueSuffix("guser"));
    const group = await createGroup(baseUrl, owner.accessToken, "G Group");
    await recordPersonalStats(baseUrl, user.accessToken, 2 * HOUR);

    // Two simultaneous join requests.
    const [r1, r2] = await Promise.all([
      joinGroup(baseUrl, user.accessToken, group.joinCode),
      joinGroup(baseUrl, user.accessToken, group.joinCode),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    assert.equal(await prisma.groupMember.count({ where: { groupId: group.id, userId: user.user.id } }), 1);

    // Concurrent duplicate submits of the SAME session.
    const sid = uniqueSuffix("gsess");
    const [s1, s2] = await Promise.all([
      submitSession(baseUrl, user.accessToken, group.id, HOUR, sid),
      submitSession(baseUrl, user.accessToken, group.id, HOUR, sid),
    ]);
    assert.ok([s1.status, s2.status].every((s) => s === 201));
    const rows = await prisma.pomodoroSession.count({ where: { userId: user.user.id, sessionId: sid } });
    assert.equal(rows, 1, "the same session must be stored exactly once");

    // Retried reconciliation never changes the total.
    await reconcilePomodoroStats(user.user.id);
    await reconcilePomodoroStats(user.user.id);
    const stats = await prisma.pomodoroStats.findUnique({ where: { userId: user.user.id } });
    assert.equal(stats.totalFocusSeconds, 2 * HOUR);
  });

  // -----------------------------------------------------------------------
  // H. Period semantics: weekly totals are personal and consistent
  // -----------------------------------------------------------------------
  it("H: weekly totals match across groups and never absorb unrelated lifetime hours", async () => {
    const owner = await register(baseUrl, uniqueSuffix("hown"));
    const user = await register(baseUrl, uniqueSuffix("huser"));
    const groupA = await createGroup(baseUrl, owner.accessToken, "H A");
    const groupB = await createGroup(baseUrl, owner.accessToken, "H B");
    await joinGroup(baseUrl, user.accessToken, groupA.joinCode);

    // Current-week session recorded while only in A.
    const cur = await submitSession(baseUrl, user.accessToken, groupA.id, 90 * 60, uniqueSuffix("hnow"));
    assert.equal(cur.status, 201);
    // A far-past session (previous week) must not count toward the weekly board.
    await prisma.pomodoroSession.create({
      data: {
        userId: user.user.id,
        groupId: groupA.id,
        durationSeconds: 99 * HOUR,
        sessionId: uniqueSuffix("hold"),
        completedAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    });

    // Join B after activity: weekly total is the same in both groups.
    await joinGroup(baseUrl, user.accessToken, groupB.joinCode);

    const ra = (await getWeeklyRanking(baseUrl, owner.accessToken, groupA.id)).body.ranking;
    const rb = (await getWeeklyRanking(baseUrl, owner.accessToken, groupB.id)).body.ranking;
    assert.equal(weeklyOf(ra, user.user.id), 90 * 60);
    assert.equal(weeklyOf(rb, user.user.id), 90 * 60);

    // Lifetime keeps the old hours; weekly does not.
    await reconcilePomodoroStats(user.user.id);
    const lb = (await getLeaderboard(baseUrl, owner.accessToken, groupB.id)).body.leaderboard;
    assert.equal(totalOf(lb, user.user.id), 99 * HOUR + 90 * 60);
  });

  // -----------------------------------------------------------------------
  // I. Group deletion must not destroy personal focus history
  // -----------------------------------------------------------------------
  it("I: deleting a group preserves the user's personal session history", async () => {
    const owner = await register(baseUrl, uniqueSuffix("iown"));
    const user = await register(baseUrl, uniqueSuffix("iuser"));
    const groupA = await createGroup(baseUrl, owner.accessToken, "I A");
    const groupB = await createGroup(baseUrl, owner.accessToken, "I B");
    await joinGroup(baseUrl, user.accessToken, groupA.joinCode);
    await joinGroup(baseUrl, user.accessToken, groupB.joinCode);

    const sid = uniqueSuffix("isess");
    await submitSession(baseUrl, user.accessToken, groupA.id, 2 * HOUR, sid);

    // The owning user leaves B's owner? Simpler: an admin-less owner deletes A
    // only when alone; here A has another member, so remove that member first.
    await leaveGroup(baseUrl, user.accessToken, groupA.id);
    const del = await fetch(`${baseUrl}/api/groups/${groupA.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${owner.accessToken}` },
    });
    assert.equal(del.status, 200);

    // The personal session row survives with its group detached.
    const stored = await prisma.pomodoroSession.findUnique({ where: { sessionId: sid } });
    assert.ok(stored, "personal session must survive group deletion");
    assert.equal(stored.groupId, null);

    // The user's total in the remaining group is unchanged.
    assert.equal(totalOf((await getLeaderboard(baseUrl, owner.accessToken, groupB.id)).body.leaderboard, user.user.id), 2 * HOUR);
  });
});
