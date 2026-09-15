/**
 * Global host for the Adhkar Reminder feature.
 *
 * Mounted once beside the other global hosts (outside routes and layout), so
 * route changes never remount it and can never duplicate a reminder. It wires
 * the scheduler hook to the two non-blocking cards and connects the primary
 * action to the EXISTING Adhkar navigation/state mechanism:
 *
 *   - sets the Adhkar store's `currentCategory` to the morning/evening
 *     category (the existing route/state/category mechanism — no duplicate),
 *   - navigates to `/tool/adhkar`, whose period filtering shows the morning
 *     group at 10:00 and the evening group at 17:00 automatically.
 *
 * Both actions (open + skip) record the day's dismissal, so the reminder
 * never re-appears for the same slot on the same day.
 */

import { useNavigate } from 'react-router-dom';

import { useAdhkarStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarStore';
import { useAdhkarReminder } from './useAdhkarReminder';
import { useAdhkarReminderStore } from './adhkarReminderStore';
import { AdhkarReminderCard } from './AdhkarReminderCard';
import type { AdhkarReminderSlot } from './adhkarReminder';

export function AdhkarReminderHost() {
  const navigate = useNavigate();
  const { isMorningVisible, isEveningVisible } = useAdhkarReminder();

  const handleOpenAdhkar = (slot: AdhkarReminderSlot) => {
    // Reuse the existing Adhkar category state: the morning/evening category
    // auto-switches between morning and evening content from the device clock,
    // so the same category is correct for both reminder slots.
    useAdhkarStore.getState().setCategory('morning-evening');
    navigate('/tool/adhkar');
    useAdhkarReminderStore.getState().dismiss(slot);
  };

  const handleSkip = (slot: AdhkarReminderSlot) => {
    useAdhkarReminderStore.getState().dismiss(slot);
  };

  return (
    <>
      <AdhkarReminderCard
        slot="morning"
        visible={isMorningVisible}
        onOpenAdhkar={() => handleOpenAdhkar('morning')}
        onSkip={() => handleSkip('morning')}
      />
      <AdhkarReminderCard
        slot="evening"
        visible={isEveningVisible}
        onOpenAdhkar={() => handleOpenAdhkar('evening')}
        onSkip={() => handleSkip('evening')}
      />
    </>
  );
}