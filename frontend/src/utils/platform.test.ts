import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  detectPlatformFrom,
  getPlatformInfo,
  isStandalone,
  type PlatformHints,
} from './platform';

const base: PlatformHints = { userAgent: '', platform: '', maxTouchPoints: 0 };

function withHints(overrides: Partial<PlatformHints>): PlatformHints {
  return { ...base, ...overrides };
}

describe('detectPlatformFrom', () => {
  it('detects iPhone', () => {
    expect(
      detectPlatformFrom(
        withHints({
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
          platform: 'iPhone',
          maxTouchPoints: 5,
        }),
      ),
    ).toBe('iphone');
  });

  it('detects iPad from the classic iPad user agent', () => {
    expect(
      detectPlatformFrom(
        withHints({
          userAgent: 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15',
          platform: 'iPad',
          maxTouchPoints: 5,
        }),
      ),
    ).toBe('ipad');
  });

  it('detects an iPadOS desktop-style user agent as iPad, not macOS', () => {
    expect(
      detectPlatformFrom(
        withHints({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 5,
        }),
      ),
    ).toBe('ipad');
  });

  it('treats a real Mac (no touch input) as macOS', () => {
    expect(
      detectPlatformFrom(
        withHints({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          platform: 'MacIntel',
          maxTouchPoints: 0,
        }),
      ),
    ).toBe('macos');
  });

  it('detects Android phones and tablets', () => {
    const phone =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';
    const tablet =
      'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/124 Safari/537.36';
    expect(
      detectPlatformFrom(withHints({ userAgent: phone, platform: 'Linux armv8l' })),
    ).toBe('android');
    expect(
      detectPlatformFrom(withHints({ userAgent: tablet, platform: 'Linux armv8l' })),
    ).toBe('android');
  });

  it('detects Windows', () => {
    expect(
      detectPlatformFrom(
        withHints({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          platform: 'Win32',
        }),
      ),
    ).toBe('windows');
  });

  it('detects Linux', () => {
    expect(
      detectPlatformFrom(
        withHints({
          userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
          platform: 'Linux x86_64',
        }),
      ),
    ).toBe('linux');
  });

  it('classifies iPod touch as unknown, never as iPhone', () => {
    expect(
      detectPlatformFrom(
        withHints({
          userAgent:
            'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
          platform: 'iPod',
          maxTouchPoints: 5,
        }),
      ),
    ).toBe('unknown');
  });

  it('falls back to unknown with no usable signals', () => {
    expect(detectPlatformFrom(base)).toBe('unknown');
  });

  it('uses userAgentData platform when the user agent is reduced', () => {
    expect(
      detectPlatformFrom(
        withHints({ userAgent: 'Mozilla/5.0', userAgentDataPlatform: 'Windows' }),
      ),
    ).toBe('windows');
    expect(
      detectPlatformFrom(
        withHints({ userAgent: 'Mozilla/5.0', userAgentDataPlatform: 'Android' }),
      ),
    ).toBe('android');
    expect(
      detectPlatformFrom(
        withHints({ userAgent: 'Mozilla/5.0', userAgentDataPlatform: 'macOS' }),
      ),
    ).toBe('macos');
  });

  it('does not throw when every hint is absent or malformed', () => {
    expect(() =>
      detectPlatformFrom({
        userAgent: undefined as unknown as string,
        platform: null as unknown as string,
        maxTouchPoints: undefined as unknown as number,
      }),
    ).not.toThrow();
  });
});

describe('getPlatformInfo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('flags iPhone as Apple mobile and not desktop', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    const info = getPlatformInfo();
    expect(info.platform).toBe('iphone');
    expect(info.isIPhone).toBe(true);
    expect(info.isAppleMobile).toBe(true);
    expect(info.isDesktop).toBe(false);
  });

  it('flags Windows as desktop and not Apple mobile', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      platform: 'Win32',
      maxTouchPoints: 0,
    });
    const info = getPlatformInfo();
    expect(info.platform).toBe('windows');
    expect(info.isWindows).toBe(true);
    expect(info.isAppleMobile).toBe(false);
    expect(info.isDesktop).toBe(true);
  });
});

describe('isStandalone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubMatchMedia(matches: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: matches && query.includes('display-mode: standalone'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  }

  it('is true when display-mode: standalone matches', () => {
    stubMatchMedia(true);
    expect(isStandalone()).toBe(true);
  });

  it('is false in a normal browser tab', () => {
    stubMatchMedia(false);
    expect(isStandalone()).toBe(false);
  });
});
