import { vi } from 'vitest';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import '@testing-library/jest-dom/vitest';

// pdf.js needs a worker URL it can import under Vitest (the app's bundled
// `new URL(...)` resolves to an http:// URL that Node's ESM loader rejects).
try {
  const require = createRequire(join(process.cwd(), 'package.json'));
  const workerPath = require.resolve('pdfjs-dist/build/pdf.worker.mjs');
  const { GlobalWorkerOptions } = require('pdfjs-dist') as typeof import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
} catch {
  // Fall back to pdf.js defaults if the worker file cannot be resolved.
}

// jsdom does not implement object URLs; the video tools rely on them for
// previews, so provide deterministic stubs.
if (typeof URL.createObjectURL !== 'function') {
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => `blob:mock-${Math.random().toString(36).slice(2)}`,
    configurable: true,
    writable: true,
  });
}
if (typeof URL.revokeObjectURL !== 'function') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => undefined,
    configurable: true,
    writable: true,
  });
}

// Node-environment tests (e.g. socket.io integration tests) have no `window`;
// the stubs below are jsdom-only.
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = () => undefined;

  // jsdom does not reliably expose `localStorage` in this environment, but the
  // Pomodoro store and connectPomodoro rely on it. Provide a deterministic
  // in-memory implementation so tests (and preview mode) work offline.
  if (!window.localStorage || typeof window.localStorage.clear !== 'function') {
    const store = new Map<string, string>();
    const localStorageStub = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
    Object.defineProperty(window, 'localStorage', {
      value: localStorageStub,
      configurable: true,
      writable: true,
    });
  }

  // jsdom does not implement matchMedia; required by useThemeStore.
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
      configurable: true,
      writable: true,
    });
  }

  // jsdom does not implement the Clipboard API; provide a minimal stub so
  // components that call navigator.clipboard.writeText work in tests.
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
      configurable: true,
      writable: true,
    });
  }
}
