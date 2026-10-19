import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { startBackend } from "./helpers/server.mjs";

const prisma = new PrismaClient();

/**
 * Refresh-session integrity (production 401 root-cause regression).
 *
 * Covers the confirm-first diagnostics (distinguishable codes), the atomic
 * single-use rotation (consume + mint in one transaction => exactly one
 * winner under concurrent replays), replay/logout/expiry rejection, and the
 * guarantee that rejections never leak token material to bodies or logs.
 */

async function registerAndGetTokens(baseUrl, suffix) {
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9]/g, "_");
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `user-${suffix}@example.com`,
      username: `user_${safeSuffix}`,
      password: "SecurePass123!",
      displayName: `User ${suffix}`,
    }),
  });
  assert.equal(res.status, 201, "register must succeed");
  const data = await res.json();
  const sc = res.headers.getSetCookie?.() || [];
  const rc = sc.find((c) => c.includes("morven_refresh_token"));
  const cc = sc.find((c) => c.includes("morven_csrf_token"));
  const csrfToken = cc ? cc.split(";")[0].split("=").slice(1).join("=") : null;
  const refreshToken = rc ? rc.split(";")[0].split("=").slice(1).join("=") : null;
  return { ...data, csrfToken, refreshToken };
}

/** The CSRF layer is a stateless double-submit (header must equal cookie).
 *  A forged but internally-consistent pair passes CSRF, letting these tests
 *  isolate refresh-token rejection from CSRF rejection. */
const FORGED_CSRF = "d".repeat(64);

function refreshRequest(baseUrl, refreshToken, csrf = FORGED_CSRF) {
  return fetch(`${baseUrl}/api/auth/refresh`, {
    method: "POST",
    headers: {
      Cookie: `morven_refresh_token=${refreshToken}; morven_csrf_token=${csrf}`,
      "X-CSRF-Token": csrf,
    },
  });
}

function setCookieValue(res, name) {
  const sc = res.headers.getSetCookie?.() || [];
  const hit = sc.find((c) => c.includes(`${name}=`));
  if (!hit) return null;
  return hit.split(";")[0].split("=").slice(1).join("=");
}

const DEAD_SESSION_CODES = [
  "REFRESH_TOKEN_NOT_FOUND",
  "REFRESH_TOKEN_EXPIRED",
  "REFRESH_TOKEN_REPLAYED",
];

describe("Refresh session integrity", () => {
  let server;
  before(async () => {
    server = await startBackend();
  });
  after(async () => {
    await server?.stop();
    await prisma.$disconnect();
  });

  it("rotates the token: successor works, predecessor is dead with a distinguishable code", async () => {
    const t = await registerAndGetTokens(server.baseUrl, `rot-${Date.now()}`);
    assert.ok(t.refreshToken && t.csrfToken);

    const rotated = await refreshRequest(server.baseUrl, t.refreshToken, t.csrfToken);
    assert.equal(rotated.status, 200);
    const newRefresh = setCookieValue(rotated, "morven_refresh_token");
    assert.ok(newRefresh, "rotation must set a successor refresh cookie");
    assert.notEqual(newRefresh, t.refreshToken, "rotation must mint a different token");

    // Successor is usable (chained rotation).
    const chained = await refreshRequest(server.baseUrl, newRefresh);
    assert.equal(chained.status, 200, "successor token must refresh");

    // Predecessor is dead — single-use, with a machine-readable code.
    const replay = await refreshRequest(server.baseUrl, t.refreshToken);
    assert.equal(replay.status, 401);
    const body = await replay.json();
    assert.equal(body.code, "REFRESH_TOKEN_NOT_FOUND");
  });

  it("distinguishes a missing refresh cookie (REFRESH_COOKIE_MISSING) from a dead token", async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: {
        Cookie: `morven_csrf_token=${FORGED_CSRF}`,
        "X-CSRF-Token": FORGED_CSRF,
      },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "REFRESH_COOKIE_MISSING");
    assert.ok(body.error);
  });

  it("rejects an unknown refresh token with REFRESH_TOKEN_NOT_FOUND", async () => {
    const res = await refreshRequest(server.baseUrl, `deadbeef${"0".repeat(56)}`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "REFRESH_TOKEN_NOT_FOUND");
  });

  it("rejects an expired refresh token with REFRESH_TOKEN_EXPIRED and cleans up the row", async () => {
    const t = await registerAndGetTokens(server.baseUrl, `exp-${Date.now()}`);
    const rows = await prisma.refreshToken.findMany({ where: { userId: t.user.id } });
    assert.equal(rows.length, 1, "register mints exactly one refresh row");
    await prisma.refreshToken.update({
      where: { id: rows[0].id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await refreshRequest(server.baseUrl, t.refreshToken, t.csrfToken);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "REFRESH_TOKEN_EXPIRED");

    const leftover = await prisma.refreshToken.count({ where: { id: rows[0].id } });
    assert.equal(leftover, 0, "expired row must be removed");
  });

  it("rejects a logout-revoked token with REFRESH_TOKEN_NOT_FOUND", async () => {
    const t = await registerAndGetTokens(server.baseUrl, `lo-${Date.now()}`);
    const logout = await fetch(`${server.baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: `morven_refresh_token=${t.refreshToken}; morven_csrf_token=${t.csrfToken}`,
        "X-CSRF-Token": t.csrfToken,
      },
    });
    assert.equal(logout.status, 200);

    const res = await refreshRequest(server.baseUrl, t.refreshToken, t.csrfToken);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "REFRESH_TOKEN_NOT_FOUND");
  });

  it("concurrent refreshes mint exactly one session (single-use atomic rotation)", async () => {
    const t = await registerAndGetTokens(server.baseUrl, `race-${Date.now()}`);

    const doRefresh = () => refreshRequest(server.baseUrl, t.refreshToken, t.csrfToken);
    const [r1, r2] = await Promise.all([doRefresh(), doRefresh()]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 401], "exactly one winner, one rejected replay");

    const loser = r1.status === 401 ? r1 : r2;
    const loserBody = await loser.json();
    assert.ok(
      DEAD_SESSION_CODES.includes(loserBody.code),
      `loser must carry a dead-session code, got ${loserBody.code}`
    );

    // The database must contain exactly ONE live token for the user — the
    // loser must never have minted an independent session.
    const rows = await prisma.refreshToken.count({ where: { userId: t.user.id } });
    assert.equal(rows, 1, "rotation race must not create a second session");

    // The winner's successor keeps working.
    const winner = r1.status === 200 ? r1 : r2;
    const winnerRefresh = setCookieValue(winner, "morven_refresh_token");
    assert.ok(winnerRefresh);
    const followUp = await refreshRequest(server.baseUrl, winnerRefresh);
    assert.equal(followUp.status, 200);
  });

  it("classifies CSRF failures as 403 with code CSRF_INVALID (never as session death)", async () => {
    const t = await registerAndGetTokens(server.baseUrl, `csrf-${Date.now()}`);

    const noHeader = await fetch(`${server.baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `morven_refresh_token=${t.refreshToken}; morven_csrf_token=${t.csrfToken}` },
    });
    assert.equal(noHeader.status, 403);
    assert.equal((await noHeader.json()).code, "CSRF_INVALID");

    const mismatch = await fetch(`${server.baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: {
        Cookie: `morven_refresh_token=${t.refreshToken}; morven_csrf_token=${t.csrfToken}`,
        "X-CSRF-Token": FORGED_CSRF,
      },
    });
    assert.equal(mismatch.status, 403);
    assert.equal((await mismatch.json()).code, "CSRF_INVALID");

    // The token itself was NOT consumed by the CSRF failures: a valid
    // request still refreshes afterwards.
    const valid = await refreshRequest(server.baseUrl, t.refreshToken, t.csrfToken);
    assert.equal(valid.status, 200, "CSRF rejection must never consume the session");
  });

  it("never leaks token material in 401 bodies or server logs", async () => {
    const t = await registerAndGetTokens(server.baseUrl, `leak-${Date.now()}`);
    // A dead token presented for refresh: the rejection must not echo it.
    const presented = `fe${Date.now().toString(16)}${"e".repeat(40)}`;

    const res = await refreshRequest(server.baseUrl, presented);
    assert.equal(res.status, 401);
    const text = await res.text();
    assert.ok(!text.includes(presented), "401 body must not echo the presented token");
    assert.ok(!text.includes(t.csrfToken), "401 body must not contain CSRF material");

    const logs = server.logs();
    assert.ok(
      logs.includes("[auth] refresh rejected status=401 code=REFRESH_TOKEN_NOT_FOUND"),
      "refresh rejections must be visible in logs (status + code only)"
    );
    assert.ok(!logs.includes(presented), "logs must not contain refresh tokens");
    assert.ok(!logs.includes(t.csrfToken), "logs must not contain CSRF tokens");
  });
});
