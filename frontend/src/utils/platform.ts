/**
 * Client-side device classification.
 *
 * Dependency-free and safe to call when browser APIs are missing (guards
 * `navigator`/`window`, never throws). Device classification is kept separate
 * from display-mode detection: a device type never implies an installed app,
 * and `isStandalone()` is independent of `platform`.
 *
 * Intentionally does NOT use screen width, viewport size, orientation or
 * touch support alone to identify an Apple device.
 */

export type Platform =
  | 'iphone'
  | 'ipad'
  | 'android'
  | 'windows'
  | 'macos'
  | 'linux'
  | 'unknown';

export interface PlatformHints {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  userAgentDataPlatform?: string | null;
}

export interface PlatformInfo {
  platform: Platform;
  isIPhone: boolean;
  isIPad: boolean;
  /** iPhone or iPad. */
  isAppleMobile: boolean;
  isAndroid: boolean;
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
  /** Windows, macOS or Linux desktop. */
  isDesktop: boolean;
  /** Running installed (standalone display mode), not in a normal browser tab. */
  isStandalone: boolean;
}

function toLower(value: string | null | undefined): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/**
 * Pure classification from explicit hints so it can be unit-tested without a
 * real browser environment.
 */
export function detectPlatformFrom(hints: PlatformHints): Platform {
  const ua = toLower(hints.userAgent);
  const platform = toLower(hints.platform);
  const uaData = toLower(hints.userAgentDataPlatform);
  const maxTouchPoints = typeof hints.maxTouchPoints === 'number' ? hints.maxTouchPoints : 0;

  // iPadOS 13+ may report a desktop-class macOS user agent. The reliable tell
  // is a Mac platform string combined with touch input (more than one touch
  // point); no current Mac reports multiple touch points.
  const isIPadOSDesktopUA =
    (platform === 'macintel' || platform === 'macppc') && maxTouchPoints > 1;
  if (isIPadOSDesktopUA || /ipad/.test(ua) || platform === 'ipad' || uaData === 'ipados') {
    return 'ipad';
  }

  // iPod touch user agents contain "CPU iPhone OS"; check this before iPhone
  // so it is not misclassified. iPods are outside the supported set → unknown.
  if (/ipod/.test(ua) || platform === 'ipod') {
    return 'unknown';
  }

  if (/iphone/.test(ua) || platform === 'iphone' || uaData === 'ios') {
    return 'iphone';
  }

  if (/android/.test(ua) || /android/.test(platform) || uaData === 'android') {
    return 'android';
  }

  if (/windows|win32|win64|wince/.test(platform) || /windows/.test(ua) || uaData === 'windows') {
    return 'windows';
  }

  if (/mac/.test(platform) || /macintosh|mac os x/.test(ua) || uaData === 'macos') {
    return 'macos';
  }

  if (/linux|x11/.test(platform) || /linux/.test(ua) || uaData === 'linux') {
    return 'linux';
  }

  return 'unknown';
}

function readHints(): PlatformHints {
  const empty: PlatformHints = {
    userAgent: '',
    platform: '',
    maxTouchPoints: 0,
    userAgentDataPlatform: null,
  };
  if (typeof navigator === 'undefined') return empty;
  try {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    return {
      userAgent: typeof nav.userAgent === 'string' ? nav.userAgent : '',
      platform: typeof nav.platform === 'string' ? nav.platform : '',
      maxTouchPoints: typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0,
      userAgentDataPlatform: nav.userAgentData?.platform ?? null,
    };
  } catch {
    return empty;
  }
}

export function getPlatform(): Platform {
  return detectPlatformFrom(readHints());
}

/**
 * Whether the app is running installed (standalone display mode) rather than
 * in a normal browser tab. On iOS Safari this is `navigator.standalone`.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true;
  } catch {
    return false;
  }
}

export function getPlatformInfo(): PlatformInfo {
  const platform = getPlatform();
  return {
    platform,
    isIPhone: platform === 'iphone',
    isIPad: platform === 'ipad',
    isAppleMobile: platform === 'iphone' || platform === 'ipad',
    isAndroid: platform === 'android',
    isWindows: platform === 'windows',
    isMacOS: platform === 'macos',
    isLinux: platform === 'linux',
    isDesktop: platform === 'windows' || platform === 'macos' || platform === 'linux',
    isStandalone: isStandalone(),
  };
}
