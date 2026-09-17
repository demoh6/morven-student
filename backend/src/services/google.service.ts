import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  AuthError,
  generateAccessToken,
  createRefreshToken,
  sanitizeUser,
} from "./auth.service";

// ---------------------------------------------------------------------------
// Google Sign-In — backend verification + account find/create.
//
// The backend NEVER trusts client-supplied identity (email / name / avatar /
// google id). Identity is derived only from the cryptographically verified
// Google ID token claims (iss, aud, exp, sub, email, email_verified).
//
// Production uses Google's official verification (google-auth-library,
// OAuth2Client.verifyIdToken, which validates the RS256 signature against
// Google's published certs plus iss/aud/exp). For deterministic integration
// tests (which must not call real Google), set GOOGLE_TOKEN_VERIFIER=mock to
// use a local claim validator gated strictly behind that env flag.
// ---------------------------------------------------------------------------

const allowedGoogleIssuers = ["accounts.google.com", "https://accounts.google.com"];

export interface GoogleIdentity {
  /** Google stable subject identifier (`sub`); the Google identity key. */
  sub: string;
  /** Verified email, when present and verified. Null otherwise. */
  email?: string | null;
  /** Google `email_verified` boolean claim. */
  emailVerified: boolean;
  /** Display name claim, when present. */
  name?: string | null;
  /** Profile picture URL claim, when present. */
  picture?: string | null;
}

export type GoogleTokenVerifier = (credential: string, clientId: string) => Promise<GoogleIdentity>;

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

export const googleLoginSchema = z.object({
  credential: z.string().min(1, "بيانات اعتماد Google مطلوبة"),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

// ---------------------------------------------------------------------------
// Real verification via google-auth-library (production default)
// ---------------------------------------------------------------------------

async function verifyWithGoogleLibrary(credential: string, clientId: string): Promise<GoogleIdentity> {
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload) {
    throw new AuthError("بيانات اعتماد Google غير صالحة", 401);
  }
  return {
    sub: payload.sub!,
    email: payload.email ?? null,
    emailVerified: payload.email_verified === true,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mock verification for tests (GOOGLE_TOKEN_VERIFIER=mock only)
// ---------------------------------------------------------------------------

export interface MockGoogleClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  aud?: string;
  iss?: string;
  exp?: number;
}

function b64uDecodeJson(segment: string): Record<string, unknown> | null {
  try {
    // Decode base64url (no padding) into a plain JS string.
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function verifyWithMock(credential: string, clientId: string): Promise<GoogleIdentity> {
  const parts = credential.split(".");
  if (parts.length !== 3) {
    throw new AuthError("بيانات اعتماد Google غير صالحة", 401);
  }
  const claimsJson = b64uDecodeJson(parts[1]);
  if (!claimsJson) {
    throw new AuthError("بيانات اعتماد Google غير صالحة", 401);
  }

  // Wrong or missing audience.
  const aud = claimsJson["aud"];
  if (typeof aud !== "string" || aud !== clientId) {
    throw new AuthError("بيانات اعتماد Google غير صالحة", 401);
  }

  // Wrong or missing issuer.
  const iss = claimsJson["iss"];
  if (typeof iss !== "string" || !allowedGoogleIssuers.includes(iss)) {
    throw new AuthError("بيانات اعتماد Google غير صالحة", 401);
  }

  // Expired / invalid expiration.
  const exp = claimsJson["exp"];
  if (typeof exp !== "number" || exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError("بيانات اعتماد Google صالحة لكنها منتهية", 401);
  }

  // Subject is required.
  if (typeof claimsJson["sub"] !== "string" || claimsJson["sub"] === "") {
    throw new AuthError("بيانات اعتماد Google غير صالحة", 401);
  }

  return {
    sub: claimsJson["sub"],
    email: typeof claimsJson["email"] === "string" && claimsJson["email"] !== "" ? claimsJson["email"] : null,
    emailVerified: claimsJson["email_verified"] === true,
    name: typeof claimsJson["name"] === "string" && claimsJson["name"] !== "" ? claimsJson["name"] : null,
    picture: typeof claimsJson["picture"] === "string" && claimsJson["picture"] !== "" ? claimsJson["picture"] : null,
  };
}

// ---------------------------------------------------------------------------
// Verifier selection
// ---------------------------------------------------------------------------

const isMockMode = process.env.GOOGLE_TOKEN_VERIFIER === "mock";

/** Verify a Google ID token and return trusted identity claims. */
export async function verifyGoogleIdToken(
  credential: string,
  clientId: string
): Promise<GoogleIdentity> {
  if (isMockMode) {
    return verifyWithMock(credential, clientId);
  }
  try {
    return await verifyWithGoogleLibrary(credential, clientId);
  } catch (err) {
    // google-auth-library throws a generic Error (GetTokenError / SyntaxError /
    // network / cert-fetch errors) for anything it cannot verify — it never
    // throws an AuthError. Convert those into a clear, 4xx AuthError so the
    // client sees the real problem (bad/expired/mismatched token or Google
    // unreachable) instead of a vague 500 "server error". The original error is
    // logged for diagnosis.
    if (err instanceof AuthError) {
      throw err;
    }
    console.error("Google ID token verification failed:", err);
    throw new AuthError(
      "تعذر التحقق من بيانات اعتماد Google. يرجى المحاولة مجدداً",
      401,
      "GOOGLE_TOKEN_INVALID"
    );
  }
}

// ---------------------------------------------------------------------------
// Username generation for new Google accounts (email/slug derived, unique)
// ---------------------------------------------------------------------------

function slugifyUsername(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned;
}

async function uniqueUsername(base: string): Promise<string> {
  const slug = slugifyUsername(base) || "user";
  const candidate = slug.length >= 3 ? slug : `${slug}${slug}`.slice(0, 30) || "user";
  const trimmed = candidate.slice(0, 30);

  let username = trimmed;
  let exists = await prisma.user.findUnique({ where: { username } });
  let i = 1;
  while (exists) {
    const suffix = `_${i}`;
    const usable = trimmed.slice(0, 30 - suffix.length);
    username = `${usable}${suffix}`;
    exists = await prisma.user.findUnique({ where: { username } });
    i += 1;
    if (i > 10000) throw new AuthError("تعذر إنشاء اسم مستخدم فريد", 500);
  }
  return username;
}

// ---------------------------------------------------------------------------
// Profile picture URL handling
// ---------------------------------------------------------------------------

/** Validate/normalize a Google profile-picture URL. Returns a safe value or null. */
function safePictureUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    // Keep only googleusercontent links to avoid arbitrary remote unloads.
    if (!/(^|\.)googleusercontent\.com$/.test(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Account resolution / creation
// ---------------------------------------------------------------------------

function sanitizeGoogleName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 100);
}

/**
 * Authenticate / create a Morven account from a verified Google identity.
 * Returns { user, accessToken, refreshToken } in the exact same shape as the
 * password login, reusing the existing JWT + refresh-token + cookie system.
 */
export async function authenticateWithGoogle(identity: GoogleIdentity) {
  // CASE 2: Google account already linked -> log into the existing Morven user.
  if (identity.sub) {
    const existing = await prisma.user.findUnique({ where: { googleId: identity.sub } });
    if (existing) {
      return loginLinkedGoogleUser(existing);
    }
  }

  // Account not linked yet. Require a verified email to create or merge by
  // email — never treat an unverified email as an established identity.
  if (!identity.email || !identity.emailVerified) {
    throw new AuthError(
      "البريد الإلكتروني لحساب Google غير موثق. يرجى التحقق من بريدك في Google والمحاولة مجدداً",
      403,
      "GOOGLE_EMAIL_UNVERIFIED"
    );
  }

  const email = identity.email.toLowerCase().trim();

  // CASE 3: verified email matches an existing password-only account.
  const emailUser = await prisma.user.findUnique({ where: { email } });
  if (emailUser) {
    throw new AuthError(
      "هذا البريد الإلكتروني مسجل بالفعل بحساب بكلمة مرور. يرجى تسجيل الدخول باستخدام حساب آخر",
      409,
      "GOOGLE_EMAIL_EXISTS"
    );
  }

  // CASE 1: create a new normal Morven user (User + Profile) transactionally.
  try {
    return await createNewGoogleUser(identity, email);
  } catch (err) {
    // A concurrent sign-in raced the unique `googleId` constraint: the Google
    // account was already linked by another request. Fetch and log-in instead
    // of surfacing a raw DB error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.user.findUnique({ where: { googleId: identity.sub } });
      if (existing) {
        return loginLinkedGoogleUser(existing);
      }
    }
    throw err;
  }
}

async function loginLinkedGoogleUser(user: Awaited<ReturnType<typeof prisma.user.findUnique>>): Promise<{
  user: ReturnType<typeof sanitizeUser>;
  accessToken: string;
  refreshToken: string;
}> {
  const withProfile = await prisma.user.findUnique({
    where: { id: user!.id },
    include: { profile: { select: { avatarUrl: true } } },
  });
  if (!withProfile) {
    throw new AuthError("المستخدم غير موجود", 401);
  }

  await prisma.user.update({
    where: { id: withProfile.id },
    data: { lastLoginAt: new Date() },
  });

  const accessToken = generateAccessToken(withProfile.id, withProfile.role, withProfile.username, withProfile.displayName);
  const refreshToken = await createRefreshToken(withProfile.id);

  return {
    user: sanitizeUser(withProfile, withProfile.profile),
    accessToken,
    refreshToken,
  };
}

async function createNewGoogleUser(identity: GoogleIdentity, email: string): Promise<{
  user: ReturnType<typeof sanitizeUser>;
  accessToken: string;
  refreshToken: string;
}> {
  const displayName =
    sanitizeGoogleName(identity.name) ||
    email.split("@")[0].replace(/[._-]+/g, " ").trim().slice(0, 100) ||
    "مستخدم";
  const username = await uniqueUsername(email.split("@")[0]);
  const avatarUrl = safePictureUrl(identity.picture);

  // Transaction-safe: mirror registerUser (first user becomes ADMIN).
  const result = await prisma.$transaction(async (tx) => {
    const userCount = await tx.user.count();
    const role = userCount === 0 ? "ADMIN" : "USER";

    const user = await tx.user.create({
        data: {
          email,
          username,
          passwordHash: null,
          googleId: identity.sub,
          emailVerified: identity.emailVerified,
          displayName,
          role,
        },
      });

      await tx.profile.create({
        data: {
          userId: user.id,
          avatarUrl,
        },
      });

      return user;
  });

  const withProfile = await prisma.user.findUnique({
    where: { id: result.id },
    include: { profile: { select: { avatarUrl: true } } },
  });
  if (!withProfile) {
    throw new AuthError("المستخدم غير موجود", 500);
  }

  const accessToken = generateAccessToken(withProfile.id, withProfile.role, withProfile.username, withProfile.displayName);
  const refreshToken = await createRefreshToken(withProfile.id);

  return {
    user: sanitizeUser(withProfile, withProfile.profile),
    accessToken,
    refreshToken,
  };
}