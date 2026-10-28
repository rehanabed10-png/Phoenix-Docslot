import { describe, expect, it, vi } from 'vitest';
import {
  createAppointment,
  getAvailableSlots,
  getMyAppointments,
  getTodayDoctorSchedule,
  cancelAppointment,
  rescheduleAppointment,
  updateAppointmentStatus,
  getCurrentUserProfile,
  AppointmentApiError,
} from '../appointment-api';
import type {
  AppointmentResponse,
  CreateAppointmentRequest,
  SlotAvailabilityResponse,
} from '../../types/appointment';

describe('Appointment API Client', () => {
  const doctorId = '11111111-1111-4111-8111-111111111111';
  const testDate = '2026-11-20';

  describe('getAvailableSlots', () => {
    it('validates doctorId and date arguments', async () => {
      await expect(getAvailableSlots('', testDate)).rejects.toThrow(
        'Doctor ID is required',
      );
      await expect(getAvailableSlots(doctorId, '')).rejects.toThrow(
        'Date (YYYY-MM-DD) is required',
      );
    });

    it('fetches slots using correct path and parameters', async () => {
      const mockResponse: SlotAvailabilityResponse = {
        doctorId,
        date: testDate,
        timezone: 'Asia/Kolkata',
        slotDuration: 30,
        slots: [
          {
            startAt: '2026-11-20T03:30:00.000Z',
            endAt: '2026-11-20T04:00:00.000Z',
            startTime: '09:00',
            endTime: '09:30',
            available: true,
          },
          {
            startAt: '2026-11-20T04:00:00.000Z',
            endAt: '2026-11-20T04:30:00.000Z',
            startTime: '09:30',
            endTime: '10:00',
            available: false,
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as unknown as Response);

      const result = await getAvailableSlots(
        doctorId,
        testDate,
        mockFetch as unknown as typeof fetch,
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain(
        `/doctors/${doctorId}/availability/slots?date=${testDate}`,
      );
      expect(result.slots).toHaveLength(2);
      expect(result.slots[0].startTime).toBe('09:00');
      expect(result.slots[0].available).toBe(true);
      expect(result.slots[1].available).toBe(false);
    });

    it('handles server error responses gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          statusCode: 404,
          message: 'Doctor not found',
        }),
      } as unknown as Response);

      await expect(
        getAvailableSlots(doctorId, testDate, mockFetch as unknown as typeof fetch),
      ).rejects.toThrow(AppointmentApiError);
    });
  });

  describe('createAppointment', () => {
    const bookingRequest: CreateAppointmentRequest = {
      doctorId,
      startAt: '2026-11-20T03:30:00.000Z',
      endAt: '2026-11-20T04:00:00.000Z',
      reason: 'General checkup',
    };

    it('rejects booking when no authentication token is provided', async () => {
      await expect(
        createAppointment(bookingRequest, undefined, vi.fn() as unknown as typeof fetch),
      ).rejects.toThrow(/Authentication required/i);
    });

    it('submits booking successfully on 201 Created', async () => {
      const mockCreated: AppointmentResponse = {
        id: '99999999-9999-4999-8999-999999999999',
        patientId: '44444444-4444-4444-8444-444444444444',
        doctorId,
        startAt: bookingRequest.startAt,
        endAt: bookingRequest.endAt,
        status: 'BOOKED',
        reason: 'General checkup',
        cancellationReason: null,
        createdAt: '2026-10-28T02:00:00.000Z',
        updatedAt: '2026-10-28T02:00:00.000Z',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockCreated,
      } as unknown as Response);

      const result = await createAppointment(
        bookingRequest,
        'test-bearer-token',
        mockFetch as unknown as typeof fetch,
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/appointments');
      expect(options.method).toBe('POST');
      expect((options.headers as Record<string, string>).Authorization).toBe(
        'Bearer test-bearer-token',
      );
      expect(result.id).toBe(mockCreated.id);
      expect(result.status).toBe('BOOKED');
    });

    it('identifies 409 booking conflict correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          statusCode: 409,
          message: 'The selected doctor has a conflicting appointment.',
          error: 'Conflict',
        }),
      } as unknown as Response);

      try {
        await createAppointment(
          bookingRequest,
          'test-bearer-token',
          mockFetch as unknown as typeof fetch,
        );
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppointmentApiError);
        const apiErr = err as AppointmentApiError;
        expect(apiErr.isConflict()).toBe(true);
        expect(apiErr.status).toBe(409);
        expect(apiErr.message).toContain('no longer available');
      }
    });

    it('identifies 401 unauthorized session expiry', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          statusCode: 401,
          message: 'Invalid or expired authentication token.',
        }),
      } as unknown as Response);

      try {
        await createAppointment(
          bookingRequest,
          'expired-token',
          mockFetch as unknown as typeof fetch,
        );
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppointmentApiError);
        const apiErr = err as AppointmentApiError;
        expect(apiErr.isUnauthorized()).toBe(true);
        expect(apiErr.status).toBe(401);
      }
    });
  });

  describe('getMyAppointments', () => {
    it('rejects when no auth token is provided', async () => {
      await expect(
        getMyAppointments(undefined, undefined, vi.fn() as unknown as typeof fetch),
      ).rejects.toThrow(/Authentication required/i);
    });

    it('fetches appointments with query params and authorization header', async () => {
      const mockList: AppointmentResponse[] = [
        {
          id: 'apt-1',
          patientId: 'patient-1',
          doctorId,
          startAt: '2026-11-20T09:00:00.000Z',
          endAt: '2026-11-20T09:30:00.000Z',
          status: 'BOOKED',
          reason: 'Checkup',
          cancellationReason: null,
          createdAt: '2026-10-28T00:00:00.000Z',
          updatedAt: '2026-10-28T00:00:00.000Z',
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockList,
      } as unknown as Response);

      const result = await getMyAppointments(
        { page: 1, limit: 10, today: true, order: 'asc' },
        'test-token',
        mockFetch as unknown as typeof fetch,
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/appointments/mine?page=1&limit=10&today=true&order=asc');
      expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('apt-1');
    });
  });

  describe('getTodayDoctorSchedule', () => {
    it('rejects when no auth token is provided', async () => {
      await expect(
        getTodayDoctorSchedule(undefined, undefined, vi.fn() as unknown as typeof fetch),
      ).rejects.toThrow(/Authentication required/i);
    });

    it('identifies 403 forbidden error when called by non-doctor', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          statusCode: 403,
          message: 'Patients are not authorized to view doctor daily schedules.',
        }),
      } as unknown as Response);

      try {
        await getTodayDoctorSchedule(
          undefined,
          'patient-token',
          mockFetch as unknown as typeof fetch,
        );
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppointmentApiError);
        const apiErr = err as AppointmentApiError;
        expect(apiErr.isForbidden()).toBe(true);
        expect(apiErr.status).toBe(403);
        expect(apiErr.message).toContain('Patients are not authorized');
      }
    });
  });

  describe('cancelAppointment', () => {
    it('validates appointmentId argument', async () => {
      await expect(
        cancelAppointment('', undefined, 'test-token', vi.fn() as unknown as typeof fetch),
      ).rejects.toThrow('Appointment ID is required');
    });

    it('submits cancellation with cancellationReason', async () => {
      const mockCancelled: AppointmentResponse = {
        id: 'apt-to-cancel',
        patientId: 'patient-1',
        doctorId,
        startAt: '2026-11-20T14:00:00.000Z',
        endAt: '2026-11-20T14:30:00.000Z',
        status: 'CANCELLED',
        reason: 'Consultation',
        cancellationReason: 'Personal emergency',
        createdAt: '2026-10-28T00:00:00.000Z',
        updatedAt: '2026-10-28T01:00:00.000Z',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCancelled,
      } as unknown as Response);

      const res = await cancelAppointment(
        'apt-to-cancel',
        { cancellationReason: 'Personal emergency' },
        'test-token',
        mockFetch as unknown as typeof fetch,
      );

      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/appointments/apt-to-cancel/cancel');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body as string)).toEqual({ cancellationReason: 'Personal emergency' });
      expect(res.status).toBe('CANCELLED');
      expect(res.cancellationReason).toBe('Personal emergency');
    });

    it('preserves server 2-hour cutoff error message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          statusCode: 400,
          message: 'Appointments cannot be cancelled when less than two hours remain before the scheduled start time.',
        }),
      } as unknown as Response);

      try {
        await cancelAppointment('apt-cutoff', {}, 'test-token', mockFetch as unknown as typeof fetch);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppointmentApiError);
        const apiErr = err as AppointmentApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.message).toContain('less than two hours remain');
      }
    });
  });

  describe('rescheduleAppointment', () => {
    const rescheduleReq = {
      startAt: '2026-11-21T04:00:00.000Z',
      endAt: '2026-11-21T04:30:00.000Z',
      reason: 'Shifted schedule',
    };

    it('submits reschedule request to server', async () => {
      const mockRescheduled: AppointmentResponse = {
        id: 'apt-to-reschedule',
        patientId: 'patient-1',
        doctorId,
        startAt: rescheduleReq.startAt,
        endAt: rescheduleReq.endAt,
        status: 'BOOKED',
        reason: rescheduleReq.reason,
        cancellationReason: null,
        createdAt: '2026-10-28T00:00:00.000Z',
        updatedAt: '2026-10-28T01:00:00.000Z',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockRescheduled,
      } as unknown as Response);

      const res = await rescheduleAppointment(
        'apt-to-reschedule',
        rescheduleReq,
        'test-token',
        mockFetch as unknown as typeof fetch,
      );

      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/appointments/apt-to-reschedule/reschedule');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body as string)).toEqual(rescheduleReq);
      expect(res.startAt).toBe(rescheduleReq.startAt);
    });
  });

  describe('updateAppointmentStatus', () => {
    it('submits COMPLETED or NO_SHOW status update', async () => {
      const mockUpdated: AppointmentResponse = {
        id: 'apt-completed',
        patientId: 'patient-1',
        doctorId,
        startAt: '2026-10-28T03:30:00.000Z',
        endAt: '2026-10-28T04:00:00.000Z',
        status: 'COMPLETED',
        reason: 'Routine visit',
        cancellationReason: null,
        createdAt: '2026-10-28T00:00:00.000Z',
        updatedAt: '2026-10-28T04:05:00.000Z',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockUpdated,
      } as unknown as Response);

      const res = await updateAppointmentStatus(
        'apt-completed',
        { status: 'COMPLETED' },
        'doctor-token',
        mockFetch as unknown as typeof fetch,
      );

      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/appointments/apt-completed/status');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body as string)).toEqual({ status: 'COMPLETED' });
      expect(res.status).toBe('COMPLETED');
    });
  });

  describe('getCurrentUserProfile', () => {
    it('fetches authenticated user profile from /auth/me', async () => {
      const mockProfile = {
        id: 'user-uuid-1',
        email: 'alex.morgan@phoenixdocslot.demo',
        fullName: 'Alex Morgan',
        phone: '+91-9876543210',
        role: 'PATIENT' as const,
        isActive: true,
        doctorId: null,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockProfile,
      } as unknown as Response);

      const profile = await getCurrentUserProfile(
        'valid-user-token',
        mockFetch as unknown as typeof fetch,
      );

      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/auth/me');
      expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer valid-user-token');
      expect(profile.role).toBe('PATIENT');
      expect(profile.fullName).toBe('Alex Morgan');
    });
  });
});
