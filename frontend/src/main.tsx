import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// When a new Service Worker activates and claims open tabs (via skipWaiting +
// clientsClaim), the page may still hold a stale index.html that references
// old hashed chunk filenames. Those chunks no longer exist on the server after
// a new build, so Vercel's SPA catch-all rewrite returns index.html with
// Content-Type: text/html for the missing .js request — causing the MIME type
// error.  Listening for `controllerchange` and forcing a full reload ensures
// the fresh index.html (with correct chunk references) is loaded.
let isRefreshing = false;
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (!isRefreshing) {
    isRefreshing = true;
    window.location.reload();
  }
});

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
