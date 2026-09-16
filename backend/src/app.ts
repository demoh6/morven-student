import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { createHttpCorsOptions } from "./cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import healthRoutes from "./routes/health";
import convertRoutes from "./routes/convert";
import compressRoutes from "./routes/compress";
import pdfSecurityRoutes from "./routes/pdf-security";
import pptRoutes from "./routes/ppt";
import mediaRoutes from "./routes/media";
import authRoutes from "./routes/auth";
import profileRoutes from "./routes/profile";
import groupRoutes from "./routes/group";
import pomodoroRoutes from "./routes/pomodoro";
import resourceRoutes from "./routes/resource";
import notificationRoutes from "./routes/notification";
import suggestionRoutes from "./routes/suggestion";
import adhkarRoutes from "./routes/adhkar";
import taskRoutes from "./routes/task";
import examRoutes from "./routes/exam";
import flashcardRoutes from "./routes/flashcard";
import noteRoutes from "./routes/note";
import userFileRoutes from "./routes/userFile";
import pomodoroStatsRoutes from "./routes/pomodoroStats";
import adhkarProgressRoutes from "./routes/adhkarProgress";
import userPreferenceRoutes from "./routes/userPreference";
import adminRoutes from "./routes/admin";

const app = express();

// ---------------------------------------------------------------------------
// Proxy trust
// ---------------------------------------------------------------------------
// Request chain in production:  browser -> Vercel edge -> Railway ingress -> app.
// Express must trust both hops so req.ip (used by the rate limiters) is the
// real client IP instead of a shared proxy/Vercel edge IP.
//
// Configurable via environment:
//   - TRUST_PROXY_HOPS=<n>    number of trusted reverse-proxy hops (default 2)
//   - TRUST_PROXY=false       disable trust entirely (e.g. direct local dev)
const trustProxySetting: boolean | number = (() => {
  if (process.env.TRUST_PROXY === "false") return false;
  const raw = process.env.TRUST_PROXY_HOPS;
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return 2;
})();
app.set("trust proxy", trustProxySetting);

// ---------------------------------------------------------------------------
// Static file serving for uploads
// ---------------------------------------------------------------------------
const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch { /* ignore */ }

// Resource files live under `uploads/resources` and must NEVER be reachable
// through the public static mount (they are served only via the authenticated
// download endpoint). Block the sub-path before the static middleware so it
// cannot be fetched unauthenticated.
app.use("/uploads/resources", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use("/uploads/user-files", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "30d", immutable: true }));

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
// Google Sign-In renders a cross-origin popup/iframe and relays the ID token
// back to the page via postMessage. Helmet's default Cross-Origin-Opener-Policy
// (same-origin) and Cross-Origin-Embedder-Policy block that cross-origin
// postMessage, so Google SSO fails ("Cross-Origin-Opener-Policy policy would
// block the window.postMessage call"). Disable just those two for the Google
// flow while keeping every other helmet protection.
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
app.use(cors(createHttpCorsOptions()));

// ---------------------------------------------------------------------------
// Body parsing + cookie parsing
// ---------------------------------------------------------------------------
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "30", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً" },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.REFRESH_RATE_LIMIT_MAX || "60", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً" },
});

// Strict limiter for password-reset endpoints. Prevents credential stuffing via
// reset or mail-bombing via the request endpoint. Configurable, defaults low.
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RESET_RATE_LIMIT_MAX || "5", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً" },
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/", healthRoutes);

// Auth routes with rate limiting
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/google", authLimiter);
app.use("/api/auth/refresh", refreshLimiter);
app.use("/api/auth/forgot-password", resetLimiter);
app.use("/api/auth/reset-password", resetLimiter);
app.use(authRoutes);
app.use(profileRoutes);
app.use(groupRoutes);
app.use(pomodoroRoutes);
app.use(resourceRoutes);
app.use(notificationRoutes);
app.use(suggestionRoutes);
app.use(adhkarRoutes);
app.use(taskRoutes);
app.use(examRoutes);
app.use(flashcardRoutes);
app.use(noteRoutes);
app.use(userFileRoutes);
app.use(pomodoroStatsRoutes);
app.use(adhkarProgressRoutes);
app.use(userPreferenceRoutes);
app.use(adminRoutes);

// Existing file-processing routes (no auth required)
app.use("/", convertRoutes);
app.use("/", compressRoutes);
app.use("/", pdfSecurityRoutes);
app.use("/", pptRoutes);
app.use("/", mediaRoutes);

// JSON 404 fallback for unknown routes.
app.use((req: Request, res: Response) => {
  res
    .status(404)
    .json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler
app.use(
  (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as {
      code?: string;
      type?: string;
      status?: number;
      message?: string;
    };

    if (e?.code === "LIMIT_FILE_SIZE") {
      res
        .status(413)
        .json({ error: "File too large. Maximum allowed size is 50MB." });
      return;
    }

    if (e?.type === "entity.parse.failed" || e?.status === 400) {
      res.status(400).json({ error: "Invalid JSON body." });
      return;
    }

    const status =
      typeof e?.status === "number" && e.status >= 400 ? e.status : 500;

    console.error("Unhandled route error:", e);

    res
      .status(status)
      .json({ code: e?.code, error: e?.message || "Internal server error" });
  }
);

export default app;
