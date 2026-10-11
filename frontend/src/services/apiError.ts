export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

/**
 * The single, consistent Arabic message shown for any user-facing connectivity
 * failure (a rejected `fetch`, a timeout, or a request made while offline).
 * Real server messages (validation errors, 4xx/5xx `error` bodies) are never
 * replaced by it — see `userFacingMessage`.
 */
export const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالإنترنت. تحقق من اتصالك وحاول مرة أخرى.';

/**
 * Shown when a group's details were never cached and cannot be fetched offline.
 * More specific than the generic network message so the user understands why
 * the page is empty rather than merely "offline".
 */
export const OFFLINE_GROUP_DETAIL_MESSAGE =
  'لا يمكن عرض هذه المجموعة دون اتصال بالإنترنت لأن بياناتها لم تُحمَّل من قبل. اتصل بالإنترنت ثم حاول مرة أخرى.';

export class ApiError extends Error {
  code: string;
  cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.cause = cause;
  }
}

export function isNetworkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  return (err as { code?: unknown }).code === NETWORK_ERROR_CODE;
}

export function toNetworkError(message: string, cause?: unknown): ApiError {
  return new ApiError(NETWORK_ERROR_CODE, message, cause);
}

/**
 * Raw runtime strings that browsers/engines throw when a request cannot reach
 * the network. They are technical English and must never reach the UI.
 */
const RAW_NETWORK_PATTERNS = [
  /failed to fetch/i,
  /load failed/i,
  /networkerror/i,
  /network error/i,
  /fetch failed/i,
  /network request failed/i,
  /the internet connection appears to be offline/i,
];

/**
 * True when a failure is a connectivity/offline failure rather than a
 * server-authored response. Deliberately conservative: an error carrying an
 * HTTP `status` is treated as a real server answer (and its message kept).
 */
export function isNetworkFailure(err: unknown): boolean {
  if (isNetworkError(err)) return true;
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return false;
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    if (RAW_NETWORK_PATTERNS.some((re) => re.test(err.message))) return true;
  }
  // The browser reports being offline and the failure carries no HTTP status,
  // so it can only be a connectivity failure.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return false;
}

/**
 * Map a caught error to the message a user should see: the consistent Arabic
 * network message for connectivity failures, the server's own message when it
 * authored one, otherwise `fallback`. Never surfaces raw engine strings such as
 * "Failed to fetch".
 */
export function userFacingMessage(err: unknown, fallback: string): string {
  if (isNetworkFailure(err)) return NETWORK_ERROR_MESSAGE;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Normalise a message that is about to be shown in a toast/banner/notification.
 * Converts raw connectivity strings (e.g. an `Error('Failed to fetch')` whose
 * `.message` was passed straight through) into the Arabic network message while
 * leaving every other message — including server validation text — untouched.
 */
export function normalizeUserMessage(message: string): string {
  return RAW_NETWORK_PATTERNS.some((re) => re.test(message))
    ? NETWORK_ERROR_MESSAGE
    : message;
}
