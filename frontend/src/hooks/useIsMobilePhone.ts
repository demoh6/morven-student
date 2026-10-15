import { useEffect, useState } from 'react';

/**
 * Exactly the phone range: matches Tailwind's `max-sm` variant
 * (`@media (max-width: 639px)`). Tablets (>= 640px) and desktops are
 * intentionally excluded so they keep their existing layouts untouched.
 */
export const MOBILE_PHONE_QUERY = '(max-width: 639px)';

function getMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(MOBILE_PHONE_QUERY).matches;
}

/**
 * Reactively reports whether the viewport is a phone. Uses `matchMedia` so the
 * value is correct on the very first render (no resize flash) and updates live
 * when the viewport crosses the phone/tablet boundary.
 */
export function useIsMobilePhone(): boolean {
  const [isMobilePhone, setIsMobilePhone] = useState(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(MOBILE_PHONE_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsMobilePhone(event.matches);

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }

    // Older Safari fallback.
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  return isMobilePhone;
}
