import { describe, it, expect, beforeEach } from 'vitest';
import {
  isGuestScope,
  getScopeKind,
  getScopeUserId,
  setScopeToAccount,
  setScopeToGuest,
  scopedKey,
  readScoped,
  writeScoped,
  promoteLegacyIfNeeded,
} from '@/storage/scope';

beforeEach(() => {
  localStorage.clear();
});

describe('scope helpers', () => {
  it('defaults to guest scope when nothing is stored', () => {
    expect(isGuestScope()).toBe(true);
    expect(getScopeKind()).toBe('guest');
    expect(getScopeUserId()).toBeNull();
  });

  it('setScopeToAccount persists account:<userId>', () => {
    setScopeToAccount('user-abc');
    expect(isGuestScope()).toBe(false);
    expect(getScopeKind()).toBe('account');
    expect(getScopeUserId()).toBe('user-abc');
  });

  it('setScopeToGuest restores guest scope', () => {
    setScopeToAccount('user-abc');
    setScopeToGuest();
    expect(isGuestScope()).toBe(true);
    expect(getScopeUserId()).toBeNull();
  });
});

describe('scopedKey', () => {
  it('prefixes guest scope with morven:guest:', () => {
    expect(scopedKey('tasks')).toBe('morven:guest:tasks');
  });

  it('prefixes account scope with morven:acct:<userId>:', () => {
    setScopeToAccount('u123');
    expect(scopedKey('tasks')).toBe('morven:acct:u123:tasks');
    expect(scopedKey('adhkar')).toBe('morven:acct:u123:adhkar');
  });

  it('guest and account scopes produce different keys', () => {
    const guestKey = scopedKey('notes');
    setScopeToAccount('u1');
    const accountKey = scopedKey('notes');
    expect(guestKey).not.toBe(accountKey);
  });

  it('different users produce different keys', () => {
    setScopeToAccount('u1');
    const k1 = scopedKey('tasks');
    setScopeToAccount('u2');
    const k2 = scopedKey('tasks');
    expect(k1).not.toBe(k2);
  });
});

describe('readScoped / writeScoped', () => {
  it('writes and reads a JSON value in the current scope', () => {
    writeScoped('tasks', [{ id: '1' }, { id: '2' }]);
    expect(readScoped('tasks', [])).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('returns fallback when key does not exist', () => {
    expect(readScoped('tasks', [])).toEqual([]);
    expect(readScoped('adhkar', { counts: {} })).toEqual({ counts: {} });
  });

  it('returns fallback on malformed JSON', () => {
    localStorage.setItem(scopedKey('tasks'), 'NOT_JSON');
    expect(readScoped('tasks', [])).toEqual([]);
  });

  it('scopes reads/writes per scope — guest and account are isolated', () => {
    writeScoped('tasks', [{ id: 'guest-task' }]);
    setScopeToAccount('u1');
    expect(readScoped('tasks', [])).toEqual([]);
    writeScoped('tasks', [{ id: 'acct-task' }]);
    setScopeToGuest();
    expect(readScoped('tasks', [])).toEqual([{ id: 'guest-task' }]);
  });

  it('scopes isolate per user', () => {
    setScopeToAccount('u1');
    writeScoped('tasks', [{ id: 'u1-task' }]);
    setScopeToAccount('u2');
    expect(readScoped('tasks', [])).toEqual([]);
  });
});

describe('promoteLegacyIfNeeded', () => {
  it('copies unscoped legacy keys into guest scope', () => {
    localStorage.setItem('morven-tasks', JSON.stringify([{ id: 't1' }]));
    localStorage.setItem('morven-adhkar', JSON.stringify({ counts: { a: 1 } }));

    promoteLegacyIfNeeded();

    expect(localStorage.getItem('morven:guest:tasks')).toBe(
      localStorage.getItem('morven-tasks'),
    );
    expect(localStorage.getItem('morven:guest:adhkar')).toBe(
      localStorage.getItem('morven-adhkar'),
    );
  });

  it('does not overwrite existing guest scope keys', () => {
    const existing = JSON.stringify([{ id: 'existing' }]);
    localStorage.setItem('morven:guest:tasks', existing);
    localStorage.setItem('morven-tasks', JSON.stringify([{ id: 'legacy' }]));

    promoteLegacyIfNeeded();

    expect(localStorage.getItem('morven:guest:tasks')).toBe(existing);
  });

  it('only runs once (idempotent)', () => {
    localStorage.setItem('morven-tasks', JSON.stringify([{ id: 't1' }]));

    promoteLegacyIfNeeded();
    promoteLegacyIfNeeded(); // second call should be no-op

    // legacy key still exists (not deleted)
    expect(localStorage.getItem('morven-tasks')).not.toBeNull();
  });

  it('ignores missing legacy keys gracefully', () => {
    // No legacy keys set at all
    expect(() => promoteLegacyIfNeeded()).not.toThrow();
    expect(isGuestScope()).toBe(true);
  });
});
