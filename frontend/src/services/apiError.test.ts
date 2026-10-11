import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NETWORK_ERROR_CODE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  isNetworkFailure,
  normalizeUserMessage,
  toNetworkError,
  userFacingMessage,
} from '@/services/apiError';

describe('apiError — network failure classification', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats a normalised network error as a network failure', () => {
    const err = toNetworkError(NETWORK_ERROR_MESSAGE, new TypeError('Failed to fetch'));
    expect(isNetworkError(err)).toBe(true);
    expect(isNetworkFailure(err)).toBe(true);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe(NETWORK_ERROR_CODE);
  });

  it('treats raw engine TypeErrors as network failures regardless of locale', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(isNetworkFailure(new Error('load failed'))).toBe(true);
    expect(isNetworkFailure(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
  });

  it('treats a failure while the browser reports offline as a network failure', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(isNetworkFailure(new Error('anything'))).toBe(true);
  });

  it('never classifies a server response (has HTTP status) as a network failure', () => {
    const serverErr = Object.assign(new Error('البريد مستخدم'), { status: 409 });
    expect(isNetworkFailure(serverErr)).toBe(false);
  });
});

describe('apiError — user-facing messages', () => {
  it('returns the Arabic network message for connectivity failures', () => {
    expect(userFacingMessage(new TypeError('Failed to fetch'), 'fallback')).toBe(NETWORK_ERROR_MESSAGE);
    expect(userFacingMessage(toNetworkError('x'), 'fallback')).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('preserves meaningful server validation messages', () => {
    const serverErr = Object.assign(new Error('البريد الإلكتروني مستخدم بالفعل'), { status: 409 });
    expect(userFacingMessage(serverErr, 'fallback')).toBe('البريد الإلكتروني مستخدم بالفعل');
  });

  it('falls back when there is no message', () => {
    expect(userFacingMessage(null, 'حدث خطأ')).toBe('حدث خطأ');
    expect(userFacingMessage({}, 'حدث خطأ')).toBe('حدث خطأ');
  });

  it('normalises raw connectivity strings but leaves other text untouched', () => {
    expect(normalizeUserMessage('Failed to fetch')).toBe(NETWORK_ERROR_MESSAGE);
    expect(normalizeUserMessage('NetworkError when attempting to fetch resource.')).toBe(
      NETWORK_ERROR_MESSAGE,
    );
    expect(normalizeUserMessage('لا يمكنك مغادرة المجموعة')).toBe('لا يمكنك مغادرة المجموعة');
  });
});
