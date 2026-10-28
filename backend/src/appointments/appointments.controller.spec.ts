import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentStatus, UserRole } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import type { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto.js';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  let mockAppointmentsService: {
    createAppointment: ReturnType<typeof vi.fn>;
    getMyAppointments: ReturnType<typeof vi.fn>;
    getTodayDoctorSchedule: ReturnType<typeof vi.fn>;
    getAppointmentById: ReturnType<typeof vi.fn>;
    updateAppointmentStatus: ReturnType<typeof vi.fn>;
    cancelAppointment: ReturnType<typeof vi.fn>;
    rescheduleAppointment: ReturnType<typeof vi.fn>;
  };

  const sampleDoctorId = '11111111-2222-3333-4444-555555555555';
  const sampleAppointmentId = '22222222-3333-4444-5555-666666666666';

  const doctorUser: AuthenticatedUser = {
    id: 'doctor-user-uuid',
    email: 'doc@example.com',
    fullName: 'Dr. Gregory House',
    role: UserRole.DOCTOR,
    isActive: true,
    doctorId: sampleDoctorId,
  };

  beforeEach(() => {
    mockAppointmentsService = {
      createAppointment: vi.fn(),
      getMyAppointments: vi.fn(),
      getTodayDoctorSchedule: vi.fn(),
      getAppointmentById: vi.fn(),
      updateAppointmentStatus: vi.fn(),
      cancelAppointment: vi.fn(),
      rescheduleAppointment: vi.fn(),
    };

    controller = new AppointmentsController(
      mockAppointmentsService as unknown as AppointmentsService,
    );
  });

  describe('getTodayDoctorSchedule', () => {
    it('delegates to appointmentsService.getTodayDoctorSchedule', async () => {
      mockAppointmentsService.getTodayDoctorSchedule.mockResolvedValueOnce([]);

      const result = await controller.getTodayDoctorSchedule(doctorUser, {
        page: 1,
        limit: 10,
      });

      expect(
        mockAppointmentsService.getTodayDoctorSchedule,
      ).toHaveBeenCalledWith(doctorUser, { page: 1, limit: 10 });
      expect(result).toEqual([]);
    });
  });

  describe('updateAppointmentStatus', () => {
    it('delegates to appointmentsService.updateAppointmentStatus', async () => {
      const dto: UpdateAppointmentStatusDto = {
        status: AppointmentStatus.COMPLETED,
      };

      mockAppointmentsService.updateAppointmentStatus.mockResolvedValueOnce({
        id: sampleAppointmentId,
        status: AppointmentStatus.COMPLETED,
      });

      const result = await controller.updateAppointmentStatus(
        doctorUser,
        sampleAppointmentId,
        dto,
      );

      expect(
        mockAppointmentsService.updateAppointmentStatus,
      ).toHaveBeenCalledWith(doctorUser, sampleAppointmentId, dto);
      expect(result.status).toBe(AppointmentStatus.COMPLETED);
    });
  });
});
