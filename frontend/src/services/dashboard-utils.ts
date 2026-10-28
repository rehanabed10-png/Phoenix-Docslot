import type { AppointmentResponse } from '../types/appointment';

/**
 * Categorizes and sorts appointments into upcoming vs past buckets.
 */
export function filterAppointments(
  appointments: AppointmentResponse[],
  referenceDate: Date = new Date(),
) {
  if (!Array.isArray(appointments)) {
    return { upcoming: [], past: [] };
  }

  const now = referenceDate.getTime();
  const upcoming: AppointmentResponse[] = [];
  const past: AppointmentResponse[] = [];

  for (const app of appointments) {
    const endAtTime = new Date(app.endAt).getTime();
    const isBooked = app.status === 'BOOKED';

    if (isBooked && endAtTime > now) {
      upcoming.push(app);
    } else {
      past.push(app);
    }
  }

  // Upcoming in chronological order (earliest start first)
  upcoming.sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  // Past in reverse chronological order (most recent first)
  past.sort(
    (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
  );

  return { upcoming, past };
}

/**
 * Formats an ISO date into human-readable format (e.g., "Tue, Oct 28, 2026").
 */
export function formatAppointmentDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * Formats ISO timestamps to a 12h time range (e.g., "9:00 AM – 9:30 AM").
 */
export function formatAppointmentTimeRange(startIso: string, endIso: string): string {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return '';
    }
    const formatTime = (d: Date) => {
      const h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${m} ${period}`;
    };
    return `${formatTime(start)} – ${formatTime(end)}`;
  } catch {
    return '';
  }
}
