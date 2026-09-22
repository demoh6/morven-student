/**
 * Prayer Pause full-screen overlay.
 *
 * Pure presentation over the existing Phase 3 state machine: it renders only
 * when the store reports ACTIVE or RETURNING, reads `remainingMs` from
 * usePrayerPause() (no second timer), and portals to document.body at the
 * OVERLAY_Z_INDEX tier above every other Morven layer.
 *
 * Blocking contract while visible (ACTIVE and RETURNING):
 *  - covers the viewport and swallows pointer/wheel/touch interaction
 *    (top-most fixed layer; window/document-level listeners shielded)
 *  - document-level capture listeners stop keyboard interaction with the app
 *    beneath, including Tab focus escape (this pause has no dismissal control,
 *    so no accessible close/escape path exists by design)
 *  - body scroll is locked and restored afterwards
 *  - focus moves into the overlay on entry and returns to the exact
 *    previously-focused element on release
 *
 * Transition handoff (ACTIVE -> RETURNING -> NORMAL): entering RETURNING
 * dims the overlay and scales down the card while the returning message
 * fades in; when that composition completes, the overlay itself calls the
 * guarded returnToNormal() action and AnimatePresence fades everything out.
 * The scheduler's relative-time fallback stays armed as a safety net, so the
 * overlay can never get stuck and NORMAL can never be reached early.
 */

import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { OVERLAY_Z_INDEX } from './config';
import { PRAYER_ARABIC_NAMES } from './prayerNames';
import { usePrayerPauseStore } from './prayerPauseStore';
import { usePrayerPause } from './usePrayerPause';

const HEADING = 'حان وقت الصلاة ';
const VERSE = 'إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَوْقُوتًا';
const SUPPORTING_TEXT = 'اذهب إلى صلاتك، فالصلاة أولى.';
const RETURNING_TEXT = 'عودة آمنة إلى مورفن';
const COUNTDOWN_LABEL = 'الوقت المتبقي';

const countdownFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/**
 * mm:ss in Western digits; window can never exceed 5 minutes.
 * Defense in depth: the store rejects malformed windows at its boundary, so
 * non-finite input is unreachable in normal operation — but this component
 * mounts at the app root and must never crash the whole application because
 * of an invalid countdown value.
 */
function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms)) return '00:00';
  return countdownFormatter.format(new Date(Math.max(0, ms)));
}

export function PrayerPauseOverlay() {
  const { isActive, isReturning, activePrayerId, activeStart, activeEnd, remainingMs } =
    usePrayerPause();
  const visible = isActive || isReturning;

  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  /* ── Modal blocking behaviors ─────────────────────────────────────────── */

  useEffect(() => {
    if (!visible) return;

    const overlayEl = containerRef.current;
    if (!overlayEl) return;

    // Remember where the student was so focus can be restored safely on
    // release without disturbing their application context.
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus enters the overlay immediately; Tab cannot reach the application
    // beneath because every key event originating outside the overlay (and
    // Tab everywhere) is stopped in the capture phase.
    overlayEl.focus({ preventScroll: true });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Blanket capture-phase blocking: nothing inside the overlay needs a
    // keyboard, so stopping every key (Tab included) both freezes the app
    // underneath and pins focus inside the modal layer.
    const blockKey = (event: KeyboardEvent) => {
      const node = event.target instanceof Node ? event.target : null;
      if (node && overlayEl.contains(node) && event.key !== 'Tab') return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    document.addEventListener('keydown', blockKey, true);
    document.addEventListener('keyup', blockKey, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', blockKey, true);
      document.removeEventListener('keyup', blockKey, true);
      // Restore focus to the exact element the student came from (standard
      // accessible-modal behavior); fall back to a plain blur otherwise.
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        overlayEl.contains(active)
      ) {
        if (previousFocus && previousFocus.isConnected) {
          previousFocus.focus({ preventScroll: true });
        } else {
          active.blur();
        }
      }
    };
  }, [visible]);

  /* ── Countdown geometry ───────────────────────────────────────────────── */

  const totalMs =
    activeStart !== null &&
    activeEnd !== null &&
    Number.isFinite(activeStart) &&
    Number.isFinite(activeEnd)
      ? Math.max(1, activeEnd - activeStart)
      : 1;
  const progress = isActive ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;

  const RADIUS = 44;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const countdownText = useMemo(() => formatRemaining(remainingMs), [remainingMs]);

  const entranceTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.45, ease: 'easeOut' as const };

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          data-prayer-pause-overlay=""
          ref={containerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={HEADING}
          dir="rtl"
          className="fixed inset-0 flex items-center justify-center overflow-hidden overscroll-contain bg-gradient-to-b from-white via-primary-50 to-primary-100 text-gray-900 outline-none dark:from-dark-bg dark:via-primary-900/30 dark:to-black dark:text-gray-100 select-none"
          style={{ zIndex: OVERLAY_Z_INDEX, touchAction: 'none' }}
          // Shield window/document-level wheel & touch listeners from events
          // over the overlay. React attaches these passively, so only
          // propagation is stopped; default scrolling is already impossible
          // (body locked, overlay itself never scrolls).
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          initial={{ opacity: 0 }}
          animate={{ opacity: isReturning ? 0.85 : 1 }}
          exit={{ opacity: 0 }}
          transition={entranceTransition}
        >
          {/* Calm ambient glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                'radial-gradient(circle at 50% 38%, rgba(4, 120, 81, 0.14) 0%, rgba(4, 120, 81, 0) 55%)',
            }}
          />

          <motion.div
            data-prayer-pause-card=""
            className="relative mx-4 w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-3xl border border-light-border/80 dark:border-dark-border bg-white/85 dark:bg-dark-card/90 shadow-elevated backdrop-blur-md px-6 py-8 sm:px-10 sm:py-10 text-center"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={{
              opacity: 1,
              scale: isReturning ? 0.97 : 1,
              transition: entranceTransition,
            }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, transition: { duration: 0.3 } }}
          >
            {/* Ornamental divider */}
            <div aria-hidden="true" className="mx-auto mb-6 flex w-24 items-center gap-2">
              <span className="h-px flex-1 bg-primary-200 dark:bg-primary-700" />
              <span className="h-1.5 w-1.5 rotate-45 bg-primary-400 dark:bg-primary-500" />
              <span className="h-px flex-1 bg-primary-200 dark:bg-primary-700" />
            </div>

            <h1 data-prayer-pause-heading="" className="text-2xl sm:text-3xl font-bold">{HEADING}</h1>

            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">حسب التوقيت المحلي لدولة فلسطين</p>

            {activePrayerId && (
              <p
                data-prayer-pause-prayer=""
                className="mt-3 inline-flex items-center rounded-full bg-primary-50 dark:bg-primary-900/40 px-4 py-1 text-sm font-semibold text-primary-700 dark:text-primary-200 ring-1 ring-inset ring-primary-200 dark:ring-primary-800"
              >
                صلاة {PRAYER_ARABIC_NAMES[activePrayerId]}
              </p>
            )}

            {/* Quran verse */}
            <figure className="mt-7">
              <blockquote className="text-base sm:text-lg leading-loose text-gray-700 dark:text-gray-300">
                ﴿ {VERSE} ﴾
              </blockquote>
              <figcaption className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                سورة النساء - الآية 103
              </figcaption>
            </figure>

            <p className="mt-5 text-sm sm:text-base text-gray-500 dark:text-gray-400">
              {SUPPORTING_TEXT}
            </p>

            {/* Countdown / returning hint swap */}
            <div className="mt-8 flex justify-center">
              <AnimatePresence mode="wait" initial={false}>
                {isActive ? (
                  <motion.div
                    key="countdown"
                    className="flex flex-col items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: entranceTransition }}
                    exit={{ opacity: 0, transition: { duration: 0.25 } }}
                  >
                    <div className="relative h-28 w-28 sm:h-32 sm:w-32" aria-hidden="true">
                      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                        <circle
                          cx="50"
                          cy="50"
                          r={RADIUS}
                          fill="none"
                          strokeWidth="6"
                          className="stroke-gray-200 dark:stroke-dark-border"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r={RADIUS}
                          fill="none"
                          strokeWidth="6"
                          strokeLinecap="round"
                          className="stroke-primary-500 transition-[stroke-dashoffset] duration-300 ease-linear"
                          strokeDasharray={CIRCUMFERENCE}
                          strokeDashoffset={(1 - progress) * CIRCUMFERENCE}
                        />
                      </svg>
                      <span data-prayer-countdown="" className="absolute inset-0 grid place-items-center font-semibold tabular-nums text-xl">
                        {countdownText}
                      </span>
                    </div>
                    <span className="mt-2.5 text-xs text-gray-400 dark:text-gray-500">
                      {COUNTDOWN_LABEL}
                    </span>
                  </motion.div>
                ) : (
                  <motion.p
                    key="returning"
                    data-prayer-returning=""
                    className="text-sm text-primary-600 dark:text-primary-300"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: reducedMotion ? 0 : 0.5 } }}
                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                    onAnimationComplete={() => {
                      // Clean handoff: the returning composition has finished
                      // (dim + scale-down + message fade-in), so release the
                      // app back to NORMAL. The store action is guarded to
                      // 'returning' only, so this can never fire early, and
                      // the scheduler's fallback remains as a safety net.
                      usePrayerPauseStore.getState().returnToNormal();
                    }}
                  >
                    {RETURNING_TEXT}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
