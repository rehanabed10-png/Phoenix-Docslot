import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GenerateKeyPairResult, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import {
  AppointmentStatus,
  UserRole,
} from '../generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Appointments & Slot Availability (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let testKeyPair: GenerateKeyPairResult;

  let mockPrismaService: {
    doctorProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    userProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    weeklyAvailability: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    availabilityException: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    appointment: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    auditLog: {
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  const mockSupabaseUrl = 'https://test-appointments.supabase.co';
  const targetDoctorId = '22222222-3333-4444-8555-666666666666';
  const patientUserId = '11111111-1111-4111-8111-111111111111';
  const otherPatientUserId = '22222222-2222-4222-8222-222222222222';
  const appointmentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const spoofedPatientId = '99999999-9999-4999-8999-999999999999';

  const futureDate = '2026-11-20'; // Friday
  const slotStart = '2026-11-20T03:30:00.000Z'; // 09:00 in +05:30
  const slotEnd = '2026-11-20T04:00:00.000Z'; // 09:30 in +05:30
  const rescheduleStart = '2026-11-20T04:00:00.000Z'; // 09:30 in +05:30
  const rescheduleEnd = '2026-11-20T04:30:00.000Z'; // 10:00 in +05:30

  beforeAll(async () => {
    process.env.SUPABASE_URL = mockSupabaseUrl;
    testKeyPair = await generateKeyPair('RS256');

    mockPrismaService = {
      doctorProfile: {
        findUnique: vi.fn(),
      },
      userProfile: {
        findUnique: vi.fn(),
      },
      weeklyAvailability: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      availabilityException: {
        findUnique: vi.fn(),
      },
      appointment: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn((callback: (tx: any) => Promise<any>) =>
        callback(mockPrismaService),
      ),
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    authService.setJWKSForTesting(async () => testKeyPair.publicKey);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockDoctorAvailability = (doctorId: string = targetDoctorId) => {
    mockPrismaService.doctorProfile.findUnique.mockResolvedValue({
      id: doctorId,
      isAcceptingBookings: true,
    });
    mockPrismaService.availabilityException.findUnique.mockResolvedValue(null);
    mockPrismaService.weeklyAvailability.findMany.mockResolvedValue([
      {
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30,
      },
    ]);
    mockPrismaService.appointment.findMany.mockResolvedValue([]);
  };

  const createToken = async (sub: string): Promise<string> => {
    return new SignJWT({ email: 'user@example.com' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(`${mockSupabaseUrl}/auth/v1`)
      .setSubject(sub)
      .setExpirationTime('1h')
      .sign(testKeyPair.privateKey);
  };

  describe('GET /doctors/:doctorId/availability/slots', () => {
    it('returns public slot availability (200 without token)', async () => {
      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce({
        id: targetDoctorId,
        isAcceptingBookings: true,
      });
      mockPrismaService.availabilityException.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.weeklyAvailability.findMany.mockResolvedValueOnce([
        {
          startTime: '09:00',
          endTime: '11:00',
          slotDuration: 30,
        },
      ]);
      mockPrismaService.appointment.findMany.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${targetDoctorId}/availability/slots?date=${futureDate}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.doctorId).toBe(targetDoctorId);
      expect(res.body.date).toBe(futureDate);
      expect(res.body.timezone).toBe('Asia/Kolkata');
      expect(res.body.slots).toHaveLength(4);
      expect(res.body.slots[0].startTime).toBe('09:00');
    });

    it('excludes slots overlapping with existing bookings', async () => {
      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce({
        id: targetDoctorId,
        isAcceptingBookings: true,
      });
      mockPrismaService.availabilityException.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.weeklyAvailability.findMany.mockResolvedValueOnce([
        {
          startTime: '09:00',
          endTime: '11:00',
          slotDuration: 30,
        },
      ]);
      // First slot is booked
      mockPrismaService.appointment.findMany.mockResolvedValueOnce([
        {
          startAt: new Date(slotStart),
          endAt: new Date(slotEnd),
        },
      ]);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${targetDoctorId}/availability/slots?date=${futureDate}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.slots).toHaveLength(3);
      expect(res.body.slots[0].startTime).toBe('09:30');
    });
  });

  describe('POST /appointments', () => {
    const validBookingPayload = {
      doctorId: targetDoctorId,
      startAt: slotStart,
      endAt: slotEnd,
      reason: 'General checkup',
    };

    it('returns 401 Unauthorized when request lacks authentication token', async () => {
      const res = await request(app.getHttpServer())
        .post('/appointments')
        .send(validBookingPayload);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Authentication token is required');
    });

    it('returns 201 Created and forces patientId from token for PATIENT caller', async () => {
      mockDoctorAvailability();
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });

      mockPrismaService.appointment.findFirst.mockResolvedValueOnce(null); // No patient conflict
      mockPrismaService.appointment.create.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: targetDoctorId,
        startAt: new Date(slotStart),
        endAt: new Date(slotEnd),
        status: AppointmentStatus.BOOKED,
        reason: 'General checkup',
        cancellationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        doctor: {
          id: targetDoctorId,
          specialty: 'Cardiology',
          userProfile: { fullName: 'Dr. Gregory House' },
        },
        patient: {
          id: patientUserId,
          fullName: 'Jane Patient',
          email: 'patient@example.com',
        },
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBookingPayload,
          patientId: spoofedPatientId,
        });

      expect(res.status).toBe(201);
      expect(res.body.patientId).toBe(patientUserId);
      expect(res.body.status).toBe('BOOKED');
    });

    it('returns 400 Bad Request when requested startAt is off-schedule', async () => {
      mockDoctorAvailability();
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBookingPayload,
          startAt: '2026-11-20T03:42:00.000Z', // 09:12 IST
          endAt: '2026-11-20T04:12:00.000Z',   // 09:42 IST
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not available or does not match the doctor\'s schedule');
    });

    it('returns 400 Bad Request when requested duration does not match slot duration', async () => {
      mockDoctorAvailability();
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBookingPayload,
          startAt: slotStart,
          endAt: '2026-11-20T04:15:00.000Z', // 45 minutes instead of 30
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not available or does not match the doctor\'s schedule');
    });

    it('returns 409 Conflict with doctor message when doctor slot is double-booked', async () => {
      mockDoctorAvailability();
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findFirst.mockResolvedValueOnce(null);

      // Simulate PostgreSQL 23P01 doctor exclusion constraint violation
      mockPrismaService.appointment.create.mockRejectedValueOnce({
        code: '23P01',
        constraint: 'Appointment_no_overlapping_bookings',
        message: 'conflicting key value violates exclusion constraint "Appointment_no_overlapping_bookings"',
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send(validBookingPayload);

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('The requested appointment time slot is already booked.');
    });

    it('returns 409 Conflict with patient message when patient attempts overlapping booking', async () => {
      mockDoctorAvailability();
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findFirst.mockResolvedValueOnce({
        id: 'existing-other-appointment',
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send(validBookingPayload);

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('You already have an active appointment scheduled during this time slot.');
    });
  });

  describe('GET /appointments/mine', () => {
    it('returns 200 with caller-scoped appointments list', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findMany.mockResolvedValueOnce([
        {
          id: appointmentId,
          patientId: patientUserId,
          doctorId: targetDoctorId,
          startAt: new Date(slotStart),
          endAt: new Date(slotEnd),
          status: AppointmentStatus.BOOKED,
          reason: 'Checkup',
          cancellationReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .get('/appointments/mine')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(appointmentId);
      expect(mockPrismaService.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20, // default limit
        }),
      );
    });

    it('respects pagination query parameters page and limit', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findMany.mockResolvedValueOnce([]);

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .get('/appointments/mine?page=2&limit=5')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(mockPrismaService.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5, // (2 - 1) * 5
          take: 5,
        }),
      );
    });

    it('returns 400 Bad Request when limit exceeds MAX_LIMIT (100)', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .get('/appointments/mine?limit=101')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('limit must not exceed 100')]),
      );
    });

    it('returns 400 Bad Request when page is less than 1', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .get('/appointments/mine?page=0')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('page must be at least 1')]),
      );
    });
  });

  describe('GET /appointments/:id', () => {
    it('returns 200 for owning patient', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findUnique.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: targetDoctorId,
        startAt: new Date(slotStart),
        endAt: new Date(slotEnd),
        status: AppointmentStatus.BOOKED,
        reason: null,
        cancellationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .get(`/appointments/${appointmentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(appointmentId);
    });

    it('returns 403 Forbidden when requested by an unrelated patient', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: otherPatientUserId,
        email: 'other@example.com',
        fullName: 'Other Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findUnique.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: targetDoctorId,
        startAt: new Date(slotStart),
        endAt: new Date(slotEnd),
        status: AppointmentStatus.BOOKED,
        reason: null,
        cancellationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = await createToken(otherPatientUserId);
      const res = await request(app.getHttpServer())
        .get(`/appointments/${appointmentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('You do not have permission');
    });
  });

  describe('PATCH /appointments/:id/cancel', () => {
    it('returns 200 and cancels appointment with cancellationReason', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findUnique.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: targetDoctorId,
        startAt: new Date(Date.now() + 86400000), // In future
        endAt: new Date(Date.now() + 86400000 + 1800000),
        status: AppointmentStatus.BOOKED,
      });
      mockPrismaService.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrismaService.appointment.findUniqueOrThrow.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: targetDoctorId,
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 86400000 + 1800000),
        status: AppointmentStatus.CANCELLED,
        reason: null,
        cancellationReason: 'Patient unavailable',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .patch(`/appointments/${appointmentId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancellationReason: 'Patient unavailable' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.cancellationReason).toBe('Patient unavailable');
    });

    it('returns 400 Bad Request when attempting to cancel an already-cancelled appointment', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findUnique.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: targetDoctorId,
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 86400000 + 1800000),
        status: AppointmentStatus.CANCELLED,
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .patch(`/appointments/${appointmentId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancellationReason: 'Cancelled again' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Only BOOKED appointments can be cancelled');
    });
  });

  describe('PATCH /appointments/:id/reschedule', () => {
    it('returns 200 and updates appointment to new slot atomically', async () => {
      mockDoctorAvailability();
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findUnique.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: targetDoctorId,
        startAt: new Date(slotStart),
        endAt: new Date(slotEnd),
        status: AppointmentStatus.BOOKED,
        reason: 'Initial consultation',
      });
      mockPrismaService.appointment.findFirst.mockResolvedValueOnce(null); // No patient conflict at new slot
      mockPrismaService.appointment.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrismaService.appointment.findUniqueOrThrow.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: targetDoctorId,
        startAt: new Date(rescheduleStart),
        endAt: new Date(rescheduleEnd),
        status: AppointmentStatus.BOOKED,
        reason: 'Shifted consultation',
        cancellationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .patch(`/appointments/${appointmentId}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          startAt: rescheduleStart,
          endAt: rescheduleEnd,
          reason: 'Shifted consultation',
        });

      expect(res.status).toBe(200);
      expect(res.body.startAt).toBe(new Date(rescheduleStart).toISOString());
      expect(res.body.reason).toBe('Shifted consultation');
    });

    it('returns 400 Bad Request when reschedule slot is off-schedule', async () => {
      mockDoctorAvailability();
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findUnique.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: targetDoctorId,
        startAt: new Date(slotStart),
        endAt: new Date(slotEnd),
        status: AppointmentStatus.BOOKED,
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .patch(`/appointments/${appointmentId}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          startAt: '2026-11-20T04:12:00.000Z', // 09:42 IST (off-schedule)
          endAt: '2026-11-20T04:42:00.000Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not available or does not match the doctor\'s schedule');
    });

    it('returns 400 Bad Request when attempting to reschedule an already-cancelled appointment', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        role: UserRole.PATIENT,
        isActive: true,
      });
      mockPrismaService.appointment.findUnique.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: targetDoctorId,
        startAt: new Date(slotStart),
        endAt: new Date(slotEnd),
        status: AppointmentStatus.CANCELLED,
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .patch(`/appointments/${appointmentId}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          startAt: rescheduleStart,
          endAt: rescheduleEnd,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Only BOOKED appointments can be rescheduled');
    });
  });
});
