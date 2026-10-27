import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppointmentStatus,
  UserRole,
} from '../../generated/prisma/client.js';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppointmentsService } from './appointments.service.js';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let mockAvailability: {
    getAvailableSlots: ReturnType<typeof vi.fn>;
  };
  let mockPrisma: {
    appointment: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    doctorProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    userProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    auditLog: {
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  const patientUser: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'patient@example.com',
    fullName: 'Jane Patient',
    role: UserRole.PATIENT,
    isActive: true,
  };

  const doctorUser: AuthenticatedUser = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'doctor@hospital.org',
    fullName: 'Dr. Watson',
    role: UserRole.DOCTOR,
    isActive: true,
    doctorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  const adminUser: AuthenticatedUser = {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'admin@hospital.org',
    fullName: 'System Admin',
    role: UserRole.ADMIN,
    isActive: true,
  };

  const sampleDoctorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const sampleAppointmentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  // Future slot constants for deterministic test assertions
  const futureStart = '2026-11-20T03:30:00.000Z'; // 09:00 IST
  const futureEnd = '2026-11-20T04:00:00.000Z';   // 09:30 IST
  const newStart = '2026-11-20T04:30:00.000Z';    // 10:00 IST
  const newEnd = '2026-11-20T05:00:00.000Z';      // 10:30 IST

  beforeEach(() => {
    mockPrisma = {
      appointment: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      doctorProfile: {
        findUnique: vi.fn(),
      },
      userProfile: {
        findUnique: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn((callback: (tx: any) => Promise<any>) =>
        callback(mockPrisma),
      ),
    };

    mockAvailability = {
      getAvailableSlots: vi.fn().mockResolvedValue({
        slots: [
          {
            startAt: futureStart,
            endAt: futureEnd,
            startTime: '09:00',
            endTime: '09:30',
            available: true,
          },
          {
            startAt: newStart,
            endAt: newEnd,
            startTime: '10:00',
            endTime: '10:30',
            available: true,
          },
        ],
      }),
    };

    service = new AppointmentsService(
      mockPrisma as unknown as PrismaService,
      mockAvailability as unknown as AvailabilityService,
    );
  });

  describe('createAppointment', () => {
    it('forces patientId to currentUser.id when caller has PATIENT role', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
        isAcceptingBookings: true,
      });
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUser.id,
        isActive: true,
      });
      mockPrisma.appointment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.appointment.create.mockResolvedValueOnce({
        id: sampleAppointmentId,
        patientId: patientUser.id,
        doctorId: sampleDoctorId,
        startAt: new Date(futureStart),
        endAt: new Date(futureEnd),
        status: AppointmentStatus.BOOKED,
        reason: 'Regular consultation',
        cancellationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Passing a different patientId in payload to verify it is ignored
      const result = await service.createAppointment(patientUser, {
        doctorId: sampleDoctorId,
        startAt: futureStart,
        endAt: futureEnd,
        reason: 'Regular consultation',
        patientId: 'different-patient-uuid-attempt',
      });

      expect(result.patientId).toBe(patientUser.id);
      expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: patientUser.id,
          }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'APPOINTMENT_BOOKED',
            actorId: patientUser.id,
          }),
        }),
      );
    });

    it('allows ADMIN to specify a target patientId', async () => {
      const targetPatientId = '44444444-4444-4444-8444-444444444444';

      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
        isAcceptingBookings: true,
      });
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce({
        id: targetPatientId,
        isActive: true,
      });
      mockPrisma.appointment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.appointment.create.mockResolvedValueOnce({
        id: sampleAppointmentId,
        patientId: targetPatientId,
        doctorId: sampleDoctorId,
        startAt: new Date(futureStart),
        endAt: new Date(futureEnd),
        status: AppointmentStatus.BOOKED,
        reason: 'Admin booked',
        cancellationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createAppointment(adminUser, {
        doctorId: sampleDoctorId,
        startAt: futureStart,
        endAt: futureEnd,
        reason: 'Admin booked',
        patientId: targetPatientId,
      });

      expect(result.patientId).toBe(targetPatientId);
      expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: targetPatientId,
          }),
        }),
      );
    });

    it('rejects booking when endAt is not strictly after startAt', async () => {
      await expect(
        service.createAppointment(patientUser, {
          doctorId: sampleDoctorId,
          startAt: futureEnd,
          endAt: futureStart,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects booking when startAt is in the past', async () => {
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const pastEnd = new Date(Date.now() - 1800000).toISOString();

      await expect(
        service.createAppointment(patientUser, {
          doctorId: sampleDoctorId,
          startAt: pastStart,
          endAt: pastEnd,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects booking when doctor is not found', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createAppointment(patientUser, {
          doctorId: sampleDoctorId,
          startAt: futureStart,
          endAt: futureEnd,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects booking when doctor is not accepting bookings', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
        isAcceptingBookings: false,
      });

      await expect(
        service.createAppointment(patientUser, {
          doctorId: sampleDoctorId,
          startAt: futureStart,
          endAt: futureEnd,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects booking when patient has an overlapping appointment with another doctor (409 Conflict)', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
        isAcceptingBookings: true,
      });
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUser.id,
        isActive: true,
      });
      mockPrisma.appointment.findFirst.mockResolvedValueOnce({
        id: 'existing-appointment-with-other-doctor',
      });

      await expect(
        service.createAppointment(patientUser, {
          doctorId: sampleDoctorId,
          startAt: futureStart,
          endAt: futureEnd,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
    });

    it('rejects booking with off-schedule start time (400 Bad Request)', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
        isAcceptingBookings: true,
      });

      // 09:12 to 09:42 is not a generated slot on the 30-min schedule
      const offScheduleStart = '2026-11-20T03:42:00.000Z';
      const offScheduleEnd = '2026-11-20T04:12:00.000Z';

      await expect(
        service.createAppointment(patientUser, {
          doctorId: sampleDoctorId,
          startAt: offScheduleStart,
          endAt: offScheduleEnd,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
    });

    it('rejects booking with wrong duration (400 Bad Request)', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
        isAcceptingBookings: true,
      });

      // 45 minute duration instead of 30 minutes
      const wrongDurationEnd = '2026-11-20T04:15:00.000Z';

      await expect(
        service.createAppointment(patientUser, {
          doctorId: sampleDoctorId,
          startAt: futureStart,
          endAt: wrongDurationEnd,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
    });

    it('rejects booking when doctor has UNAVAILABLE exception on requested date (400 Bad Request)', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
        isAcceptingBookings: true,
      });
      // getAvailableSlots returns empty slots for UNAVAILABLE exception
      mockAvailability.getAvailableSlots.mockResolvedValueOnce({
        slots: [],
      });

      await expect(
        service.createAppointment(patientUser, {
          doctorId: sampleDoctorId,
          startAt: futureStart,
          endAt: futureEnd,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
    });

    it('allows booking within CUSTOM_HOURS override slot and rejects outside it', async () => {
      const customStart = '2026-11-20T08:30:00.000Z'; // 14:00 IST
      const customEnd = '2026-11-20T09:00:00.000Z';   // 14:30 IST

      // Custom hours produced only the 14:00 slot
      mockAvailability.getAvailableSlots.mockResolvedValue({
        slots: [
          {
            startAt: customStart,
            endAt: customEnd,
            startTime: '14:00',
            endTime: '14:30',
            available: true,
          },
        ],
      });

      // Attempting to book the standard 09:00 slot fails
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
        isAcceptingBookings: true,
      });
      await expect(
        service.createAppointment(patientUser, {
          doctorId: sampleDoctorId,
          startAt: futureStart,
          endAt: futureEnd,
        }),
      ).rejects.toThrow(BadRequestException);

      // Booking the custom 14:00 slot succeeds
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
        isAcceptingBookings: true,
      });
      mockPrisma.appointment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.appointment.create.mockResolvedValueOnce({
        id: sampleAppointmentId,
        patientId: patientUser.id,
        doctorId: sampleDoctorId,
        startAt: new Date(customStart),
        endAt: new Date(customEnd),
        status: AppointmentStatus.BOOKED,
        reason: 'Custom slot',
        cancellationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.createAppointment(patientUser, {
        doctorId: sampleDoctorId,
        startAt: customStart,
        endAt: customEnd,
        reason: 'Custom slot',
      });
      expect(res.startAt).toBe(new Date(customStart).toISOString());
    });
  });

  describe('getMyAppointments', () => {
    it('applies safe default pagination (page=1, limit=20)', async () => {
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

      await service.getMyAppointments(patientUser);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: patientUser.id },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('applies custom page and limit pagination slicing', async () => {
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

      await service.getMyAppointments(patientUser, { page: 3, limit: 15 });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: patientUser.id },
          skip: 30, // (3 - 1) * 15
          take: 15,
        }),
      );
    });

    it('clamps limit to MAX_LIMIT (100) when limit exceeds 100', async () => {
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

      await service.getMyAppointments(patientUser, { page: 1, limit: 500 });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: patientUser.id },
          skip: 0,
          take: 100,
        }),
      );
    });

    it('queries appointments filtered by patientId for PATIENT caller', async () => {
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

      await service.getMyAppointments(patientUser);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: patientUser.id },
        }),
      );
    });

    it('queries appointments filtered by doctorId for DOCTOR caller', async () => {
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

      await service.getMyAppointments(doctorUser);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { doctorId: doctorUser.doctorId },
        }),
      );
    });

    it('queries all appointments without filter for ADMIN caller', async () => {
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

      await service.getMyAppointments(adminUser);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  describe('getAppointmentById', () => {
    const mockAppointment = {
      id: sampleAppointmentId,
      patientId: patientUser.id,
      doctorId: sampleDoctorId,
      startAt: new Date(),
      endAt: new Date(),
      status: AppointmentStatus.BOOKED,
      reason: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('allows patient owner to view appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(mockAppointment);

      const result = await service.getAppointmentById(patientUser, sampleAppointmentId);

      expect(result.id).toBe(sampleAppointmentId);
    });

    it('allows assigned doctor to view appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(mockAppointment);

      const result = await service.getAppointmentById(doctorUser, sampleAppointmentId);

      expect(result.id).toBe(sampleAppointmentId);
    });

    it('allows admin to view appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(mockAppointment);

      const result = await service.getAppointmentById(adminUser, sampleAppointmentId);

      expect(result.id).toBe(sampleAppointmentId);
    });

    it('rejects an unrelated patient with 403 Forbidden', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(mockAppointment);

      const otherPatient: AuthenticatedUser = {
        id: '99999999-9999-4999-8999-999999999999',
        email: 'other@example.com',
        fullName: 'Other Patient',
        role: UserRole.PATIENT,
        isActive: true,
      };

      await expect(
        service.getAppointmentById(otherPatient, sampleAppointmentId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelAppointment', () => {
    const futureAppointment = {
      id: sampleAppointmentId,
      patientId: patientUser.id,
      doctorId: sampleDoctorId,
      startAt: new Date(Date.now() + 86400000),
      endAt: new Date(Date.now() + 86400000 + 1800000),
      status: AppointmentStatus.BOOKED,
      reason: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('cancels appointment successfully and logs audit log', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(futureAppointment);
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
        ...futureAppointment,
        status: AppointmentStatus.CANCELLED,
        cancellationReason: 'Emergency conflict',
      });

      const result = await service.cancelAppointment(patientUser, sampleAppointmentId, {
        cancellationReason: 'Emergency conflict',
      });

      expect(result.status).toBe(AppointmentStatus.CANCELLED);
      expect(mockPrisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: sampleAppointmentId,
            status: AppointmentStatus.BOOKED,
          },
          data: expect.objectContaining({
            status: AppointmentStatus.CANCELLED,
            cancellationReason: 'Emergency conflict',
          }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'APPOINTMENT_CANCELLED',
            actorId: patientUser.id,
          }),
        }),
      );
    });

    it('rejects cancellation of already-cancelled appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        ...futureAppointment,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(
        service.cancelAppointment(patientUser, sampleAppointmentId, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cancellation with 400 when status was changed concurrently to CANCELLED in transaction', async () => {
      // Passes initial read outside transaction
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(futureAppointment);
      // Fails inside transaction because status was concurrently modified
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        id: sampleAppointmentId,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(
        service.cancelAppointment(patientUser, sampleAppointmentId, {}),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects cancellation of past appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        ...futureAppointment,
        startAt: new Date(Date.now() - 3600000),
      });

      await expect(
        service.cancelAppointment(patientUser, sampleAppointmentId, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rescheduleAppointment', () => {
    const futureAppointment = {
      id: sampleAppointmentId,
      patientId: patientUser.id,
      doctorId: sampleDoctorId,
      startAt: new Date(Date.now() + 86400000),
      endAt: new Date(Date.now() + 86400000 + 1800000),
      status: AppointmentStatus.BOOKED,
      reason: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('reschedules appointment atomically and logs audit log', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(futureAppointment);
      mockPrisma.appointment.findFirst.mockResolvedValueOnce(null); // No patient conflict
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
        ...futureAppointment,
        startAt: new Date(newStart),
        endAt: new Date(newEnd),
        reason: 'Shifted schedule',
      });

      const result = await service.rescheduleAppointment(patientUser, sampleAppointmentId, {
        startAt: newStart,
        endAt: newEnd,
        reason: 'Shifted schedule',
      });

      expect(result.startAt).toBe(new Date(newStart).toISOString());
      expect(mockPrisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: sampleAppointmentId,
            status: AppointmentStatus.BOOKED,
          },
          data: expect.objectContaining({
            startAt: new Date(newStart),
            endAt: new Date(newEnd),
          }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'APPOINTMENT_RESCHEDULED',
            actorId: patientUser.id,
          }),
        }),
      );
    });

    it('validates target slot without treating the appointment being rescheduled as a conflict with itself', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(futureAppointment);
      mockPrisma.appointment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
        ...futureAppointment,
        startAt: new Date(newStart),
        endAt: new Date(newEnd),
      });

      await service.rescheduleAppointment(patientUser, sampleAppointmentId, {
        startAt: newStart,
        endAt: newEnd,
      });

      // Verify excludeAppointmentId was passed to getAvailableSlots
      expect(mockAvailability.getAvailableSlots).toHaveBeenCalledWith(
        sampleDoctorId,
        '2026-11-20',
        { excludeAppointmentId: sampleAppointmentId },
      );
    });

    it('rejects reschedule when target slot is off-schedule or wrong duration', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(futureAppointment);

      const offScheduleStart = '2026-11-20T04:42:00.000Z'; // 10:12 IST
      const offScheduleEnd = '2026-11-20T05:12:00.000Z';

      await expect(
        service.rescheduleAppointment(patientUser, sampleAppointmentId, {
          startAt: offScheduleStart,
          endAt: offScheduleEnd,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('rejects reschedule when doctor has UNAVAILABLE exception on target date', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(futureAppointment);
      mockAvailability.getAvailableSlots.mockResolvedValueOnce({ slots: [] });

      await expect(
        service.rescheduleAppointment(patientUser, sampleAppointmentId, {
          startAt: newStart,
          endAt: newEnd,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('rejects reschedule with 400 when status was changed concurrently to CANCELLED in transaction', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(futureAppointment);
      mockPrisma.appointment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        id: sampleAppointmentId,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(
        service.rescheduleAppointment(patientUser, sampleAppointmentId, {
          startAt: newStart,
          endAt: newEnd,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('rolls back and does not create audit log when rescheduling transaction fails', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(futureAppointment);
      mockPrisma.appointment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.appointment.updateMany.mockRejectedValueOnce(
        new Error('PostgreSQL exclusion constraint violation'),
      );

      await expect(
        service.rescheduleAppointment(patientUser, sampleAppointmentId, {
          startAt: newStart,
          endAt: newEnd,
        }),
      ).rejects.toThrow('PostgreSQL exclusion constraint violation');

      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects reschedule when patient has an overlapping appointment at the new slot (409 Conflict)', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(futureAppointment);
      mockPrisma.appointment.findFirst.mockResolvedValueOnce({
        id: 'conflicting-other-appointment',
      });

      await expect(
        service.rescheduleAppointment(patientUser, sampleAppointmentId, {
          startAt: newStart,
          endAt: newEnd,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
    });

  });
});
