import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminApiError,
  createDoctor,
  getAdminAppointments,
  getAdminDoctors,
  getAdminOverview,
  getAdminPatients,
  toggleDoctorStatus,
  updateDoctor,
} from '../admin-api';

describe('Admin API Service', () => {
  const mockToken = 'mock-admin-bearer-token';
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getAdminOverview', () => {
    it('fetches real clinic overview statistics with authorization header', async () => {
      const mockOverview = {
        totalActiveDoctors: 5,
        totalPatients: 40,
        totalAppointments: 100,
        todayAppointments: 6,
        appointmentStats: { booked: 30, completed: 60, cancelled: 8, noShow: 2 },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockOverview,
      } as Response);

      const result = await getAdminOverview(mockToken);

      expect(result).toEqual(mockOverview);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/overview'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        }),
      );
    });

    it('throws AdminApiError with 403 when user lacks admin privileges', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Forbidden' }),
      } as Response);

      await expect(getAdminOverview(mockToken)).rejects.toThrow(AdminApiError);
    });
  });

  describe('getAdminDoctors', () => {
    it('appends search and status query parameters correctly', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], meta: { total: 0 } }),
      } as Response);

      await getAdminDoctors(mockToken, {
        search: 'Sarah',
        status: 'active',
        page: 2,
        limit: 10,
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/admin\/doctors\?search=Sarah&status=active&page=2&limit=10/),
        expect.any(Object),
      );
    });
  });

  describe('createDoctor', () => {
    it('sends POST /admin/doctors with payload and returns result', async () => {
      const payload = {
        email: 'dr.new@phoenixdocslot.demo',
        fullName: 'Dr. New Doc',
        specialty: 'Cardiology',
      };

      const mockResponse = {
        doctor: { id: 'd-1', fullName: 'Dr. New Doc' },
        accountSetup: { method: 'invited', message: 'Invite sent' },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await createDoctor(mockToken, payload);

      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/doctors'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    });

    it('translates 409 conflict error cleanly', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          message: 'A doctor account with this email already exists.',
        }),
      } as Response);

      await expect(
        createDoctor(mockToken, {
          email: 'dup@example.com',
          fullName: 'Dr. Dup',
          specialty: 'Dermatology',
        }),
      ).rejects.toThrow('A doctor account with this email already exists.');
    });
  });

  describe('updateDoctor', () => {
    it('sends PATCH /admin/doctors/:id with updated fields', async () => {
      const payload = { specialty: 'Interventional Cardiology' };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'd-1', specialty: 'Interventional Cardiology' }),
      } as Response);

      const result = await updateDoctor(mockToken, 'd-1', payload);

      expect(result.specialty).toBe('Interventional Cardiology');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/doctors/d-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
      );
    });
  });

  describe('toggleDoctorStatus', () => {
    it('sends PATCH /admin/doctors/:id/status with { isActive }', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'd-1',
          fullName: 'Dr. Sarah',
          isAcceptingBookings: false,
          isActive: false,
          message: 'Deactivated successfully',
        }),
      } as Response);

      const result = await toggleDoctorStatus(mockToken, 'd-1', false);

      expect(result.isAcceptingBookings).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/doctors/d-1/status'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isActive: false }),
        }),
      );
    });
  });

  describe('getAdminAppointments & getAdminPatients', () => {
    it('fetches appointments with filters', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], meta: { total: 0 } }),
      } as Response);

      await getAdminAppointments(mockToken, { status: 'BOOKED', page: 1 });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/admin\/appointments\?status=BOOKED&page=1/),
        expect.any(Object),
      );
    });

    it('fetches patients directory with search', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], meta: { total: 0 } }),
      } as Response);

      await getAdminPatients(mockToken, { search: 'Alex' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/admin\/patients\?search=Alex/),
        expect.any(Object),
      );
    });
  });
});
