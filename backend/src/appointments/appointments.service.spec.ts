import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentStatus, UserRole } from '../../generated/prisma/client.js';
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
  const futureEnd = '2026-11-20T04:00:00.000Z'; // 09:30 IST
  const newStart = '2026-11-20T04:30:00.000Z'; // 10:00 IST
  const newEnd = '2026-11-20T05:00:00.000Z'; // 10:30 IST

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
      const customEnd = '2026-11-20T09:00:00.000Z'; // 14:30 IST

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

    it('filters by date and defaults to ascending order when date is provided', async () => {
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

      await service.getMyAppointments(doctorUser, { date: '2026-11-20' });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctorId: doctorUser.doctorId,
            startAt: {
              gte: new Date('2026-11-20T00:00:00+05:30'),
              lte: new Date('2026-11-20T23:59:59.999+05:30'),
            },
          }),
          orderBy: { startAt: 'asc' },
        }),
      );
    });
  });

  describe('getTodayDoctorSchedule', () => {
    it('retrieves today schedule in ascending start-time order for authenticated doctor', async () => {
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

      const result = await service.getTodayDoctorSchedule(doctorUser);

      expect(result).toEqual([]);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctorId: doctorUser.doctorId,
            startAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
          orderBy: { startAt: 'asc' },
        }),
      );
    });

    it('rejects patient caller with 403 Forbidden', async () => {
      await expect(service.getTodayDoctorSchedule(patientUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects doctor caller without doctorId with 403 Forbidden', async () => {
      const invalidDoctor: AuthenticatedUser = {
        ...doctorUser,
        doctorId: undefined,
      };

      await expect(
        service.getTodayDoctorSchedule(invalidDoctor),
      ).rejects.toThrow(ForbiddenException);
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

      const result = await service.getAppointmentById(
        patientUser,
        sampleAppointmentId,
      );

      expect(result.id).toBe(sampleAppointmentId);
    });

    it('allows assigned doctor to view appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(mockAppointment);

      const result = await service.getAppointmentById(
        doctorUser,
        sampleAppointmentId,
      );

      expect(result.id).toBe(sampleAppointmentId);
    });

    it('allows admin to view appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(mockAppointment);

      const result = await service.getAppointmentById(
        adminUser,
        sampleAppointmentId,
      );

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
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        futureAppointment,
      );
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
        ...futureAppointment,
        status: AppointmentStatus.CANCELLED,
        cancellationReason: 'Emergency conflict',
      });

      const result = await service.cancelAppointment(
        patientUser,
        sampleAppointmentId,
        {
          cancellationReason: 'Emergency conflict',
        },
      );

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
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        futureAppointment,
      );
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

    it('allows cancellation when more than 2 hours remain before start time', async () => {
      const fixedNow = new Date('2026-11-20T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      try {
        const threeHoursFuture = {
          ...futureAppointment,
          startAt: new Date(fixedNow.getTime() + 3 * 60 * 60 * 1000), // 3 hours
        };
        mockPrisma.appointment.findUnique.mockResolvedValueOnce(
          threeHoursFuture,
        );
        mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
        mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
          ...threeHoursFuture,
          status: AppointmentStatus.CANCELLED,
        });

        const result = await service.cancelAppointment(
          patientUser,
          sampleAppointmentId,
          {},
        );
        expect(result.status).toBe(AppointmentStatus.CANCELLED);
      } finally {
        vi.useRealTimers();
      }
    });

    it('allows cancellation when exactly 2 hours remain before start time', async () => {
      const fixedNow = new Date('2026-11-20T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      try {
        const exactlyTwoHoursFuture = {
          ...futureAppointment,
          startAt: new Date(fixedNow.getTime() + 2 * 60 * 60 * 1000), // exactly 2 hours (7200000ms)
        };
        mockPrisma.appointment.findUnique.mockResolvedValueOnce(
          exactlyTwoHoursFuture,
        );
        mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
        mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
          ...exactlyTwoHoursFuture,
          status: AppointmentStatus.CANCELLED,
        });

        const result = await service.cancelAppointment(
          patientUser,
          sampleAppointmentId,
          {},
        );
        expect(result.status).toBe(AppointmentStatus.CANCELLED);
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects cancellation when strictly less than 2 hours remain before start time', async () => {
      const fixedNow = new Date('2026-11-20T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      try {
        const lessThanTwoHoursFuture = {
          ...futureAppointment,
          startAt: new Date(fixedNow.getTime() + (2 * 60 * 60 * 1000 - 1000)), // 1 hour 59 min 59 sec
        };
        mockPrisma.appointment.findUnique.mockResolvedValueOnce(
          lessThanTwoHoursFuture,
        );

        await expect(
          service.cancelAppointment(patientUser, sampleAppointmentId, {}),
        ).rejects.toThrow(
          'Appointments cannot be cancelled when less than two hours remain before the scheduled start time.',
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects cancellation when appointment has already started or elapsed', async () => {
      const fixedNow = new Date('2026-11-20T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      try {
        const elapsedAppointment = {
          ...futureAppointment,
          startAt: new Date(fixedNow.getTime() - 1000), // 1 second in the past
        };
        mockPrisma.appointment.findUnique.mockResolvedValueOnce(
          elapsedAppointment,
        );

        await expect(
          service.cancelAppointment(patientUser, sampleAppointmentId, {}),
        ).rejects.toThrow(
          'Cannot cancel an appointment that has already started or elapsed.',
        );
      } finally {
        vi.useRealTimers();
      }
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
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        futureAppointment,
      );
      mockPrisma.appointment.findFirst.mockResolvedValueOnce(null); // No patient conflict
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
        ...futureAppointment,
        startAt: new Date(newStart),
        endAt: new Date(newEnd),
        reason: 'Shifted schedule',
      });

      const result = await service.rescheduleAppointment(
        patientUser,
        sampleAppointmentId,
        {
          startAt: newStart,
          endAt: newEnd,
          reason: 'Shifted schedule',
        },
      );

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
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        futureAppointment,
      );
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
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        futureAppointment,
      );

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
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        futureAppointment,
      );
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
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        futureAppointment,
      );
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
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        futureAppointment,
      );
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
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        futureAppointment,
      );
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

    it('allows rescheduling when more than 2 hours remain before start time', async () => {
      const fixedNow = new Date('2026-11-20T00:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      try {
        const threeHoursFuture = {
          ...futureAppointment,
          startAt: new Date(fixedNow.getTime() + 3 * 60 * 60 * 1000), // 03:00 UTC
        };
        mockPrisma.appointment.findUnique.mockResolvedValueOnce(
          threeHoursFuture,
        );
        mockPrisma.appointment.findFirst.mockResolvedValueOnce(null);
        mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
        mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
          ...threeHoursFuture,
          startAt: new Date(newStart),
          endAt: new Date(newEnd),
        });

        const result = await service.rescheduleAppointment(
          patientUser,
          sampleAppointmentId,
          {
            startAt: newStart,
            endAt: newEnd,
          },
        );

        expect(result.startAt).toBe(new Date(newStart).toISOString());
      } finally {
        vi.useRealTimers();
      }
    });

    it('allows rescheduling when exactly 2 hours remain before start time', async () => {
      const fixedNow = new Date('2026-11-20T00:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      try {
        const exactlyTwoHoursFuture = {
          ...futureAppointment,
          startAt: new Date(fixedNow.getTime() + 2 * 60 * 60 * 1000), // 02:00 UTC
        };
        mockPrisma.appointment.findUnique.mockResolvedValueOnce(
          exactlyTwoHoursFuture,
        );
        mockPrisma.appointment.findFirst.mockResolvedValueOnce(null);
        mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
        mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
          ...exactlyTwoHoursFuture,
          startAt: new Date(newStart),
          endAt: new Date(newEnd),
        });

        const result = await service.rescheduleAppointment(
          patientUser,
          sampleAppointmentId,
          {
            startAt: newStart,
            endAt: newEnd,
          },
        );

        expect(result.startAt).toBe(new Date(newStart).toISOString());
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects rescheduling when strictly less than 2 hours remain before start time', async () => {
      const fixedNow = new Date('2026-11-20T00:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      try {
        const lessThanTwoHoursFuture = {
          ...futureAppointment,
          startAt: new Date(fixedNow.getTime() + (2 * 60 * 60 * 1000 - 1000)),
        };
        mockPrisma.appointment.findUnique.mockResolvedValueOnce(
          lessThanTwoHoursFuture,
        );

        await expect(
          service.rescheduleAppointment(patientUser, sampleAppointmentId, {
            startAt: newStart,
            endAt: newEnd,
          }),
        ).rejects.toThrow(
          'Appointments cannot be rescheduled when less than two hours remain before the scheduled start time.',
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects rescheduling when appointment has already started or elapsed', async () => {
      const fixedNow = new Date('2026-11-20T00:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      try {
        const elapsedAppointment = {
          ...futureAppointment,
          startAt: new Date(fixedNow.getTime() - 1000),
        };
        mockPrisma.appointment.findUnique.mockResolvedValueOnce(
          elapsedAppointment,
        );

        await expect(
          service.rescheduleAppointment(patientUser, sampleAppointmentId, {
            startAt: newStart,
            endAt: newEnd,
          }),
        ).rejects.toThrow(
          'Cannot reschedule an appointment that has already started or elapsed.',
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('updateAppointmentStatus', () => {
    const bookedAppointment = {
      id: sampleAppointmentId,
      patientId: patientUser.id,
      doctorId: sampleDoctorId,
      startAt: new Date('2026-11-20T10:00:00.000Z'),
      endAt: new Date('2026-11-20T10:30:00.000Z'),
      status: AppointmentStatus.BOOKED,
      reason: 'Checkup',
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      doctor: {
        id: sampleDoctorId,
        specialty: 'Cardiology',
        userProfile: { fullName: 'Dr. Watson' },
      },
      patient: {
        id: patientUser.id,
        fullName: 'Jane Patient',
        email: 'patient@example.com',
      },
    };

    it('allows assigned doctor to mark appointment as COMPLETED', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        bookedAppointment,
      );
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
        ...bookedAppointment,
        status: AppointmentStatus.COMPLETED,
      });

      const result = await service.updateAppointmentStatus(
        doctorUser,
        sampleAppointmentId,
        {
          status: AppointmentStatus.COMPLETED,
        },
      );

      expect(result.status).toBe(AppointmentStatus.COMPLETED);
      expect(mockPrisma.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: sampleAppointmentId, status: AppointmentStatus.BOOKED },
        data: { status: AppointmentStatus.COMPLETED },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'APPOINTMENT_MARKED_COMPLETED',
          actorId: doctorUser.id,
        }),
      });
    });

    it('allows assigned doctor to mark appointment as NO_SHOW', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        bookedAppointment,
      );
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
        ...bookedAppointment,
        status: AppointmentStatus.NO_SHOW,
      });

      const result = await service.updateAppointmentStatus(
        doctorUser,
        sampleAppointmentId,
        {
          status: AppointmentStatus.NO_SHOW,
        },
      );

      expect(result.status).toBe(AppointmentStatus.NO_SHOW);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'APPOINTMENT_MARKED_NO_SHOW',
          actorId: doctorUser.id,
        }),
      });
    });

    it('allows admin to mark appointment as COMPLETED', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        bookedAppointment,
      );
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.appointment.findUniqueOrThrow.mockResolvedValueOnce({
        ...bookedAppointment,
        status: AppointmentStatus.COMPLETED,
      });

      const result = await service.updateAppointmentStatus(
        adminUser,
        sampleAppointmentId,
        {
          status: AppointmentStatus.COMPLETED,
        },
      );

      expect(result.status).toBe(AppointmentStatus.COMPLETED);
    });

    it('rejects patient caller with 403 Forbidden', async () => {
      await expect(
        service.updateAppointmentStatus(patientUser, sampleAppointmentId, {
          status: AppointmentStatus.COMPLETED,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.appointment.findUnique).not.toHaveBeenCalled();
    });

    it('rejects unassigned doctor with 403 Forbidden', async () => {
      const otherDoctor: AuthenticatedUser = {
        ...doctorUser,
        id: 'different-doctor-id',
        doctorId: 'different-doctor-profile-id',
      };

      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        bookedAppointment,
      );

      await expect(
        service.updateAppointmentStatus(otherDoctor, sampleAppointmentId, {
          status: AppointmentStatus.COMPLETED,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when appointment does not exist', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateAppointmentStatus(doctorUser, 'non-existent-id', {
          status: AppointmentStatus.COMPLETED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects status update when appointment is already CANCELLED', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        ...bookedAppointment,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(
        service.updateAppointmentStatus(doctorUser, sampleAppointmentId, {
          status: AppointmentStatus.COMPLETED,
        }),
      ).rejects.toThrow(
        'Cannot update status of an appointment with status "CANCELLED". Only BOOKED appointments can be marked as COMPLETED.',
      );
    });

    it('rejects status update when appointment is already COMPLETED', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        ...bookedAppointment,
        status: AppointmentStatus.COMPLETED,
      });

      await expect(
        service.updateAppointmentStatus(doctorUser, sampleAppointmentId, {
          status: AppointmentStatus.NO_SHOW,
        }),
      ).rejects.toThrow(
        'Cannot update status of an appointment with status "COMPLETED". Only BOOKED appointments can be marked as NO_SHOW.',
      );
    });

    it('rolls back and does not write audit log when status was changed concurrently', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(
        bookedAppointment,
      );
      mockPrisma.appointment.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        ...bookedAppointment,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(
        service.updateAppointmentStatus(doctorUser, sampleAppointmentId, {
          status: AppointmentStatus.COMPLETED,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('getMyAppointments (full schedule & role isolation)', () => {
    it('allows a doctor to retrieve appointments more than two days in the future', async () => {
      const farFutureDate = new Date(Date.now() + 10 * 86400000);
      mockPrisma.appointment.findMany.mockResolvedValueOnce([
        {
          id: sampleAppointmentId,
          patientId: patientUser.id,
          doctorId: doctorUser.doctorId,
          startAt: farFutureDate,
          endAt: new Date(farFutureDate.getTime() + 1800000),
          status: AppointmentStatus.BOOKED,
          reason: 'Follow-up consultation',
          cancellationReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          doctor: {
            id: doctorUser.doctorId,
            specialty: 'Cardiology',
            userProfile: { fullName: doctorUser.fullName },
          },
          patient: {
            id: patientUser.id,
            fullName: patientUser.fullName,
            email: patientUser.email,
          },
          review: null,
        },
      ]);

      const result = await service.getMyAppointments(doctorUser, {
        scope: 'upcoming',
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(sampleAppointmentId);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctorId: doctorUser.doctorId,
            startAt: expect.any(Object),
          }),
        }),
      );
    });

    it('allows a doctor to see past appointments as well as upcoming appointments without date restriction', async () => {
      const pastDate = new Date(Date.now() - 3 * 86400000);
      const futureDate = new Date(Date.now() + 5 * 86400000);

      mockPrisma.appointment.findMany.mockResolvedValueOnce([
        {
          id: 'past-app-1',
          patientId: patientUser.id,
          doctorId: doctorUser.doctorId,
          startAt: pastDate,
          endAt: new Date(pastDate.getTime() + 1800000),
          status: AppointmentStatus.COMPLETED,
          reason: null,
          cancellationReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          doctor: {
            id: doctorUser.doctorId,
            specialty: 'Cardiology',
            userProfile: { fullName: doctorUser.fullName },
          },
          patient: {
            id: patientUser.id,
            fullName: patientUser.fullName,
            email: patientUser.email,
          },
          review: { id: 'rev-1', rating: 5, comment: 'Great doctor', isDemo: false },
        },
        {
          id: 'future-app-2',
          patientId: patientUser.id,
          doctorId: doctorUser.doctorId,
          startAt: futureDate,
          endAt: new Date(futureDate.getTime() + 1800000),
          status: AppointmentStatus.BOOKED,
          reason: null,
          cancellationReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          doctor: {
            id: doctorUser.doctorId,
            specialty: 'Cardiology',
            userProfile: { fullName: doctorUser.fullName },
          },
          patient: {
            id: patientUser.id,
            fullName: patientUser.fullName,
            email: patientUser.email,
          },
          review: null,
        },
      ]);

      const result = await service.getMyAppointments(doctorUser);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe(AppointmentStatus.COMPLETED);
      expect(result[1].status).toBe(AppointmentStatus.BOOKED);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { doctorId: doctorUser.doctorId },
        }),
      );
    });

    it('strictly isolates doctor schedule so a doctor cannot access another doctor appointments', async () => {
      mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

      await service.getMyAppointments(doctorUser);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctorId: doctorUser.doctorId,
          }),
        }),
      );
    });

    it('rejects schedule access if doctor account lacks doctorId association', async () => {
      const unassociatedDoctor: AuthenticatedUser = {
        ...doctorUser,
        doctorId: undefined,
      };

      await expect(
        service.getMyAppointments(unassociatedDoctor),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
