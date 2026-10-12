import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBackend } from "./helpers/server.mjs";

async function registerUser(baseUrl, suffix) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `pom-${suffix}@example.com`,
      username: `pom_${suffix.replace(/[^a-zA-Z0-9]/g, "_")}`,
      password: "SecurePass123!",
      displayName: `Pom User ${suffix}`,
    }),
  });
  return res.json();
}

async function createGroup(baseUrl, token, name) {
  const res = await fetch(`${baseUrl}/api/groups`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json();
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

async function getLeaderboard(baseUrl, token, groupId) {
  const res = await fetch(`${baseUrl}/api/groups/${groupId}/leaderboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

describe("Pomodoro Competition", () => {
  let server;
  before(async () => { server = await startBackend(); });
  after(async () => { await server?.stop(); });

  it("submitting a valid session returns 201 with session and user total", async () => {
    const { accessToken } = await registerUser(server.baseUrl, `v-${Date.now()}`);
    const { group } = await createGroup(server.baseUrl, accessToken, "Pom Group");
    const res = await submitSession(server.baseUrl, accessToken, group.id, 1500, `sess-${Date.now()}-1`);
    assert.equal(res.status, 201);
    assert.ok(res.body.session);
    assert.equal(res.body.session.durationSeconds, 1500);
    assert.equal(res.body.userTotalSeconds, 1500);
  });

  it("is idempotent for a repeated sessionId (never double-credits)", async () => {
    const { accessToken } = await registerUser(server.baseUrl, `dup-${Date.now()}`);
    const { group } = await createGroup(server.baseUrl, accessToken, "Dup Group");
    const sid = `dup-session-${Date.now()}`;
    const first = await submitSession(server.baseUrl, accessToken, group.id, 1200, sid);
    assert.equal(first.status, 201);
    const res = await submitSession(server.baseUrl, accessToken, group.id, 1200, sid);
    // Retry / cross-group fan-out of the SAME completed session is a no-op that
    // returns the stored row instead of a new credit.
    assert.equal(res.status, 201);
    assert.equal(res.body.duplicate, true);
    assert.equal(res.body.session.id, first.body.session.id);
    assert.equal(res.body.userTotalSeconds, first.body.userTotalSeconds);
  });

  it("rejects sessions from non-members", async () => {
    const owner = await registerUser(server.baseUrl, `own-${Date.now()}`);
    const outsider = await registerUser(server.baseUrl, `out-${Date.now()}`);
    const { group } = await createGroup(server.baseUrl, owner.accessToken, "Private Group");
    const res = await submitSession(server.baseUrl, outsider.accessToken, group.id, 1200, `sess-${Date.now()}-2`);
    assert.equal(res.status, 403);
  });

  it("rejects duration below 60 seconds", async () => {
    const { accessToken } = await registerUser(server.baseUrl, `lo-${Date.now()}`);
    const { group } = await createGroup(server.baseUrl, accessToken, "Lo Group");
    const res = await submitSession(server.baseUrl, accessToken, group.id, 30, `sess-${Date.now()}-3`);
    assert.equal(res.status, 400);
  });

  it("rejects duration above 7200 seconds", async () => {
    const { accessToken } = await registerUser(server.baseUrl, `hi-${Date.now()}`);
    const { group } = await createGroup(server.baseUrl, accessToken, "Hi Group");
    const res = await submitSession(server.baseUrl, accessToken, group.id, 7201, `sess-${Date.now()}-4`);
    assert.equal(res.status, 400);
  });

  it("leaderboard returns members sorted by total focus time descending", async () => {
    const userA = await registerUser(server.baseUrl, `a-${Date.now()}`);
    const userB = await registerUser(server.baseUrl, `b-${Date.now()}`);
    const { group } = await createGroup(server.baseUrl, userA.accessToken, "LB Group");
    await joinGroup(server.baseUrl, userB.accessToken, group.joinCode);

    // userA: 2 sessions of 1800s = 3600s
    await submitSession(server.baseUrl, userA.accessToken, group.id, 1800, `lb-a1-${Date.now()}`);
    await submitSession(server.baseUrl, userA.accessToken, group.id, 1800, `lb-a2-${Date.now()}`);

    // userB: 1 session of 2400s = 2400s
    await submitSession(server.baseUrl, userB.accessToken, group.id, 2400, `lb-b1-${Date.now()}`);

    const { body } = await getLeaderboard(server.baseUrl, userA.accessToken, group.id);
    assert.ok(body.leaderboard);
    assert.equal(body.leaderboard.length, 2);
    // userA has more total time, should be first
    assert.equal(body.leaderboard[0].userId, userA.user.id);
    assert.equal(body.leaderboard[0].totalSeconds, 3600);
    assert.equal(body.leaderboard[1].userId, userB.user.id);
    assert.equal(body.leaderboard[1].totalSeconds, 2400);
  });

  it("leaderboard includes members with zero focus time", async () => {
    const userA = await registerUser(server.baseUrl, `z-${Date.now()}`);
    const userB = await registerUser(server.baseUrl, `y-${Date.now()}`);
    const { group } = await createGroup(server.baseUrl, userA.accessToken, "Zero Group");
    await joinGroup(server.baseUrl, userB.accessToken, group.joinCode);

    const { body } = await getLeaderboard(server.baseUrl, userA.accessToken, group.id);
    assert.equal(body.leaderboard.length, 2);
    assert.equal(body.leaderboard[0].totalSeconds, 0);
    assert.equal(body.leaderboard[1].totalSeconds, 0);
  });

  it("leaderboard rejects non-members", async () => {
    const owner = await registerUser(server.baseUrl, `lbown-${Date.now()}`);
    const outsider = await registerUser(server.baseUrl, `lbout-${Date.now()}`);
    const { group } = await createGroup(server.baseUrl, owner.accessToken, "LB Private");
    const res = await getLeaderboard(server.baseUrl, outsider.accessToken, group.id);
    assert.equal(res.status, 403);
  });
});
