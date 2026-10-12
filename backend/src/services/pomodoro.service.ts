import { z } from "zod";
import prisma from "../lib/prisma";
import { GroupError, isGlobalAdmin } from "./group.service";
import { broadcastLeaderboard } from "./presence.service";
import { getWeekBounds } from "./week.service";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const submitPomodoroSchema = z.object({
  groupId: z.string().uuid(),
  durationSeconds: z.number().int().min(60, "الحد الأدنى 60 ثانية").max(7200, "الحد الأقصى 7200 ثانية (ساعتان)"),
  sessionId: z.string().min(1, "معرف الجلسة مطلوب").max(200),
});

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function verifyMembership(userId: string, groupId: string, userRole?: string): Promise<void> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new GroupError("المجموعة غير موجودة", 404);
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership && !isGlobalAdmin(userRole)) {
    throw new GroupError("غير مصرح", 403);
  }
}

/**
 * A user's accumulated personal focus time derived from the session log,
 * aggregated across ALL groups (focus time is personal, not group-owned).
 */
async function userSessionTotalSeconds(userId: string): Promise<number> {
  const userTotal = await prisma.pomodoroSession.aggregate({
    where: { userId },
    _sum: { durationSeconds: true },
  });
  return userTotal._sum.durationSeconds ?? 0;
}

function serializeSubmittedSession(session: {
  id: string;
  durationSeconds: number;
  completedAt: Date;
}) {
  return {
    id: session.id,
    durationSeconds: session.durationSeconds,
    completedAt: session.completedAt.toISOString(),
  };
}

export async function submitPomodoroSession(
  userId: string,
  groupId: string,
  durationSeconds: number,
  sessionId: string,
) {
  // Verify membership (also throws 404 if group does not exist)
  await verifyMembership(userId, groupId);

  // Idempotent write: `sessionId` is globally unique, so a client retry, a
  // reconnect, or the cross-group fan-out can never credit the same completed
  // session twice. A duplicate for the SAME user returns the stored row; a
  // session id already owned by ANOTHER user is rejected.
  const existing = await prisma.pomodoroSession.findUnique({
    where: { sessionId },
  });
  if (existing) {
    if (existing.userId !== userId) {
      throw new GroupError("تم تسجيل هذه الجلسة مسبقاً", 409);
    }
    return {
      session: serializeSubmittedSession(existing),
      userTotalSeconds: await userSessionTotalSeconds(userId),
      duplicate: true,
    };
  }

  let session;
  try {
    session = await prisma.pomodoroSession.create({
      data: {
        userId,
        groupId,
        durationSeconds,
        sessionId,
      },
    });
  } catch (err) {
    // Concurrent duplicate (unique constraint race) — converge on the winner
    // instead of double-crediting or surfacing a spurious error.
    if ((err as { code?: string }).code === "P2002") {
      const winner = await prisma.pomodoroSession.findUnique({ where: { sessionId } });
      if (winner && winner.userId === userId) {
        return {
          session: serializeSubmittedSession(winner),
          userTotalSeconds: await userSessionTotalSeconds(userId),
          duplicate: true,
        };
      }
    }
    throw err;
  }

  return {
    session: serializeSubmittedSession(session),
    userTotalSeconds: await userSessionTotalSeconds(userId),
  };
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  totalSeconds: number;
}

/**
 * The user's canonical personal lifetime focus total. The personal counter
 * (`PomodoroStats.totalFocusSeconds`) and the personal session log are two
 * views of the same activity; taking the element-wise MAX guarantees we never
 * lose hours recorded by either path (legacy counter-only accounts, offline
 * sessions that only reached the log, etc.) and that the value is identical in
 * every group the user belongs to.
 */
function personalLifetimeSeconds(
  statsTotal: number | null | undefined,
  sessionTotal: number,
): number {
  return Math.max(statsTotal ?? 0, sessionTotal);
}

export async function getGroupLeaderboard(groupId: string): Promise<LeaderboardEntry[]> {
  // Get all members with their user info + canonical personal total
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          profile: { select: { avatarUrl: true } },
          pomodoroStats: { select: { totalFocusSeconds: true } },
        },
      },
    },
  });

  const memberIds = members.map((m) => m.user.id);

  // Aggregate each member's focus time across ALL groups (NOT scoped to this
  // group). Focus time is personal, so every group shows the same total and a
  // newly joined group immediately reflects the member's existing hours.
  const aggregates = memberIds.length
    ? await prisma.pomodoroSession.groupBy({
        by: ["userId"],
        where: { userId: { in: memberIds } },
        _sum: { durationSeconds: true },
      })
    : [];

  const totalMap = new Map<string, number>();
  for (const agg of aggregates) {
    totalMap.set(agg.userId, agg._sum.durationSeconds ?? 0);
  }

  // Build leaderboard sorted by total seconds desc, then userId asc (deterministic tie-breaker)
  const leaderboard: LeaderboardEntry[] = members.map((m) => ({
    userId: m.user.id,
    username: m.user.username,
    displayName: m.user.displayName,
    avatarUrl: m.user.profile?.avatarUrl ?? null,
    totalSeconds: personalLifetimeSeconds(
      m.user.pomodoroStats?.totalFocusSeconds,
      totalMap.get(m.user.id) ?? 0,
    ),
  }));

  leaderboard.sort((a, b) => {
    if (b.totalSeconds !== a.totalSeconds) return b.totalSeconds - a.totalSeconds;
    return a.userId.localeCompare(b.userId);
  });

  return leaderboard;
}

/**
 * Best-effort real-time refresh: push the recomputed leaderboard to EVERY group
 * the user belongs to (not just the group that received the submission), since
 * a personal focus change affects all of them. Delivery is best-effort only —
 * the database is already correct and any miss is repaired by the next fetch.
 */
export async function broadcastUserGroupLeaderboards(userId: string): Promise<void> {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    await Promise.all(
      memberships.map(async ({ groupId }) => {
        try {
          const leaderboard = await getGroupLeaderboard(groupId);
          broadcastLeaderboard(groupId, leaderboard);
        } catch {
          /* best-effort per group */
        }
      }),
    );
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// Weekly Group Ranking
// ---------------------------------------------------------------------------
// A per-Group competition scoped to the current competition week
// (Saturday 00:00 → Friday 23:59:59 in the configured weekly timezone).
// Totals are derived from each member's PERSONAL session log for the week
// (across all their groups) — the same per-user source every group reads — so
// the same user has an identical weekly total in each group, while each group
// still ranks its own member set. Filtering uses the half-open weekly interval,
// so:
//   - no personal/global statistics are ever written or reset,
//   - existing sessions are never deleted or modified,
//   - concurrent completions cannot corrupt totals (nothing is aggregated
//     into a mutable per-user counter at write time),
//   - the ranking automatically moves to the new week each Saturday without
//     any reset job or frontend timer.
// ---------------------------------------------------------------------------

export interface WeeklyRankingEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  weeklySeconds: number;
}

export async function getWeeklyGroupRanking(
  groupId: string,
  now: Date = new Date(),
): Promise<{ weekStart: Date; weekEnd: Date; ranking: WeeklyRankingEntry[] }> {
  const { weekStart, weekEnd, nextWeekStart } = getWeekBounds(now);

  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          profile: { select: { avatarUrl: true } },
        },
      },
    },
  });

  const memberIds = members.map((m) => m.user.id);

  // Aggregate this week's Pomodoro duration per user across ALL groups (NOT
  // scoped to this group). This week's focus activity is personal, so the same
  // user shows the same weekly total in every group they belong to — a group
  // joined mid-week immediately reflects the week's activity so far.
  const aggregates = memberIds.length
    ? await prisma.pomodoroSession.groupBy({
        by: ["userId"],
        where: {
          userId: { in: memberIds },
          completedAt: { gte: weekStart, lt: nextWeekStart },
        },
        _sum: { durationSeconds: true },
      })
    : [];

  const weeklyMap = new Map<string, number>();
  for (const agg of aggregates) {
    weeklyMap.set(agg.userId, agg._sum.durationSeconds ?? 0);
  }

  // Same user/profile conventions as the existing all-time leaderboard, plus
  // the weekly duration. Sorted by duration descending with a deterministic
  // tie-breaker (userId ascending).
  const ranking: WeeklyRankingEntry[] = members
    .map((m) => ({
      userId: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      avatarUrl: m.user.profile?.avatarUrl ?? null,
      weeklySeconds: weeklyMap.get(m.user.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.weeklySeconds !== a.weeklySeconds) return b.weeklySeconds - a.weeklySeconds;
      return a.userId.localeCompare(b.userId);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return { weekStart, weekEnd, ranking };
}
