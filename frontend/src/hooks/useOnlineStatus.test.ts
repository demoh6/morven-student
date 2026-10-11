import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useOfflineNotice, OFFLINE_NOTICE_DURATION_MS } from './useOnlineStatus';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

function goOnline() {
  act(() => {
    setOnline(true);
    window.dispatchEvent(new Event('online'));
  });
}

function goOffline() {
  act(() => {
    setOnline(false);
    window.dispatchEvent(new Event('offline'));
  });
}

describe('useOfflineNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    setOnline(true);
  });

  it('stays hidden while online', () => {
    const { result } = renderHook(() => useOfflineNotice());
    expect(result.current).toBe(false);
  });

  it('shows while mounted offline and auto-dismisses after exactly 5 seconds', () => {
    setOnline(false);
    const { result } = renderHook(() => useOfflineNotice());
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(OFFLINE_NOTICE_DURATION_MS - 1));
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('shows on an offline transition and hides 5s later', () => {
    const { result } = renderHook(() => useOfflineNotice());
    expect(result.current).toBe(false);

    goOffline();
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(OFFLINE_NOTICE_DURATION_MS));
    expect(result.current).toBe(false);
  });

  it('restarts the timer on a repeated trigger instead of being dismissed early', () => {
    const { result } = renderHook(() => useOfflineNotice());

    goOffline();
    expect(result.current).toBe(true);

    // Four seconds into the first notice it is still visible.
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current).toBe(true);

    // Reconnect, then drop again: this is a fresh trigger.
    goOnline();
    expect(result.current).toBe(false);
    goOffline();
    expect(result.current).toBe(true);

    // Four seconds after the second trigger the notice must still be visible;
    // the first 5s timer must not have dismissed it.
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current).toBe(true);

    // The second trigger's own timer dismisses it a second later.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });
});
