import { describe, expect, it } from 'vitest';
import {
  filterAppointments,
  formatAppointmentDate,
  formatAppointmentTimeRange,
} from '../dashboard-utils';
import { isWithinTwoHours } from '../auth-session';
import type { AppointmentResponse } from '../../types/appointment';

describe('dashboard-utils', () => {
  const baseAppointment: AppointmentResponse = {
    id: 'apt-1',
    doctorId: 'doc-1',
    patientId: 'pat-1',
    startAt: '2026-11-20T10:00:00.000Z',
    endAt: '2026-11-20T10:30:00.000Z',
    status: 'BOOKED',
    reason: 'Routine checkup',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  describe('filterAppointments', () => {
    it('separates upcoming and past appointments correctly based on status and time', () => {
      const now = new Date('2026-11-20T12:00:00.000Z');

      const futureBooked: AppointmentResponse = {
        ...baseAppointment,
        id: 'future-booked',
        startAt: '2026-11-20T14:00:00.000Z',
        endAt: '2026-11-20T14:30:00.000Z',
        status: 'BOOKED',
      };

      const pastBooked: AppointmentResponse = {
        ...baseAppointment,
        id: 'past-booked',
        startAt: '2026-11-20T09:00:00.000Z',
        endAt: '2026-11-20T09:30:00.000Z',
        status: 'BOOKED',
      };

      const cancelled: AppointmentResponse = {
        ...baseAppointment,
        id: 'future-cancelled',
        startAt: '2026-11-20T16:00:00.000Z',
        endAt: '2026-11-20T16:30:00.000Z',
        status: 'CANCELLED',
      };

      const completed: AppointmentResponse = {
        ...baseAppointment,
        id: 'past-completed',
        startAt: '2026-11-19T10:00:00.000Z',
        endAt: '2026-11-19T10:30:00.000Z',
        status: 'COMPLETED',
      };

      const noShow: AppointmentResponse = {
        ...baseAppointment,
        id: 'past-noshow',
        startAt: '2026-11-18T10:00:00.000Z',
        endAt: '2026-11-18T10:30:00.000Z',
        status: 'NO_SHOW',
      };

      const { upcoming, past } = filterAppointments(
        [pastBooked, futureBooked, cancelled, completed, noShow],
        now,
      );

      expect(upcoming).toHaveLength(1);
      expect(upcoming[0].id).toBe('future-booked');

      expect(past).toHaveLength(4);
      const pastIds = past.map((a) => a.id);
      expect(pastIds).toContain('past-booked');
      expect(pastIds).toContain('future-cancelled');
      expect(pastIds).toContain('past-completed');
      expect(pastIds).toContain('past-noshow');
    });

    it('sorts upcoming appointments chronologically (earliest first)', () => {
      const now = new Date('2026-11-20T00:00:00.000Z');

      const later: AppointmentResponse = {
        ...baseAppointment,
        id: 'later',
        startAt: '2026-11-22T10:00:00.000Z',
        endAt: '2026-11-22T10:30:00.000Z',
        status: 'BOOKED',
      };

      const earlier: AppointmentResponse = {
        ...baseAppointment,
        id: 'earlier',
        startAt: '2026-11-21T10:00:00.000Z',
        endAt: '2026-11-21T10:30:00.000Z',
        status: 'BOOKED',
      };

      const { upcoming } = filterAppointments([later, earlier], now);

      expect(upcoming[0].id).toBe('earlier');
      expect(upcoming[1].id).toBe('later');
    });

    it('sorts past appointments reverse-chronologically (most recent first)', () => {
      const now = new Date('2026-11-25T00:00:00.000Z');

      const older: AppointmentResponse = {
        ...baseAppointment,
        id: 'older',
        startAt: '2026-11-10T10:00:00.000Z',
        endAt: '2026-11-10T10:30:00.000Z',
        status: 'COMPLETED',
      };

      const newer: AppointmentResponse = {
        ...baseAppointment,
        id: 'newer',
        startAt: '2026-11-20T10:00:00.000Z',
        endAt: '2026-11-20T10:30:00.000Z',
        status: 'COMPLETED',
      };

      const { past } = filterAppointments([older, newer], now);

      expect(past[0].id).toBe('newer');
      expect(past[1].id).toBe('older');
    });

    it('returns empty lists for empty inputs', () => {
      const { upcoming, past } = filterAppointments([]);
      expect(upcoming).toEqual([]);
      expect(past).toEqual([]);
    });
  });

  describe('isWithinTwoHours', () => {
    it('returns true when appointment start time is less than 2 hours away', () => {
      const now = new Date('2026-11-20T10:00:00.000Z');
      const startAt = '2026-11-20T11:30:00.000Z'; // 1.5 hours away
      expect(isWithinTwoHours(startAt, now)).toBe(true);
    });

    it('returns true when appointment start time is in the past', () => {
      const now = new Date('2026-11-20T12:00:00.000Z');
      const startAt = '2026-11-20T11:00:00.000Z'; // in past
      expect(isWithinTwoHours(startAt, now)).toBe(true);
    });

    it('returns false when appointment start time is more than 2 hours away', () => {
      const now = new Date('2026-11-20T08:00:00.000Z');
      const startAt = '2026-11-20T11:00:00.000Z'; // 3 hours away
      expect(isWithinTwoHours(startAt, now)).toBe(false);
    });
  });

  describe('formatAppointmentDate and formatAppointmentTimeRange', () => {
    it('formats appointment date into human readable string', () => {
      const formatted = formatAppointmentDate('2026-11-20T10:00:00.000Z');
      expect(formatted).toBeDefined();
      expect(formatted).toContain('2026');
      expect(formatted).toContain('Nov');
    });

    it('formats appointment time range cleanly', () => {
      const range = formatAppointmentTimeRange(
        '2026-11-20T10:00:00.000Z',
        '2026-11-20T10:30:00.000Z',
      );
      expect(range).toMatch(/[-–]/);
    });
  });
});
