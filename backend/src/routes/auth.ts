import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  getUserById,
  requestPasswordReset,
  resetPassword,
  AuthError,
  REFRESH_COOKIE_OPTIONS,
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_COOKIE_OPTIONS,
  generateCsrfToken,
} from "../services/auth.service";
import { googleLoginSchema, verifyGoogleIdToken, authenticateWithGoogle } from "../services/google.service";
import { authenticate } from "../middleware/auth";

const router = Router();

function handleAuthError(err: unknown, res: Response): void {
  if (err instanceof AuthError) {
    if (err.code) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("Auth error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

function validateCsrfToken(req: Request, res: Response): boolean {
  const headerToken = req.headers["x-csrf-token"];
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

  const reject = (): false => {
    // `code` lets clients/tests distinguish a CSRF rejection (403) from an
    // invalid-session rejection (401) without parsing messages.
    res.status(403).json({ error: "غير مصرح", code: "CSRF_INVALID" });
    return false;
  };

  if (
    !headerToken ||
    typeof headerToken !== "string" ||
    !cookieToken ||
    typeof cookieToken !== "string" ||
    headerToken.length !== 64 ||
    cookieToken.length !== 64
  ) {
    return reject();
  }

  try {
    const headerBuf = Buffer.from(headerToken, "utf8");
    const cookieBuf = Buffer.from(cookieToken, "utf8");
    if (headerBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(headerBuf, cookieBuf)) {
      return reject();
    }
  } catch {
    return reject();
  }

  return true;
}

// POST /api/auth/register
router.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({ error: firstError.message });
      return;
    }

    const result = await registerUser(parsed.data);

    const csrfToken = generateCsrfToken();
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
    res.status(201).json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (err) {
    handleAuthError(err, res);
  }
});

// POST /api/auth/login
router.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "بيانات تسجيل الدخول غير صحيحة" });
      return;
    }

    const result = await loginUser(parsed.data);

    const csrfToken = generateCsrfToken();
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
    res.json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (err) {
    handleAuthError(err, res);
  }
});

// POST /api/auth/google
router.post("/api/auth/google", async (req: Request, res: Response) => {
  try {
    const parsed = googleLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({ error: firstError.message });
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      res.status(503).json({ error: "تسجيل الدخول عبر Google غير متاح حالياً" });
      return;
    }

    const identity = await verifyGoogleIdToken(parsed.data.credential, clientId);
    const result = await authenticateWithGoogle(identity);

    const csrfToken = generateCsrfToken();
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
    res.status(201).json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (err) {
    handleAuthError(err, res);
  }
});

// GET /api/auth/csrf
// Server-minted CSRF bootstrap for anonymous visitors.
//
// The password-recovery endpoints (forgot/reset) are CSRF-protected double
// submits like every other state-changing auth action, and — unlike
// login/register/google, which *issue* the `morven_csrf_token` cookie in their
// response — they can be reached by a browser that has never established a
// session. This single, unauthenticated endpoint mints the same
// `generateCsrfToken()` + `CSRF_COOKIE_OPTIONS` cookie used by the existing
// cookie-issuing auth endpoints (the exact same CSRF system, no second one), so
// an anonymous SPA can obtain the double-submit token and echo it back on the
// subsequent forgot/reset request. It performs no state change and carries no
// credentials.
router.get("/api/auth/csrf", (_req: Request, res: Response) => {
  const csrfToken = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
  res.json({ ok: true });
});

// POST /api/auth/forgot-password
// Requests a password-reset email. The response is identical for existing and
// non-existent emails (no enumeration). CSRF-protected like other
// state-changing auth actions.
router.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
  try {
    if (!validateCsrfToken(req, res)) return;

    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({ error: firstError.message });
      return;
    }

    await requestPasswordReset(parsed.data.email);

    res.json({
      message:
        "إذا كان هذا البريد الإلكتروني مسجلاً، فستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور.",
    });
  } catch (err) {
    handleAuthError(err, res);
  }
});

// POST /api/auth/reset-password
// Consumes a single-use reset token and sets a new password, invalidating all
// outstanding reset tokens and revoking every refresh token for the user.
router.post("/api/auth/reset-password", async (req: Request, res: Response) => {
  try {
    if (!validateCsrfToken(req, res)) return;

    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({ error: firstError.message });
      return;
    }

    await resetPassword(parsed.data.token, parsed.data.password);

    res.json({ message: "تم إعادة تعيين كلمة المرور بنجاح" });
  } catch (err) {
    handleAuthError(err, res);
  }
});

// POST /api/auth/logout
router.post("/api/auth/logout", async (req: Request, res: Response) => {
  try {
    if (!validateCsrfToken(req, res)) return;

    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    await logoutUser(refreshToken || "");
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
    res.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
    res.json({ message: "تم تسجيل الخروج بنجاح" });
  } catch (err) {
    handleAuthError(err, res);
  }
});

// POST /api/auth/refresh
router.post("/api/auth/refresh", async (req: Request, res: Response) => {
  try {
    if (!validateCsrfToken(req, res)) return;

    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      // Distinguishes "cookie never arrived / was cleared" from "cookie
      // present but dead" (REFRESH_TOKEN_* codes from the service layer).
      res.status(401).json({ error: "رمز التحديث غير موجود", code: "REFRESH_COOKIE_MISSING" });
      return;
    }

    const result = await refreshAccessToken(refreshToken);

    const csrfToken = generateCsrfToken();
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
    res.json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      // Safe diagnostic for support: status + stable code only — raw refresh
      // tokens and cookies are never logged (refresh 401s were invisible).
      console.warn(`[auth] refresh rejected status=${err.status} code=${err.code ?? "NONE"}`);
    }
    handleAuthError(err, res);
  }
});

// GET /api/auth/me
router.get("/api/auth/me", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }

    const user = await getUserById(req.user.sub);
    res.json({ user });
  } catch (err) {
    handleAuthError(err, res);
  }
});

export default router;
