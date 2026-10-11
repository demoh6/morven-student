import { useImageResource } from '@/hooks/useImageResource';

type AvatarProps = {
  src: string | null | undefined;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: 'w-8 h-8 text-xs rounded-full',
  md: 'w-9 h-9 text-sm rounded-full',
  lg: 'w-20 h-20 text-3xl rounded-full',
};

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const {
    src: resolved,
    fallback: useFallback,
    reloadKey,
    onLoad,
    onError,
  } = useImageResource(src);
  const fallback = name?.charAt(0) || 'م';
  const classes = `bg-gradient-to-br from-primary-500 to-emerald-500 text-white shadow-md flex items-center justify-center font-bold shrink-0 ${sizeClasses[size]} ${className}`;

  if (resolved && !useFallback) {
    return (
      <img
        key={reloadKey}
        src={resolved}
        alt={name}
        className={`object-cover shrink-0 ${sizeClasses[size]} ${className}`}
        onLoad={onLoad}
        onError={onError}
      />
    );
  }

  return <div className={classes}>{fallback}</div>;
}
