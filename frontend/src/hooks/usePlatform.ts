import { useMemo } from 'react';
import { getPlatformInfo, type PlatformInfo } from '@/utils/platform';

/**
 * Reads the client platform once per component mount. The platform cannot
 * change while the app is running, so the value is memoized.
 */
export function usePlatform(): PlatformInfo {
  return useMemo(() => getPlatformInfo(), []);
}
