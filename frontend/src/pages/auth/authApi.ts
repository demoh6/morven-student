import { API_BASE } from '@/services/apiBase';
import { toNetworkError, NETWORK_ERROR_MESSAGE } from '@/services/apiError';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<{ data: T; res: Response }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
  } catch (err) {
    // Connectivity/timeout/abort — never surface the raw engine error
    // ("Failed to fetch") to the user; callers render `err.message`.
    throw toNetworkError(NETWORK_ERROR_MESSAGE, err);
  }

  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data.error || 'حدث خطأ غير متوقع') as Error & { code?: string; status?: number };
    // Attach the HTTP status so callers can distinguish a CONFIRMED auth failure
    // (an explicit 401 from the refresh endpoint) from connectivity/server
    // failures (5xx, 403 CSRF, etc.). Network/timeout failures never reach here
    // — `fetch` rejects and the resulting error carries no `status`.
    error.status = res.status;
    // Preserve any structured machine-readable code (e.g. GOOGLE_EMAIL_EXISTS)
    // so callers can map it to contextually clear messages.
    if (typeof data.code === 'string' && data.code) {
      error.code = data.code;
    }
    throw error;
  }

  return { data: data as T, res };
}

function parseCookies(res: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookie = res.headers.getSetCookie?.();
  if (!setCookie) return cookies;
  for (const raw of setCookie) {
    const pair = raw.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[name] = value;
  }
  return cookies;
}

let csrfToken: string | null = null;

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)morven_csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function resolveCsrfToken(): string | null {
  return csrfToken || getCsrfTokenFromCookie();
}

export function setAccessToken(token: string | null): void {
  // Stored in memory only — never persisted.
  (globalThis as Record<string, unknown>).__morven_access_token = token;
}

export function getAccessToken(): string | null {
  return ((globalThis as Record<string, unknown>).__morven_access_token as string) || null;
}

// ---------------------------------------------------------------------------
// Centralized 401 handling (H1)
//
// Access tokens are short-lived (15m) and stored only in memory. Every
// authenticated request must go through `authedFetch`, which transparently
// refreshes the access token (single-flight) and retries the original request
// once when it gets a 401 from an expired/invalid token. This keeps long
// sessions alive without a full page reload.
// ---------------------------------------------------------------------------

let tokenRotationHandler: (() => void) | null = null;

/** Register a callback fired whenever the access token is rotated (via refresh). */
export function setTokenRotationHandler(handler: (() => void) | null): void {
  tokenRotationHandler = handler;
}

function notifyTokenRotated(): void {
  tokenRotationHandler?.();
}

// ---------------------------------------------------------------------------
// Centralized session invalidation (definitive refresh 401 only)
//
// When /api/auth/refresh rejects with an explicit HTTP 401 the refresh session
// is genuinely dead (missing/invalid/expired/revoked refresh token) and the
// frontend must drop its in-memory identity — otherwise the UI keeps rendering
// a misleading logged-in shell backed by nothing. Network failures, timeouts
// and 403 CSRF rejections are NOT session failures and must never invalidate.
// ---------------------------------------------------------------------------

let sessionInvalidationHandler: (() => void) | null = null;

/**
 * Register a callback fired when a refresh definitively fails with HTTP 401.
 * Registered once by the auth store; may be a no-op (optional call) in test
 * doubles that export only part of this module's surface.
 */
export function setSessionInvalidationHandler(handler: (() => void) | null): void {
  sessionInvalidationHandler = handler;
}

function isConfirmedSessionRejection(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 401;
}

/**
 * Cross-tab rotation race: another tab sharing this cookie jar rotated the
 * single-use refresh token first. Whether our classify lookup ran before or
 * after the winner's commit decides which code we see — the server reports the
 * token as REPLAYED (we read the row, then the atomic consume found it gone) or
 * NOT_FOUND (we read it after it was already rotated away). Both are retried
 * once, because the winner's replacement cookie may already be in the shared
 * jar. A genuinely dead token simply fails the retry too, then invalidates.
 */
const ROTATION_RACE_CODES = new Set(['REFRESH_TOKEN_REPLAYED', 'REFRESH_TOKEN_NOT_FOUND']);

function isRotationRaceRejection(err: unknown): boolean {
  return isConfirmedSessionRejection(err) && ROTATION_RACE_CODES.has((err as { code?: unknown }).code as string);
}

/** Delay before the single bounded rotation-race retry, giving the winning
 *  tab's Set-Cookie time to land in the shared jar. */
export const ROTATION_RACE_RETRY_DELAY_MS = 200;

function invalidateSessionAfterRejection(err: unknown): void {
  // Only clear the in-memory token / identity on a CONFIRMED 401. Transient
  // failures (network, timeout, 5xx, CSRF) keep the local state intact so
  // reconnecting restores the session without a forced logout.
  if (isConfirmedSessionRejection(err)) {
    setAccessToken(null);
    sessionInvalidationHandler?.();
  } else {
    // Keep historical behaviour for transient failures: don't hold a stale
    // in-memory token that can no longer be used, but never invalidate the
    // persisted session/identity.
    setAccessToken(null);
  }
}

// Single-flight: only one refresh is ever in flight at a time. Concurrent 401s
// share the same refresh instead of spamming /api/auth/refresh.
let refreshPromise: Promise<boolean> | null = null;

/** Refreshes the access token once (single-flight). Resolves true if a fresh token is now available. */
function refreshAccessTokenSingleFlight(): Promise<boolean> {
  // Don't attempt refresh if offline - but in tests, navigator may behave differently
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine && typeof window !== 'undefined' && window.navigator.onLine === false;
  // For test environment, allow refresh attempts unless explicitly offline
  if (isOffline) {
    return Promise.resolve(false);
  }
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        await refresh();
        notifyTokenRotated();
        return true;
      } catch (err) {
        if (isRotationRaceRejection(err)) {
          // One bounded retry for the confirmed multi-tab double-refresh race.
          // Nothing else is ever retried — a definitive 401 must not be hammered.
          await new Promise((resolve) => setTimeout(resolve, ROTATION_RACE_RETRY_DELAY_MS));
          try {
            await refresh();
            notifyTokenRotated();
            return true;
          } catch (retryErr) {
            invalidateSessionAfterRejection(retryErr);
            return false;
          }
        }
        invalidateSessionAfterRejection(err);
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Public wrapper for external consumers (e.g. the Socket.IO service) that need
 * a fresh access token on demand. Single-flight across all callers.
 */
export function refreshTokenIfNeeded(): Promise<boolean> {
  return refreshAccessTokenSingleFlight();
}

/**
 * Resolve a usable access token for transports that cannot use `authedFetch`
 * directly (e.g. XMLHttpRequest, where upload progress events matter more than
 * automatic retry plumbing). Returns the in-memory token, or performs one
 * single-flight refresh when none is held (fresh page reload, expired token).
 * Resolves `null` when no session could be established — callers may then
 * proceed without a header and let the server decide, or fail fast.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const existing = getAccessToken();
  if (existing) return existing;
  const refreshed = await refreshAccessTokenSingleFlight();
  return refreshed ? getAccessToken() : null;
}

function buildAuthHeaders(existing: HeadersInit | undefined): Headers {
  const headers = new Headers(existing || {});
  const token = getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

/**
 * Authenticated fetch with automatic 401 handling. On a 401 from an expired
 * access token it performs a single-flight token refresh and retries once.
 * Safe for multipart (FormData) bodies, which are reusable on retry.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const perform = async (): Promise<Response> => {
    try {
      return await fetch(input, {
        ...init,
        credentials: 'include',
        headers: buildAuthHeaders(init.headers),
      });
    } catch (err) {
      // Connectivity/timeout/abort — normalise so the UI never shows the raw
      // engine error ("Failed to fetch"). No `status`, so it is classified as
      // transient/retryable everywhere else (never an auth failure).
      throw toNetworkError(NETWORK_ERROR_MESSAGE, err);
    }
  };

  try {
    let res = await perform();
    if (res.status === 401) {
      const refreshed = await refreshAccessTokenSingleFlight();
      if (refreshed) {
        res = await perform();
      }
    }
    return res;
  } catch (err) {
    // Network failure - re-throw for caller to handle
    // Don't treat as auth failure
    throw err;
  }
}

export async function authRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await authedFetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data.error || 'حدث خطأ غير متوقع') as Error & { code?: string; status?: number };
    // Attach the HTTP status so callers can distinguish a CONFIRMED server
    // rejection (4xx — never retried) from a transient failure (5xx) or a
    // connectivity failure (no status), which the offline queue retries.
    error.status = res.status;
    if (typeof data.code === 'string' && data.code) {
      error.code = data.code;
    }
    throw error;
  }

  return data as T;
}

export async function register(
  email: string,
  username: string,
  password: string,
  displayName: string,
): Promise<AuthResponse> {
  const { data, res } = await request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password, displayName }),
  });
  setAccessToken(data.accessToken);
  const cookies = parseCookies(res);
  if (cookies['morven_csrf_token']) {
    csrfToken = cookies['morven_csrf_token'];
  }
  return data;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const { data, res } = await request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAccessToken(data.accessToken);
  const cookies = parseCookies(res);
  if (cookies['morven_csrf_token']) {
    csrfToken = cookies['morven_csrf_token'];
  }
  return data;
}

export async function googleLogin(credential: string): Promise<AuthResponse> {
  // The backend (POST /api/auth/google) verifies the Google ID token, then
  // issues a Morven session exactly like password login (httpOnly refresh
  // cookie + CSRF cookie + access token), reusing this same auth system.
  const { data, res } = await request<AuthResponse>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
  setAccessToken(data.accessToken);
  const cookies = parseCookies(res);
  if (cookies['morven_csrf_token']) {
    csrfToken = cookies['morven_csrf_token'];
  }
  return data;
}

export async function logout(): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = resolveCsrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
    const { res } = await request('/api/auth/logout', { method: 'POST', headers });
    const cookies = parseCookies(res);
    if (cookies['morven_csrf_token'] === '') {
      csrfToken = null;
    }
  } finally {
    setAccessToken(null);
  }
}

function csrfHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = resolveCsrfToken();
  if (token) {
    headers['X-CSRF-Token'] = token;
  }
  return headers;
}

/**
 * Bootstraps the CSRF double-submit token for an anonymous visitor.
 *
 * Forgot/reset password are CSRF-protected like every other state-changing auth
 * action, but — unlike login/register/google, which mint the `morven_csrf_token`
 * cookie in their response — a logged-out user has no session and therefore no
 * CSRF cookie to echo. This requests a server-minted token from the exact same
 * single CSRF system (GET /api/auth/csrf) and stores it, mirroring how the
 * cookie-issuing auth endpoints establish it, so subsequent requests can send
 * the matching cookie + X-CSRF-Token header.
 */
async function bootstrapCsrfTokenIfNeeded(): Promise<void> {
  if (resolveCsrfToken()) return;
  const { res } = await request<{ ok: boolean }>('/api/auth/csrf', { method: 'GET' });
  const cookies = parseCookies(res);
  if (cookies['morven_csrf_token']) {
    csrfToken = cookies['morven_csrf_token'];
  }
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  await bootstrapCsrfTokenIfNeeded();
  const { data, res } = await request<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    headers: csrfHeaders(),
    body: JSON.stringify({ email }),
  });
  const cookies = parseCookies(res);
  if (cookies['morven_csrf_token']) {
    csrfToken = cookies['morven_csrf_token'];
  }
  return data;
}

export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  await bootstrapCsrfTokenIfNeeded();
  const { data, res } = await request<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    headers: csrfHeaders(),
    body: JSON.stringify({ token, password }),
  });
  const cookies = parseCookies(res);
  if (cookies['morven_csrf_token']) {
    csrfToken = cookies['morven_csrf_token'];
  }
  return data;
}

/** Refresh must never hang a boot forever; a timeout surfaces as an AbortError
 *  (no HTTP status), which callers classify as a connectivity failure — never
 *  as an invalid session. */
export const REFRESH_TIMEOUT_MS = 10_000;

export async function refresh(): Promise<AuthResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = resolveCsrfToken();
  if (token) {
    headers['X-CSRF-Token'] = token;
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS) : null;
  try {
    const { data, res } = await request<AuthResponse>('/api/auth/refresh', {
      method: 'POST',
      headers,
      ...(controller ? { signal: controller.signal } : {}),
    });
    setAccessToken(data.accessToken);
    const cookies = parseCookies(res);
    if (cookies['morven_csrf_token']) {
      csrfToken = cookies['morven_csrf_token'];
    }
    return data;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export async function getMe(): Promise<{ user: AuthUser }> {
  const token = getAccessToken();
  if (!token) throw new Error('لا يوجد رمز وصول');

  return authRequest<{ user: AuthUser }>('/api/auth/me');
}
