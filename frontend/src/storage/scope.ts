const SCOPE_KEY = 'morven:scope';

type ScopeString = string; // 'guest' or 'account:<userId>'

// ---------------------------------------------------------------------------
// Scope read/write
// ---------------------------------------------------------------------------

function readScopeString(): ScopeString {
  try {
    return localStorage.getItem(SCOPE_KEY) || 'guest';
  } catch {
    return 'guest';
  }
}

export function isGuestScope(): boolean {
  return readScopeString() === 'guest';
}

export function getScopeKind(): 'guest' | 'account' {
  return readScopeString() === 'guest' ? 'guest' : 'account';
}

export function getScopeUserId(): string | null {
  const raw = readScopeString();
  return raw.startsWith('account:') ? raw.slice('account:'.length) : null;
}

export function setScopeToAccount(userId: string): void {
  localStorage.setItem(SCOPE_KEY, `account:${userId}`);
}

export function setScopeToGuest(): void {
  localStorage.setItem(SCOPE_KEY, 'guest');
}

// ---------------------------------------------------------------------------
// Scoped key mapping
//
// Every localStorage key used by a personal store goes through this function.
// Format: morven:guest:<logical> | morven:acct:<userId>:<logical>
// ---------------------------------------------------------------------------

function scopePrefix(): string {
  const raw = readScopeString();
  return raw === 'guest' ? 'morven:guest' : `morven:acct:${raw.slice('account:'.length)}`;
}

/** Map a logical storage name to a fully-scoped localStorage key. */
export function scopedKey(logical: string): string {
  return `${scopePrefix()}:${logical}`;
}

/** Read + parse a scoped JSON value. Returns fallback on absence or error. */
export function readScoped<T>(logical: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(scopedKey(logical));
    return saved !== null ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Write a JSON value under the current scope. Best-effort. */
export function writeScoped(logical: string, value: unknown): void {
  try {
    localStorage.setItem(scopedKey(logical), JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

// ---------------------------------------------------------------------------
// One-time legacy promotion
//
// On first boot after Phase 3 lands, old unscoped keys (morven-tasks, etc.) are
// copied into the guest scope so existing local data is preserved. The old keys
// are left in place during the same boot session so that any synchronous reader
// that already resolved its module-level initialisation is unaffected.
// ---------------------------------------------------------------------------

const LEGACY_MAP: Array<{ legacy: string; logical: string }> = [
  { legacy: 'morven-tasks', logical: 'tasks' },
  { legacy: 'morven-exams', logical: 'exams' },
  { legacy: 'morven-flashcards', logical: 'flashcards' },
  { legacy: 'morven-files', logical: 'files' },
  { legacy: 'morven-recentTools', logical: 'recentTools' },
  { legacy: 'morven-stats', logical: 'stats' },
  { legacy: 'morven-notes', logical: 'notes' },
  { legacy: 'morven-pomodoro', logical: 'pomodoro' },
  { legacy: 'morven-adhkar', logical: 'adhkar' },
];

let legacyPromoted = false;

export function promoteLegacyIfNeeded(): void {
  if (legacyPromoted) return;
  legacyPromoted = true;

  try {
    for (const { legacy, logical } of LEGACY_MAP) {
      const raw = localStorage.getItem(legacy);
      if (raw === null) continue;
      const target = `morven:guest:${logical}`;
      if (localStorage.getItem(target) !== null) continue; // already promoted
      localStorage.setItem(target, raw);
    }
  } catch {
    // storage unavailable — graceful no-op
  }
}
