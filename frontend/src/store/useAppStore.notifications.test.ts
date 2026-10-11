import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { NETWORK_ERROR_MESSAGE } from '@/services/apiError';

describe('useAppStore.addNotification — message normalisation', () => {
  beforeEach(() => {
    useAppStore.setState({ notifications: [] });
  });

  it('replaces a raw connectivity string with the Arabic network message', () => {
    useAppStore.getState().addNotification('Failed to fetch', 'error');
    expect(useAppStore.getState().notifications[0].message).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('keeps a meaningful (e.g. server validation) message unchanged', () => {
    useAppStore.getState().addNotification('تم الحفظ بنجاح', 'success');
    expect(useAppStore.getState().notifications[0].message).toBe('تم الحفظ بنجاح');
  });
});
