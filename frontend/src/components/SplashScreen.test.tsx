import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  hideSplash,
  SplashController,
  SPLASH_ELEMENT_ID,
  SPLASHING_CLASS,
} from '@/components/SplashScreen';
import { useAuthStore } from '@/pages/auth/useAuthStore';

function mountSplash(): HTMLElement {
  const el = document.createElement('div');
  el.id = SPLASH_ELEMENT_ID;
  document.body.appendChild(el);
  document.documentElement.classList.add(SPLASHING_CLASS);
  return el;
}

describe('splash screen lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.className = '';
    document.getElementById(SPLASH_ELEMENT_ID)?.remove();
    useAuthStore.setState({ user: null, loading: false, error: null, initialized: false });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.getElementById(SPLASH_ELEMENT_ID)?.remove();
    document.documentElement.className = '';
  });

  it('fades out, removes the splash and releases the scroll lock', () => {
    const el = mountSplash();

    hideSplash();

    expect(el.dataset.hiding).toBe('true');
    expect(document.documentElement.classList.contains(SPLASHING_CLASS)).toBe(false);

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(document.getElementById(SPLASH_ELEMENT_ID)).toBeNull();
  });

  it('is safe to call repeatedly and when no splash is present', () => {
    const el = mountSplash();

    hideSplash();
    hideSplash();
    hideSplash();

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(el.isConnected).toBe(false);

    expect(() => hideSplash()).not.toThrow();
  });

  it('keeps the splash visible while authentication is still initializing', () => {
    mountSplash();
    render(<SplashController />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(document.getElementById(SPLASH_ELEMENT_ID)).not.toBeNull();
  });

  it('hides the splash as soon as authentication initialization resolves', () => {
    mountSplash();
    render(<SplashController />);
    expect(document.getElementById(SPLASH_ELEMENT_ID)).not.toBeNull();

    act(() => {
      useAuthStore.setState({ initialized: true });
    });
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(document.getElementById(SPLASH_ELEMENT_ID)).toBeNull();
  });
});
