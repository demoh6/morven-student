import type { ReactNode } from 'react';
import { useImageResource } from '@/hooks/useImageResource';

type CachedImageProps = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Rendered when the image is unavailable (or absent). */
  fallback: ReactNode;
};

/**
 * An <img> that survives transient load failures and works offline from the
 * account-scoped image cache. Renders `fallback` only when the image is
 * genuinely unavailable, never on a momentary network hiccup.
 */
export function CachedImage({ src, alt, className, fallback }: CachedImageProps) {
  const { src: resolved, fallback: useFallback, reloadKey, onLoad, onError } =
    useImageResource(src);

  if (!resolved || useFallback) return <>{fallback}</>;

  return (
    <img
      key={reloadKey}
      src={resolved}
      alt={alt}
      className={className}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
