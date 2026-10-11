import { useEffect } from 'react';
import { useAuthStore } from '@/pages/auth/useAuthStore';

/** Matches the static splash markup rendered in index.html. */
export const SPLASH_ELEMENT_ID = 'morven-splash';
/** Class that fades the static splash out before it is removed from the DOM. */
export const SPLASH_HIDDEN_CLASS = 'morven-splash--hidden';
/** Scroll-lock class applied to <html> by the early bootstrap script. */
export const SPLASHING_CLASS = 'morven-splashing';

/**
 * Reveal the application by fading out and removing the static launch splash.
 *
 * Safe to call at any time and idempotent per element: if the splash is not in
 * the DOM (already removed, or this is a non-browser environment) it only
 * releases the scroll lock. The element is removed via `transitionend`, with a
 * timeout fallback so a missing/slow transition can never strand the splash
 * above the app.
 */
export function hideSplash(): void {
  if (typeof document === 'undefined') return;

  document.documentElement.classList.remove(SPLASHING_CLASS);

  const el = document.getElementById(SPLASH_ELEMENT_ID);
  if (!el || el.dataset.hiding === 'true') return;

  el.dataset.hiding = 'true';
  el.classList.add(SPLASH_HIDDEN_CLASS);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    el.remove();
  };

  el.addEventListener('transitionend', remove, { once: true });
  window.setTimeout(remove, 600);
}

/**
 * Headless component that drives the splash lifecycle. The app is considered
 * ready to render its interface as soon as authentication restoration has
 * resolved (`initialized`), which is the app's essential startup task. Errors
 * during restoration are handled inside the auth store and still resolve
 * `initialized`, so the splash is never left up indefinitely; the inline
 * timeout in index.html additionally covers a bundle that fails to load.
 */
export function SplashController(): null {
  const initialized = useAuthStore((s) => s.initialized);

  useEffect(() => {
    if (initialized) hideSplash();
  }, [initialized]);

  return null;
}
