/**
 * Clinic timezone configuration for Phoenix DocSlot.
 *
 * Weekly availability and availability exceptions store wall-clock values
 * (e.g. "09:00" to "17:00" on a given day).
 * This configuration isolates the clinic's local timezone (Asia/Kolkata)
 * so that future slot generation (Phase 4+) can deterministically map
 * local schedule intervals to UTC appointments without ambiguous conversions.
 */
export const DEFAULT_CLINIC_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_SLOT_DURATION = 30;

/**
 * Derives calendar date string (YYYY-MM-DD) in the clinic local timezone (Asia/Kolkata).
 */
export function getLocalDateStringInClinicTimezone(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
