import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { MAINTENANCE_MODE, disablePwaCaching } from './config/maintenance';

// TEMPORARY: the Morven backend is currently unavailable because of a hosting
// subscription issue. While `MAINTENANCE_MODE` is `true` the application never
// mounts — only the static maintenance page. The router, auth bootstrap,
// session manager, API client and Socket.IO client are imported lazily and only
// inside `startApp()`, so nothing reaches for the backend and the page renders
// with the API offline.

// When a new Service Worker activates and claims open tabs (via skipWaiting +
// clientsClaim), the page may still hold a stale index.html that references
// old hashed chunk filenames. Those chunks no longer exist on the server after
// a new build, so Vercel's SPA catch-all rewrite returns index.html with
// Content-Type: text/html for the missing .js request — causing the MIME type
// error.  Listening for `controllerchange` and forcing a full reload ensures
// the fresh index.html (with correct chunk references) is loaded.
//
// This runs in maintenance mode too: a visitor who first lands on a cached
// pre-maintenance build gets force-updated onto the maintenance page.
function watchServiceWorkerUpdates(): void {
  if (!('serviceWorker' in navigator)) return;

  let isRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!isRefreshing) {
      isRefreshing = true;
      window.location.reload();
    }
  });
}

async function startServiceWorker(): Promise<void> {
  watchServiceWorkerUpdates();

  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}

async function startMaintenanceMode(): Promise<void> {
  const [{ MaintenancePage }, { useThemeStore }] = await Promise.all([
    import('./pages/MaintenancePage'),
    import('./store/useThemeStore'),
  ]);

  const theme = useThemeStore.getState().theme;
  document.documentElement.classList.add(theme);
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MaintenancePage />
    </React.StrictMode>,
  );

  // Drop the service worker and precache of the last pre-maintenance build so no
  // cached app can be served on navigation, then let this build install its own.
  await disablePwaCaching();
  void startServiceWorker();
}

async function startApp(): Promise<void> {
  void startServiceWorker();

  const { default: App } = await import('./App');

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

if (MAINTENANCE_MODE) {
  void startMaintenanceMode();
} else {
  void startApp();
}
