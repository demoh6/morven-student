/**
 * Minimal in-memory IndexedDB fake for unit tests that exercise the
 * IndexedDB-backed offline layer (cache + mutation queue). The repo does not
 * depend on `fake-indexeddb`, and jsdom has no IndexedDB, so tests mock
 * `@/services/db#openDB` to return this fake.
 *
 * Supports exactly the surface the offline modules use:
 *   transaction(name, mode) -> objectStore(name) -> get/put/delete/clear
 *   objectStore(name).index('scope').getAll(IDBKeyRange.only(x))
 *   objectStore(name).index('scope').openCursor(IDBKeyRange.only(x))
 */

type Row = { id: string } & Record<string, unknown>;

interface FakeRequest<T = unknown> {
  result?: T;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

function microtaskRequest<T>(result?: T): FakeRequest<T> {
  const req: FakeRequest<T> = { result, onsuccess: null, onerror: null };
  queueMicrotask(() => req.onsuccess?.());
  return req;
}

class FakeStore {
  constructor(private readonly data: Map<string, Row>) {}

  get(id: string): FakeRequest<Row | undefined> {
    return microtaskRequest(this.data.get(id));
  }

  put(record: Row): FakeRequest {
    this.data.set(record.id, structuredClone(record));
    return microtaskRequest();
  }

  delete(id: string): FakeRequest {
    this.data.delete(id);
    return microtaskRequest();
  }

  clear(): FakeRequest {
    this.data.clear();
    return microtaskRequest();
  }

  index(name: string) {
    const match = (row: Row, range: unknown): boolean => {
      const only = (range as { __only?: unknown } | undefined)?.__only;
      return row[name] === only;
    };
    const rows = (range: unknown) =>
      [...this.data.values()].filter((r) => match(r, range));

    return {
      getAll: (range: unknown): FakeRequest<Row[]> =>
        microtaskRequest(rows(range)),
      openCursor: (range: unknown): FakeRequest => {
        const list = [...this.data.entries()].filter(([, r]) => match(r, range));
        let i = 0;
        const req: FakeRequest = { onsuccess: null, onerror: null };
        const step = () => {
          if (i >= list.length) {
            req.result = null;
            req.onsuccess?.();
            return;
          }
          const [primaryKey, value] = list[i++];
          req.result = {
            primaryKey,
            value,
            continue: () => queueMicrotask(step),
          };
          req.onsuccess?.();
        };
        queueMicrotask(step);
        return req;
      },
    };
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor(private readonly stores: Map<string, FakeStore>) {
    // Complete after all microtask-scheduled requests have fired.
    queueMicrotask(() => setTimeout(() => this.oncomplete?.(), 0));
  }

  objectStore(name: string): FakeStore {
    const store = this.stores.get(name);
    if (!store) throw new Error(`no store ${name}`);
    return store;
  }
}

export interface FakeIdb {
  db: IDBDatabase;
  stores: Record<string, Map<string, Row>>;
  seed: (store: string, record: Row) => void;
  all: (store: string) => Row[];
  reset: () => void;
}

export function createFakeIdb(): FakeIdb {
  const maps: Record<string, Map<string, Row>> = {
    files: new Map(),
    cache: new Map(),
    mutations: new Map(),
  };

  const buildStores = () => {
    const m = new Map<string, FakeStore>();
    for (const [name, data] of Object.entries(maps)) m.set(name, new FakeStore(data));
    return m;
  };

  const db = {
    transaction: () => new FakeTransaction(buildStores()),
  } as unknown as IDBDatabase;

  return {
    db,
    stores: maps,
    seed: (store, record) => void maps[store].set(record.id, { ...record }),
    all: (store) => [...maps[store].values()],
    reset: () => {
      for (const data of Object.values(maps)) data.clear();
    },
  };
}
