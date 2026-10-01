/**
 * TEMPORARY site-wide maintenance mode.
 *
 * The Morven backend is unreachable because of a hosting subscription issue.
 * While `MAINTENANCE_MODE` is `true` the application never mounts: `main.tsx`
 * renders `<MaintenancePage />` instead of `<App />`, so no router, no auth
 * bootstrap, no API request and no Socket.IO connection is ever created. The
 * page is fully static and renders from the built assets alone, so it works
 * with the backend down.
 *
 * To bring the site back, set `MAINTENANCE_MODE` to `false` and redeploy.
 * Nothing else needs to change — no component, route, store or API is deleted.
 */

// Set to `false` to restore the normal Morven application.
export const MAINTENANCE_MODE = true;

// Official support address already published in `pages/PrivacyPolicyPage.tsx`.
export const MAINTENANCE_CONTACT_EMAIL = 'info@morven.online';

// Cache prefixes owned by this app (Workbox `cacheId: 'morven-student'`).
const APP_CACHE_PREFIXES = ['morven-student'];

/**
 * Detach any service worker installed by a previous (pre-maintenance) build and
 * drop its precache.
 *
 * Without this, a browser that already visited the site would keep serving the
 * old `index.html` and its hashed chunks from the precache on every navigation,
 * letting a cached build of the real app bypass the maintenance page.
 *
 * This is safe to run: `main.tsx` registers the service worker again right
 * afterwards, so once maintenance mode is turned off Workbox rebuilds the
 * precache from scratch.
 *
 * Best effort — the page never depends on it, only on the network.
 */
export async function disablePwaCaching(): Promise<void> {
  const unregister =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(registrations.map((registration) => registration.unregister())),
          )
          .catch(() => undefined)
      : Promise.resolve();

  const dropCaches =
    typeof caches === 'undefined'
      ? Promise.resolve()
      : caches
          .keys()
          .then((names) =>
            Promise.all(
              names
                .filter((name) => APP_CACHE_PREFIXES.some((p) => name.startsWith(p)))
                .map((name) => caches.delete(name)),
            ),
          )
          .catch(() => undefined);

  await Promise.all([unregister, dropCaches]);
}