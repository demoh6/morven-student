import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  buildPasswordResetUrl,
  sendPasswordResetEmail,
} from "./email.service";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_DAYS = 7;
const PASSWORD_RESET_TOKEN_MINUTES = (() => {
  const raw = process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 60;
})();

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error(
    "JWT_SECRET and JWT_REFRESH_SECRET must be set in environment variables"
  );
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح").toLowerCase().trim(),
  username: z
    .string()
    .min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل")
    .max(30, "اسم المستخدم يجب أن يكون 30 حرف أو أقل")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "اسم المستخدم يمكن أن يحتوي على أحرف وأرقام وشرطة سفلية فقط"
    )
    .trim(),
  password: z
    .string()
    .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    .max(128, "كلمة المرور طويلة جداً"),
  displayName: z
    .string()
    .min(1, "الاسم المعروض مطلوب")
    .max(100, "الاسم المعروض طويل جداً")
    .trim(),
});

export const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح").toLowerCase().trim(),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح").toLowerCase().trim(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "رمز إعادة التعيين مطلوب"),
  password: z
    .string()
    .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    .max(128, "كلمة المرور طويلة جداً"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

export interface AccessTokenPayload {
  sub: string;
  role: string;
  username?: string;
  displayName?: string;
}

export function generateAccessToken(userId: string, role: string, username?: string, displayName?: string): string {
  return jwt.sign({ sub: userId, role, username, displayName } satisfies AccessTokenPayload, JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET!) as AccessTokenPayload;
}

// ---------------------------------------------------------------------------
// Refresh token helpers
// ---------------------------------------------------------------------------

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRawRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}

export async function createRefreshToken(
  userId: string,
  // Accepts the interactive-transaction client so callers can atomically pair
  // a revoke with the successor mint (see refreshAccessToken).
  db: Prisma.TransactionClient = prisma
): Promise<string> {
  const rawToken = generateRawRefreshToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await db.refreshToken.create({
    data: { tokenHash, userId, expiresAt },
  });

  return rawToken;
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.deleteMany({ where: { tokenHash } });
}

export async function revokeAllUserRefreshTokens(
  userId: string
): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Uniform, non-enumerating message used for BOTH an existing and a
 * non-existent email. Never reveals whether the account exists.
 */
const PASSWORD_RESET_UNIFORM_MESSAGE =
  "إذا كان هذا البريد الإلكتروني مسجلاً، فستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور.";

/**
 * Request a password reset for the given email.
 *
 * Security notes:
 * - The response is IDENTICAL regardless of whether the email exists, so user
 *   enumeration via this endpoint is not possible.
 * - Google-only accounts (passwordHash === null) silently take the same path:
 *   they never receive a reset link (there is no password to reset) and never
 *   reveal that the account type differs.
 * - Tokens are 256-bit random values, stored only as SHA-256 hashes, and are
 *   returned to the caller for emailing only.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  // Always resolve the same message; if the email is unknown we still return
  // the uniform string without sending anything.
  const user = await prisma.user.findUnique({ where: { email } });

  // Only issue tokens / send mail for accounts that can actually reset (have a
  // local password). Google-only accounts and unknown emails behave identically
  // from the outside.
  if (user && user.passwordHash) {
    const rawToken = generatePasswordResetToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_MINUTES * 60 * 1000
    );

    await prisma.passwordResetToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
    });

    const resetUrl = buildPasswordResetUrl(rawToken);
    await sendPasswordResetEmail({
      to: user.email,
      displayName: user.displayName,
      resetUrl,
    });
  }

  // No early return, no branching on account existence to the caller.
}

/**
 * Consume a single-use reset token and set a new password.
 *
 * Security notes:
 * - Expired tokens are rejected.
 * - Each token is single-use: `usedAt` is set and treated as consumed.
 * - On success ALL outstanding reset tokens AND ALL refresh tokens for the user
 *   are invalidated, logging the user out of every device.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record) {
    throw new AuthError("رمز إعادة التعيين غير صالح أو منتهي الصلاحية", 400);
  }

  if (record.usedAt) {
    throw new AuthError("رمز إعادة التعيين غير صالح أو منتهي الصلاحية", 400);
  }

  if (record.expiresAt < new Date()) {
    // Clean up the expired row and reject.
    await prisma.passwordResetToken.delete({ where: { id: record.id } });
    throw new AuthError("رمز إعادة التعيين غير صالح أو منتهي الصلاحية", 400);
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  // Account may have been deleted, or is a Google-only account (no password to
  // reset). Reject without revealing the cause.
  if (!user || !user.passwordHash) {
    throw new AuthError("رمز إعادة التعيين غير صالح أو منتهي الصلاحية", 400);
  }

  // Reject reusing the current password.
  const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash);
  if (sameAsCurrent) {
    throw new AuthError("كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور الحالية", 400);
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  // Mark this token used + invalidate every other outstanding reset token.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, id: { not: record.id } },
    data: { usedAt: new Date() },
  });
  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  // Revoke ALL existing refresh tokens so every current session must
  // re-authenticate after the password change.
  await revokeAllUserRefreshTokens(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newPasswordHash },
  });
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

const isProduction = process.env.NODE_ENV === "production";

/**
 * SameSite policy for auth cookies.
 *
 * - "lax" (secure default): works when the frontend and backend share a site
 *   (same origin or a same-site proxy). Cookies are never sent on cross-site
 *   subresource/fetch requests.
 * - "none" (requires Secure, i.e. HTTPS): required when the frontend and
 *   backend are served from DIFFERENT sites. Railway's default domains are
 *   `<svc>.<hash>.up.railway.app`, and because `up.railway.app` is a public
 *   suffix each service is its own site, so SameSite=Lax cookies would NOT be
 *   sent on cross-site fetch requests. Default to "none" in production.
 *
 * CSRF protection does NOT rely solely on SameSite: the app uses a double
 * submit CSRF token (a cookie + matching "X-CSRF-Token" header), which is the
 * recommended control when SameSite=None is required.
 */
const sameSite: "lax" | "strict" | "none" =
  process.env.COOKIE_SAMESITE === "none" ||
  process.env.COOKIE_SAMESITE === "strict"
    ? process.env.COOKIE_SAMESITE
    : process.env.COOKIE_SAMESITE === "lax"
      ? "lax"
      : isProduction
        ? "none"
        : "lax";

export const REFRESH_COOKIE_NAME = "morven_refresh_token";
export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite,
  maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  path: "/",
};

export const CSRF_COOKIE_NAME = "morven_csrf_token";
export const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: isProduction,
  sameSite,
  maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  path: "/",
};

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// Business logic
// ---------------------------------------------------------------------------

export async function registerUser(input: RegisterInput) {
  const { email, username, password, displayName } = input;

  // Check uniqueness
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    throw new AuthError("البريد الإلكتروني مسجل بالفعل", 409);
  }

  const existingUsername = await prisma.user.findUnique({
    where: { username },
  });
  if (existingUsername) {
    throw new AuthError("اسم المستخدم مسجل بالفعل", 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Transaction-safe: first user becomes ADMIN, rest become USER
  const result = await prisma.$transaction(async (tx) => {
    // Count existing users inside the transaction to prevent race conditions.
    // SERIALIZABLE isolation handles concurrent registrations safely.
    const userCount = await tx.user.count();
    const role = userCount === 0 ? "ADMIN" : "USER";

    const user = await tx.user.create({
      data: {
        email,
        username,
        passwordHash,
        displayName,
        role,
      },
    });

    await tx.profile.create({
      data: { userId: user.id },
    });

    return user;
  });

  const accessToken = generateAccessToken(result.id, result.role, result.username, result.displayName);
  const refreshToken = await createRefreshToken(result.id);

  return {
    user: sanitizeUser(result, { avatarUrl: null }),
    accessToken,
    refreshToken,
  };
}

export async function loginUser(input: LoginInput) {
  const { email, password } = input;

  const user = await prisma.user.findUnique({ where: { email }, include: { profile: { select: { avatarUrl: true } } } });
  if (!user) {
    throw new AuthError("بيانات تسجيل الدخول غير صحيحة", 401);
  }

  // Google-only accounts have no local password; prevent password login.
  if (!user.passwordHash) {
    throw new AuthError("بيانات تسجيل الدخول غير صحيحة", 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AuthError("بيانات تسجيل الدخول غير صحيحة", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const accessToken = generateAccessToken(user.id, user.role, user.username, user.displayName);
  const refreshToken = await createRefreshToken(user.id);

  return {
    user: sanitizeUser(user, user.profile),
    accessToken,
    refreshToken,
  };
}

export async function refreshAccessToken(rawRefreshToken: string) {
  const tokenHash = hashToken(rawRefreshToken);

  // --- Classify BEFORE mutating anything -----------------------------------
  // Diagnostics must never consume state: a probe of an already-dead token
  // must not affect any other session, and a failed rotation must leave the
  // client's existing cookie valid.
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!record) {
    // Never issued, revoked by logout/password-reset, hard-deleted — or a
    // replay of an already-rotated token. Indistinguishable by design (only
    // SHA-256 hashes are stored); all are definitive dead sessions.
    throw new AuthError("رمز التحديث غير صالح أو منتهي الصلاحية", 401, "REFRESH_TOKEN_NOT_FOUND");
  }
  if (record.expiresAt < new Date()) {
    // Best-effort cleanup; a concurrent delete must not surface as a 500.
    await prisma.refreshToken.delete({ where: { id: record.id } }).catch(() => undefined);
    throw new AuthError("رمز التحديث غير صالح أو منتهي الصلاحية", 401, "REFRESH_TOKEN_EXPIRED");
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId }, include: { profile: { select: { avatarUrl: true } } } });
  if (!user) {
    // Resolve the user BEFORE consuming so a missing user can never revoke
    // a (theoretically still-present) session half-way.
    throw new AuthError("المستخدم غير موجود", 401, "AUTH_USER_NOT_FOUND");
  }

  // --- Atomic rotation -----------------------------------------------------
  // Consume the old row and mint its successor in ONE transaction. `deleteMany`
  // reports how many rows THIS transaction actually removed, so under
  // concurrent replays exactly one caller can succeed: single-use tokens and
  // replay protection come from the same atomic step, with no schema change
  // and no grace period. A mid-rotation failure rolls back the consume, so the
  // old token is never invalidated without a replacement reaching the client.
  const rotatedToken = await prisma.$transaction(async (tx) => {
    const consumed = await tx.refreshToken.deleteMany({ where: { tokenHash } });
    if (consumed.count !== 1) return null;
    return createRefreshToken(user.id, tx);
  });
  if (!rotatedToken) {
    // Lost a rotation race: another request already consumed this token.
    throw new AuthError("رمز التحديث غير صالح أو منتهي الصلاحية", 401, "REFRESH_TOKEN_REPLAYED");
  }

  const accessToken = generateAccessToken(user.id, user.role, user.username, user.displayName);

  return {
    user: sanitizeUser(user, user.profile),
    accessToken,
    refreshToken: rotatedToken,
  };
}

export async function logoutUser(rawRefreshToken: string): Promise<void> {
  if (rawRefreshToken) {
    await revokeRefreshToken(rawRefreshToken);
  }
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: { select: { avatarUrl: true } } } });
  if (!user) {
    throw new AuthError("المستخدم غير موجود", 404);
  }
  return sanitizeUser(user, user.profile);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  status: number;
  /** Optional stable machine-readable code for error differentiation by clients. */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

export function sanitizeUser(user: any, profile?: { avatarUrl: string | null } | null) {
  const { passwordHash, ...safe } = user;
  return { ...safe, avatarUrl: profile?.avatarUrl ?? null };
}
