import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/pages/auth/authApi';
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  MAX_VIDEO_SIZE_MB,
  MediaApiError,
  cancelMediaJob,
  compressVideoFile,
  convertVideoFile,
  extractAudioFromVideo,
  removeMusicFromVideo,
  toArabicMediaError,
} from './mediaApi';

/* ------------------------------------------------------------------ */
/* XHR fake (upload phase)                                             */
/* ------------------------------------------------------------------ */

class FakeXHR {
  static instances: FakeXHR[] = [];
  static last(): FakeXHR {
    return FakeXHR.instances[FakeXHR.instances.length - 1];
  }

  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  responseType = '';
  response: unknown = null;
  status = 0;
  sentBody: FormData | null = null;
  headers: Record<string, string> = {};

  open = vi.fn();
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    FakeXHR.instances.push(this);
    this.sentBody = body;
  }

  respond(status: number, body: unknown) {
    this.status = status;
    this.response = body;
    this.onload?.();
  }
  failNetwork() {
    this.onerror?.();
  }
}

const API_BASE_URL = 'http://test-api.local'; // matches vitest.config env
const AUTH_HEADER = 'Bearer media-test-token';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function makeVideoFile(name = 'clip.mp4', sizeBytes = 1024): File {
  return new File([new ArrayBuffer(sizeBytes)], name, { type: 'video/mp4' });
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function fetchAuthHeader(callIndex: number, fetchMock: ReturnType<typeof vi.fn>): string | null {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  if (!init?.headers) return null;
  return new Headers(init.headers).get('Authorization');
}

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FakeXHR as unknown as typeof XMLHttpRequest);
  // The media transport must work for an authenticated session WITHOUT
  // triggering a refresh (a held token short-circuits getValidAccessToken).
  setAccessToken('media-test-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  setAccessToken(null);
  FakeXHR.instances = [];
});

/* ------------------------------------------------------------------ */
/* toArabicMediaError                                                  */
/* ------------------------------------------------------------------ */

describe('toArabicMediaError', () => {
  it('maps every known backend code to a clear Arabic message', () => {
    const cases: [string, RegExp][] = [
      ['UNSUPPORTED_FILE_TYPE', /نوع الملف غير مدعوم/],
      ['NO_AUDIO_TRACK', /لا يحتوي مسارًا صوتيًا/],
      ['FILE_TOO_LARGE', new RegExp(`${MAX_VIDEO_SIZE_MB}`)],
      ['INVALID_CONVERSION', /غير مدعوم/],
      ['PROCESSING_TIMEOUT', /أطول من المسموح/],
      ['FFMPEG_NOT_AVAILABLE', /غير متوفرة على الخادم/],
      ['STORAGE_ERROR', /مساحة تخزين/],
      ['JOB_NOT_FOUND', /انتهت صلاحية/],
      ['JOB_PROCESSING', /ما زالت المعالجة جارية/],
      ['SESSION_EXPIRED', /انتهت صلاحية الجلسة/],
    ];
    for (const [code, pattern] of cases) {
      expect(toArabicMediaError(new MediaApiError(code, 'raw detail'))).toMatch(pattern);
    }
  });

  it('never exposes raw technical messages for mapped codes', () => {
    const message = toArabicMediaError(
      new MediaApiError('PROCESSING_FAILED', 'ffmpeg exited with code 1: C:\\secret\\path')
    );
    expect(message).not.toContain('ffmpeg');
    expect(message).not.toContain('C:\\');
  });

  it('recognizes corrupted-file details in generic failures', () => {
    expect(
      toArabicMediaError(new Error('Invalid data found; input corrupted'))
    ).toMatch(/تالف/);
  });

  it('maps network errors to the offline message', () => {
    expect(toArabicMediaError(new MediaApiError('NETWORK_ERROR', 'offline'))).toMatch(
      /غير متصل بالإنترنت/
    );
  });
});

/* ------------------------------------------------------------------ */
/* upload phase (XHR)                                                  */
/* ------------------------------------------------------------------ */

describe('startMediaJob via extractAudioFromVideo', () => {
  it('sends the file and option fields and captures the jobId', async () => {
    const DOWNLOAD_BYTES = 64;
    const fetchMock = vi.fn()
      // status poll -> done
      .mockResolvedValueOnce(jsonResponse({ status: 'done', fileName: 'a.mp3' }))
      // download
      .mockResolvedValueOnce(
        new Response('a'.repeat(DOWNLOAD_BYTES), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="a.mp3"' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const cancelRef = {};
    const promise = extractAudioFromVideo(makeVideoFile(), { format: 'm4a', quality: 'standard' }, undefined, cancelRef);

    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    const xhr = FakeXHR.last();
    expect(xhr.open).toHaveBeenCalledWith('POST', `${API_BASE_URL}/api/media/extract-audio`);
    expect(xhr.sentBody!.get('format')).toBe('m4a');
    expect(xhr.sentBody!.get('quality')).toBe('standard');
    expect(xhr.sentBody!.get('file')).toBeInstanceOf(File);

    xhr.respond(202, { jobId: 'job-42' });
    const result = await promise;

    expect(cancelRef).toHaveProperty('jobId', 'job-42');
    expect(result.filename).toBe('a.mp3');
    expect(result.blob.size).toBe(DOWNLOAD_BYTES);
    // one status poll + one download call, no polling loop needed
    expect(fetchMock.mock.calls[0][0]).toContain('/api/media/jobs/job-42/status');
    expect(fetchMock.mock.calls[1][0]).toContain('/api/media/jobs/job-42/download');
  });

  it('reports byte-level upload progress through the handler', async () => {
    // Fresh Response per call: a Response body can only be consumed once.
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ status: 'done' }));
    vi.stubGlobal('fetch', fetchMock);

    const events: string[] = [];
    const onProgress = (p: { phase: string }) => events.push(p.phase);

    const promise = extractAudioFromVideo(makeVideoFile(), { format: 'mp3', quality: 'high' }, onProgress, {});
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    const xhr = FakeXHR.last();
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.respond(202, { jobId: 'j' });

    await promise;
    expect(events[0]).toBe('uploading');
    expect(events).toContain('processing');
    expect(events[events.length - 1]).toBe('downloading');
  });

  it('rejects unsupported types with the backend Arabic-mappable code', async () => {
    const promise = extractAudioFromVideo(makeVideoFile(), { format: 'mp3', quality: 'high' });
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    FakeXHR.last().respond(415, { code: 'UNSUPPORTED_FILE_TYPE', error: 'unsupported' });

    await expect(promise).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('converts network failure during upload into NETWORK_ERROR', async () => {
    const promise = compressVideoFile(makeVideoFile('big.mp4', 4096), 'medium');
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    FakeXHR.last().failNetwork();

    await expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await expect(
      promise.catch((err) => toArabicMediaError(err))
    ).resolves.toMatch(/غير متصل بالإنترنت/);
  });

  it('compressVideoFile sends the preset field to the right endpoint', async () => {
    const file = makeVideoFile('فيديو.mp4');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'done' }))
      .mockResolvedValueOnce(
        new Response(new Blob(['x']), {
          status: 200,
          headers: { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('فيديو-compressed.mp4')}` },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = compressVideoFile(file, 'strong');
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    expect(FakeXHR.last().open).toHaveBeenCalledWith('POST', `${API_BASE_URL}/api/media/compress-video`);
    FakeXHR.last().respond(202, { jobId: 'jj' });

    const res = await promise;
    expect(res.filename).toBe('فيديو-compressed.mp4');
  });

  it('convertVideoFile posts the target container', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'done' }))
      .mockResolvedValueOnce(new Response(new Blob(['x']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = convertVideoFile(makeVideoFile('movie.mkv'), 'webm');
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    expect(FakeXHR.last().open).toHaveBeenCalledWith('POST', `${API_BASE_URL}/api/media/convert-video`);
    FakeXHR.last().respond(202, { jobId: 'k' });

    await expect(promise).resolves.toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* polling                                                             */
/* ------------------------------------------------------------------ */

describe('polling behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('polls until done and reports real progress percentages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'processing', progress: 0.3 }))
      .mockResolvedValueOnce(jsonResponse({ status: 'processing', progress: 0.75 }))
      .mockResolvedValueOnce(jsonResponse({ status: 'done', outputSize: 10 }))
      // download
      .mockResolvedValueOnce(
        new Response(new Blob(['audio']), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="song.mp3"' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const percents: (number | null)[] = [];
    const promise = extractAudioFromVideo(
      makeVideoFile(),
      { format: 'mp3', quality: 'high' },
      (p) => {
        if (p.phase === 'processing') percents.push(p.percent);
      },
      {}
    );

    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    FakeXHR.last().respond(202, { jobId: 'progress-job' });

    await vi.advanceTimersByTimeAsync(1200); // poll 1 -> 30%
    await vi.advanceTimersByTimeAsync(1200); // poll 2 -> 75%
    await vi.advanceTimersByTimeAsync(1200); // poll 3 -> done

    const result = await promise;
    expect(result.filename).toBe('song.mp3');
    expect(percents).toEqual(expect.arrayContaining([30, 75]));
  });

  it('surfaces server-side job errors with their code', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({ status: 'error', code: 'PROCESSING_FAILED', error: 'corrupted input detected' }, 200)
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = compressVideoFile(makeVideoFile(), 'light');
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    FakeXHR.last().respond(202, { jobId: 'bad-job' });

    // Attach the rejection expectation before the timers fire so the
    // rejection never goes unhandled between ticks.
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'PROCESSING_FAILED',
      message: 'corrupted input detected',
    });
    await vi.advanceTimersByTimeAsync(1200);
    await assertion;
  });

  it('gives up with PROCESSING_TIMEOUT after the deadline', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse({ status: 'processing', progress: -1 }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = compressVideoFile(makeVideoFile(), 'light');
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    FakeXHR.last().respond(202, { jobId: 'slow-job' });

    const assertion = expect(promise).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' });
    // Push fake time well past the 25-minute deadline.
    await vi.advanceTimersByTimeAsync(26 * 60 * 1000);
    await assertion;
  });
});

/* ------------------------------------------------------------------ */
/* remove-music (multi-output job)                                     */
/* ------------------------------------------------------------------ */

describe('removeMusicFromVideo', () => {
  it('fetches the audio output BEFORE the video download and returns both', async () => {
    const fetchMock = vi
      .fn()
      // status poll -> done
      .mockResolvedValueOnce(jsonResponse({ status: 'done', fileName: 'clip-no-music.mp4' }))
      // audio download
      .mockResolvedValueOnce(
        new Response(new Blob(['audio']), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="clip-no-music.mp3"' },
        })
      )
      // video download (consumes the job -> cleanup)
      .mockResolvedValueOnce(
        new Response(new Blob(['video']), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="clip-no-music.mp4"' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = removeMusicFromVideo(makeVideoFile('clip.mp4'), undefined, {});
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    expect(FakeXHR.last().open).toHaveBeenCalledWith(
      'POST',
      `${API_BASE_URL}/api/media/remove-music`
    );
    expect(FakeXHR.last().sentBody!.get('file')).toBeInstanceOf(File);
    FakeXHR.last().respond(202, { jobId: 'rm-1' });

    const result = await promise;

    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls[0]).toContain('/api/media/jobs/rm-1/status');
    expect(urls[1]).toContain('/api/media/jobs/rm-1/download-audio');
    expect(urls[2]).toContain('/api/media/jobs/rm-1/download');
    // audio must be fetched before the video (which consumes the job)
    expect(urls.indexOf('http://test-api.local/api/media/jobs/rm-1/download-audio'))
      .toBeLessThan(urls.indexOf('http://test-api.local/api/media/jobs/rm-1/download'));

    expect(result.audio.filename).toBe('clip-no-music.mp3');
    expect(result.audio.blob.size).toBeGreaterThan(0);
    expect(result.video.filename).toBe('clip-no-music.mp4');
    expect(result.video.blob.size).toBeGreaterThan(0);
  });

  it('surfaces job errors as the backend code', async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({ status: 'error', code: 'NO_AUDIO_TRACK', error: 'no audio' })
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = removeMusicFromVideo(makeVideoFile(), undefined, {});
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    FakeXHR.last().respond(202, { jobId: 'rm-bad' });

    await expect(promise).rejects.toMatchObject({ code: 'NO_AUDIO_TRACK' });
  });
});

/* ------------------------------------------------------------------ */
/* cancellation                                                        */
/* ------------------------------------------------------------------ */

describe('cancelMediaJob', () => {
  it('DELETEs the job resource and reports success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(cancelMediaJob('job-x')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/media/jobs/job-x`,
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('returns false instead of throwing when offline', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(cancelMediaJob('job-y')).resolves.toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* authenticated media transport (production 401 regression)           */
/* ------------------------------------------------------------------ */

describe('authenticated media transport', () => {
  it('attaches Authorization to the upload XHR and never a manual Content-Type', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'done', fileName: 'a.mp3' }))
      .mockResolvedValueOnce(
        new Response(new Blob(['a']), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="a.mp3"' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = extractAudioFromVideo(makeVideoFile(), { format: 'mp3', quality: 'high' }, undefined, {});
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    const xhr = FakeXHR.last();
    xhr.respond(202, { jobId: 'auth-job' });
    await promise;

    expect(xhr.headers['Authorization']).toBe(AUTH_HEADER);
    // The browser must own the multipart boundary — no manual Content-Type.
    expect(xhr.headers['Content-Type']).toBeUndefined();
  });

  it('sends Authorization on the poll, download and cancel requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'done', fileName: 'a.mp3' }))
      .mockResolvedValueOnce(
        new Response(new Blob(['a']), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="a.mp3"' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = extractAudioFromVideo(makeVideoFile(), { format: 'mp3', quality: 'high' }, undefined, {});
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    FakeXHR.last().respond(202, { jobId: 'auth-job-2' });
    await promise;

    expect(fetchAuthHeader(0, fetchMock)).toBe(AUTH_HEADER); // status poll
    expect(fetchAuthHeader(1, fetchMock)).toBe(AUTH_HEADER); // download

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(cancelMediaJob('auth-job-2')).resolves.toBe(true);
    expect(fetchAuthHeader(2, fetchMock)).toBe(AUTH_HEADER); // DELETE
    expect(fetchMock.mock.calls[2][0]).toContain('/api/media/jobs/auth-job-2');
  });

  it('refreshes once and replays the upload when the access token is expired', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(
          jsonResponse({ user: { id: 'u1' }, accessToken: 'fresh-media-token' }, 200, {
            'Set-Cookie': 'morven_csrf_token=csrf2; Path=/',
          })
        );
      }
      if (url.includes('/status')) return Promise.resolve(jsonResponse({ status: 'done' }));
      if (url.includes('/download')) {
        return Promise.resolve(
          new Response(new Blob(['a']), {
            status: 200,
            headers: { 'Content-Disposition': 'attachment; filename="a.mp3"' },
          })
        );
      }
      return Promise.resolve(jsonResponse({ error: 'not found' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = extractAudioFromVideo(makeVideoFile(), { format: 'mp3', quality: 'high' }, undefined, {});
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    FakeXHR.last().respond(401, { error: 'رمز الوصول غير صالح' });

    // Retry attempt with the refreshed token.
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(2));
    expect(FakeXHR.instances[0].headers['Authorization']).toBe(AUTH_HEADER);
    expect(FakeXHR.instances[1].headers['Authorization']).toBe('Bearer fresh-media-token');

    FakeXHR.last().respond(202, { jobId: 'retried-job' });
    await promise;

    const refreshCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('gives up with SESSION_EXPIRED when refresh cannot recover the upload', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(jsonResponse({ error: 'رمز التحديث غير صالح أو منتهي الصلاحية' }, 401));
      }
      return Promise.resolve(jsonResponse({ error: 'not found' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = extractAudioFromVideo(makeVideoFile(), { format: 'mp3', quality: 'high' }, undefined, {});
    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    FakeXHR.last().respond(401, { error: 'غير مصرح' });

    await expect(promise).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    // Bounded: exactly one replay attempt, never a retry storm.
    expect(FakeXHR.instances).toHaveLength(1);
    const refreshCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    await expect(promise.catch((err: unknown) => toArabicMediaError(err))).resolves.toMatch(
      /انتهت صلاحية الجلسة/
    );
  });

  it('maps SESSION_EXPIRED to a clear Arabic login prompt', () => {
    expect(toArabicMediaError(new MediaApiError('SESSION_EXPIRED', 'raw'))).toMatch(
      /تسجيل الدخول مجددًا/
    );
  });

  it('aborts polling with SESSION_EXPIRED instead of spinning when the session dies mid-job', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(jsonResponse({ error: 'رمز التحديث غير صالح' }, 401));
      }
      // The protected status endpoint keeps rejecting: refresh failed, so
      // authedFetch returns the original 401 response.
      return Promise.resolve(jsonResponse({ error: 'غير مصرح' }, 401));
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = compressVideoFile(makeVideoFile(), 'light', undefined, {});
    const assertion = expect(promise).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });

    await vi.waitFor(() => expect(FakeXHR.instances.length).toBe(1));
    FakeXHR.last().respond(202, { jobId: 'dying-job' });

    await vi.advanceTimersByTimeAsync(1200); // first status poll -> 401
    await assertion;

    // One refresh attempt total (single-flight), no 25-minute 401 spin.
    const refreshCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */

describe('accepted video constants', () => {
  it('exposes a generous allow-list of containers', () => {
    expect(ACCEPTED_VIDEO_EXTENSIONS).toContain('.mp4');
    expect(ACCEPTED_VIDEO_EXTENSIONS).toContain('.mkv');
    expect(MAX_VIDEO_SIZE_MB).toBeGreaterThan(0);
  });

  it('caps video uploads at 100 MB by default', () => {
    expect(MAX_VIDEO_SIZE_MB).toBe(100);
  });
});
