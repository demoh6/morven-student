import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIdb, type FakeIdb } from '@/test/fakeIdb';
import { setScopeToAccount, setScopeToGuest } from '@/storage/scope';

type KeyRangeLike = { __only: unknown };
(globalThis as unknown as { IDBKeyRange: unknown }).IDBKeyRange = {
  only: (value: unknown): KeyRangeLike => ({ __only: value }),
};

const mocks = vi.hoisted(() => ({
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  unmarkAsRead: vi.fn(),
  updateOwnProfile: vi.fn(),
  currentUser: { value: null as { id: string } | null },
}));

vi.mock('@/pages/auth/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ user: mocks.currentUser.value }) },
}));

vi.mock('@/components/Layout/Header/Notification/notificationApi', () => ({
  markAsRead: mocks.markAsRead,
  markAllAsRead: mocks.markAllAsRead,
  unmarkAsRead: mocks.unmarkAsRead,
}));

vi.mock('@/services/profileApi', () => ({
  updateOwnProfile: mocks.updateOwnProfile,
}));

vi.mock('@/services/db', () => ({
  openDB: vi.fn(),
  FILE_STORE: 'files',
  CACHE_STORE: 'cache',
  MUTATION_STORE: 'mutations',
}));

import { openDB } from '@/services/db';
import {
  enqueueMutation,
  listMutations,
  flushMutations,
  backoffDelay,
  isRetryableError,
  isConfirmedRejection,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
} from '@/services/offlineQueue';

const mockOpenDB = vi.mocked(openDB);
let fake: FakeIdb;

function asAccount(id: string) {
  setScopeToAccount(id);
  mocks.currentUser.value = { id };
}

beforeEach(() => {
  localStorage.clear();
  setScopeToGuest();
  vi.clearAllMocks();
  fake = createFakeIdb();
  mockOpenDB.mockImplementation(async () => fake.db);
  mocks.currentUser.value = null;
  for (const fn of Object.values(mocks)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      (fn as ReturnType<typeof vi.fn>).mockReset();
      (fn as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    }
  }
});

describe('offlineQueue — enqueue + dedupe', () => {
  it('never queues guest work', async () => {
    setScopeToGuest();
    const rec = await enqueueMutation({
      type: 'notification.read',
      payload: { id: 'n1' },
      idempotencyKey: 'read:n1',
    });
    expect(rec).toBeNull();
    expect(fake.all('mutations')).toHaveLength(0);
  });

  it('deduplicates by (type, idempotencyKey)', async () => {
    asAccount('u1');
    const a = await enqueueMutation({
      type: 'notification.read',
      payload: { id: 'n1' },
      idempotencyKey: 'read:n1',
    });
    const b = await enqueueMutation({
      type: 'notification.read',
      payload: { id: 'n1' },
      idempotencyKey: 'read:n1',
    });
    expect(b?.id).toBe(a?.id);
    expect(await listMutations()).toHaveLength(1);
  });

  it('replaces the payload when replace:true (last-write-wins)', async () => {
    asAccount('u1');
    await enqueueMutation({
      type: 'profile.update',
      payload: { displayName: 'A' },
      idempotencyKey: 'profile:update',
      replace: true,
    });
    await enqueueMutation({
      type: 'profile.update',
      payload: { displayName: 'B' },
      idempotencyKey: 'profile:update',
      replace: true,
    });
    const rows = await listMutations();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({ displayName: 'B' });
  });

  it('keeps queues isolated per account scope', async () => {
    asAccount('u1');
    await enqueueMutation({ type: 'notification.read', payload: { id: 'n1' }, idempotencyKey: 'read:n1' });

    asAccount('u2');
    expect(await listMutations()).toHaveLength(0);

    asAccount('u1');
    expect(await listMutations()).toHaveLength(1);
  });
});

describe('offlineQueue — flush', () => {
  it('replays a queued mutation and removes it after server confirmation', async () => {
    asAccount('u1');
    await enqueueMutation({ type: 'notification.read', payload: { id: 'n1' }, idempotencyKey: 'read:n1' });

    const result = await flushMutations();

    expect(mocks.markAsRead).toHaveBeenCalledWith('n1');
    expect(result.processed).toBe(1);
    expect(await listMutations()).toHaveLength(0);
  });

  it('never replays one account\'s queue under another account', async () => {
    asAccount('u1');
    await enqueueMutation({ type: 'notification.read', payload: { id: 'n1' }, idempotencyKey: 'read:n1' });

    // The authenticated user changes but the storage scope still points at u1.
    mocks.currentUser.value = { id: 'u2' };

    const result = await flushMutations();

    expect(result.processed).toBe(0);
    expect(mocks.markAsRead).not.toHaveBeenCalled();
    expect(await listMutations()).toHaveLength(1);
  });

  it('drops a mutation the server definitively rejected (4xx) without retrying', async () => {
    asAccount('u1');
    await enqueueMutation({ type: 'notification.read', payload: { id: 'n1' }, idempotencyKey: 'read:n1' });
    mocks.markAsRead.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

    const result = await flushMutations();

    expect(result.failed).toBe(1);
    expect(await listMutations()).toHaveLength(0);
  });

  it('keeps and backs off a transient (5xx) failure instead of losing it', async () => {
    asAccount('u1');
    await enqueueMutation({ type: 'notification.read', payload: { id: 'n1' }, idempotencyKey: 'read:n1' });
    mocks.markAsRead.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));

    const first = await flushMutations();
    expect(first.failed).toBe(1);

    const rows = await listMutations();
    expect(rows).toHaveLength(1);
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].nextAttemptAt).toBeGreaterThan(Date.now());

    // A tight retry is skipped until the backoff window elapses.
    const second = await flushMutations();
    expect(second.processed).toBe(0);
    expect(mocks.markAsRead).toHaveBeenCalledTimes(1);
  });

  it('treats a connectivity failure (no HTTP status) as retryable', async () => {
    asAccount('u1');
    await enqueueMutation({ type: 'notification.read', payload: { id: 'n1' }, idempotencyKey: 'read:n1' });
    mocks.markAsRead.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await flushMutations();

    expect(result.failed).toBe(1);
    expect(await listMutations()).toHaveLength(1);
  });

  it('halts (and preserves the queue) on a session/auth failure', async () => {
    asAccount('u1');
    await enqueueMutation({ type: 'notification.read', payload: { id: 'n1' }, idempotencyKey: 'read:n1' });
    mocks.markAsRead.mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));

    const result = await flushMutations();

    expect(result.halted).toBe(true);
    expect(await listMutations()).toHaveLength(1);
  });
});

describe('offlineQueue — error classification + backoff', () => {
  it('classifies retryable vs confirmed-rejection errors', () => {
    expect(isRetryableError(new TypeError('network'))).toBe(true);
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 404 })).toBe(false);
    expect(isConfirmedRejection({ status: 403 })).toBe(true);
    expect(isConfirmedRejection(new TypeError('network'))).toBe(false);
  });

  it('bounds exponential backoff at the ceiling', () => {
    expect(backoffDelay(1)).toBe(BASE_BACKOFF_MS);
    expect(backoffDelay(3)).toBe(BASE_BACKOFF_MS * 4);
    expect(backoffDelay(50)).toBe(MAX_BACKOFF_MS);
  });
});
