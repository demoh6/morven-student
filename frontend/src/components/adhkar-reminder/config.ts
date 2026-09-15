/**
 * Central configuration for the Adhkar Reminder feature.
 *
 * The reminder is deliberately NON-BLOCKING: two small corner cards (morning
 * after 10:00 AM, evening after 5:00 PM local time) that never lock, blur,
 * freeze, or steal focus from the rest of Morven. Everything here stays well
 * below the Prayer Pause overlay tier so the blocking prayer flow is untouched.
 */

/** Morning Adhkar reminder trigger hour in the user's LOCAL time. */
export const MORNING_TRIGGER_HOUR = 10;

/** Evening Adhkar reminder trigger hour in the user's LOCAL time. */
export const EVENING_TRIGGER_HOUR = 17;

/**
 * Stacking tier for the reminder cards (fixed-positioned containers).
 * Highest existing layers in Morven:
 *   prayer pause overlay z-[9999]  >  notifications z-[100]  >  modals
 *   / sidebar panel z-50. The reminder must stay below the prayer overlay
 *   (never covers the blocking pause) and above the navigation / content.
 */
export const ADHKAR_REMINDER_Z_INDEX = 200;
