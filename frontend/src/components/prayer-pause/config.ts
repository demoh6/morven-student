/**
 * Central configuration for the Prayer Pause feature.
 *
 * Location: Jerusalem, Palestine.
 * All values here are the single source of truth for the prayer-time engine.
 * Tune these constants only; never modify engine logic to adjust timings.
 */

/** Jerusalem, Palestine */
export const JERUSALEM_COORDS = {
  latitude: 31.7683,
  longitude: 35.2137,
} as const;

/**
 * IANA timezone for Palestinian civil time.
 * Deliberately NOT 'Asia/Jerusalem' (Israeli rules diverge around Ramadan)
 * and never the user's device timezone. No hardcoded UTC offsets anywhere:
 * DST behavior comes from the runtime's IANA tz data via Intl.
 */
export const PRAYER_TIMEZONE = 'Asia/Hebron';

/** Prayer Pause duration after a prayer begins (end-exclusive). */
export const WINDOW_MINUTES = 5;

/**
 * Calculation configuration (Palestinian Ministry of Awqaf approximation):
 * Fajr 19.5°, Isha 17.5°, Asr shadow factor 1 (Shafi'i), Maghrib at sunset.
 */
export const PRAYER_CALCULATION: {
  fajrAngle: number;
  ishaAngle: number;
  /** 1 = Shafi'i (standard), 2 = Hanafi. */
  asrShadowFactor: 1 | 2;
} = {
  fajrAngle: 19.5,
  ishaAngle: 17.5,
  asrShadowFactor: 1,
};

/**
 * Display locale for prayer-time formatting (Arabic-first application).
 * `nu-latn` forces Western digits (0123456789) while keeping Arabic wording.
 */
export const DISPLAY_LOCALE = 'ar-EG-u-nu-latn';

/**
 * Stacking tier for the Prayer Pause overlay (rendered by Phase 5).
 *
 * The overlay must be portaled to document.body (same architecture as
 * UI/Modal.tsx) with this z-index so NO application surface can ever appear
 * above it. Highest existing layers in Morven:
 *   notifications z-[100]  >  sidebar panel / modals / tooltips z-50
 *   >  sidebar backdrop z-40  >  header z-30.
 * Keep this value strictly greater than any layer ever added to the app.
 */
export const OVERLAY_Z_INDEX = 9999;
