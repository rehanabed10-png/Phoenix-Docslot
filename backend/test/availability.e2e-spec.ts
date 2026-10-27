import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GenerateKeyPairResult, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { ExceptionType, UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('AvailabilityController (e2e)', () => {
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
      deleteMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
    availabilityException: {
      findMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  const mockSupabaseUrl = 'https://test-availability.supabase.co';
  const targetDoctorId = '22222222-3333-4444-8555-666666666666';
  const anotherDoctorId = '99999999-9999-4999-8999-999999999999';

  const doctorAUserId = 'doctor-a-user-uuid-111111111111';
  const doctorBUserId = 'doctor-b-user-uuid-222222222222';
  const patientUserId = 'patient-user-uuid-333333333333';
  const adminUserId = 'admin-user-uuid-444444444444';

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
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      availabilityException: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      appointment: {
        findMany: vi.fn(),
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

  const createToken = async (sub: string): Promise<string> => {
    return new SignJWT({ email: 'test@example.com' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(`${mockSupabaseUrl}/auth/v1`)
      .setSubject(sub)
      .setExpirationTime('1h')
      .sign(testKeyPair.privateKey);
  };

  describe('Public Read-Only Routes', () => {
    it('GET /doctors/:doctorId/availability/weekly remains public (200 without token)', async () => {
      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce({
        id: targetDoctorId,
      });
      mockPrismaService.weeklyAvailability.findMany.mockResolvedValueOnce([
        {
          id: 'slot-1',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '13:00',
          slotDuration: 30,
          isActive: true,
        },
      ]);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${targetDoctorId}/availability/weekly`,
      );

      expect(res.status).toBe(200);
      expect(res.body.doctorId).toBe(targetDoctorId);
    });

    it('GET /doctors/:doctorId/availability/exceptions remains public (200 without token)', async () => {
      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce({
        id: targetDoctorId,
      });
      mockPrismaService.availabilityException.findMany.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${targetDoctorId}/availability/exceptions`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('GET /doctors/:doctorId/availability/slots rejects impossible calendar date 2026-02-31 with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer()).get(
        `/doctors/${targetDoctorId}/availability/slots?date=2026-02-31`,
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('date must be a valid calendar date in YYYY-MM-DD format'),
        ]),
      );
    });

    it('GET /doctors/:doctorId/availability/slots rejects malformed date string with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer()).get(
        `/doctors/${targetDoctorId}/availability/slots?date=invalid-date`,
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('date must be a valid calendar date in YYYY-MM-DD format'),
        ]),
      );
    });

    it('GET /doctors/:doctorId/availability/slots returns 200 OK for valid calendar date', async () => {
      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce({
        id: targetDoctorId,
        isAcceptingBookings: true,
      });
      mockPrismaService.availabilityException.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.weeklyAvailability.findMany.mockResolvedValueOnce([
        {
          startTime: '09:00',
          endTime: '10:00',
          slotDuration: 30,
        },
      ]);
      mockPrismaService.appointment.findMany.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${targetDoctorId}/availability/slots?date=2026-11-20`,
      );

      expect(res.status).toBe(200);
      expect(res.body.doctorId).toBe(targetDoctorId);
      expect(res.body.date).toBe('2026-11-20');
      expect(res.body.slots).toHaveLength(2);
    });
  });

  describe('Protected Route: PUT /doctors/:doctorId/availability/weekly', () => {
    const validSchedulePayload = {
      schedule: [
        {
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 30,
          isActive: true,
        },
      ],
    };

    it('returns 401 Unauthorized when request has no token', async () => {
      const res = await request(app.getHttpServer())
        .put(`/doctors/${targetDoctorId}/availability/weekly`)
        .send(validSchedulePayload);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Authentication token is required');
    });

    it('returns 403 Forbidden when caller has PATIENT role', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'Jane Patient',
        phone: null,
        role: UserRole.PATIENT,
        isActive: true,
        doctorProfile: null,
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .put(`/doctors/${targetDoctorId}/availability/weekly`)
        .set('Authorization', `Bearer ${token}`)
        .send(validSchedulePayload);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('You do not have permission');
    });

    it('returns 403 Forbidden when Doctor A attempts to mutate Doctor B schedule (cross-doctor ownership)', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: doctorBUserId,
        email: 'doctor-b@hospital.org',
        fullName: 'Dr. Bob',
        phone: null,
        role: UserRole.DOCTOR,
        isActive: true,
        doctorProfile: {
          id: anotherDoctorId, // Different doctorId
          isAcceptingBookings: true,
        },
      });

      const token = await createToken(doctorBUserId);
      const res = await request(app.getHttpServer())
        .put(`/doctors/${targetDoctorId}/availability/weekly`)
        .set('Authorization', `Bearer ${token}`)
        .send(validSchedulePayload);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('You are not authorized to modify another doctor');
    });

    it('returns 200 OK when owning Doctor A updates their own schedule', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: doctorAUserId,
        email: 'doctor-a@hospital.org',
        fullName: 'Dr. Alice',
        phone: null,
        role: UserRole.DOCTOR,
        isActive: true,
        doctorProfile: {
          id: targetDoctorId, // Matches targetDoctorId
          isAcceptingBookings: true,
        },
      });

      // Service calls
      mockPrismaService.doctorProfile.findUnique.mockResolvedValue({
        id: targetDoctorId,
      });
      mockPrismaService.weeklyAvailability.findMany.mockResolvedValue([
        {
          id: 'updated-1',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 30,
          isActive: true,
        },
      ]);

      const token = await createToken(doctorAUserId);
      const res = await request(app.getHttpServer())
        .put(`/doctors/${targetDoctorId}/availability/weekly`)
        .set('Authorization', `Bearer ${token}`)
        .send(validSchedulePayload);

      expect(res.status).toBe(200);
      expect(res.body.doctorId).toBe(targetDoctorId);
      expect(res.body.schedule).toHaveLength(1);
    });

    it('returns 200 OK when an ADMIN updates any doctor schedule', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: adminUserId,
        email: 'admin@hospital.org',
        fullName: 'System Admin',
        phone: null,
        role: UserRole.ADMIN,
        isActive: true,
        doctorProfile: null,
      });

      mockPrismaService.doctorProfile.findUnique.mockResolvedValue({
        id: targetDoctorId,
      });
      mockPrismaService.weeklyAvailability.findMany.mockResolvedValue([]);

      const token = await createToken(adminUserId);
      const res = await request(app.getHttpServer())
        .put(`/doctors/${targetDoctorId}/availability/weekly`)
        .set('Authorization', `Bearer ${token}`)
        .send({ schedule: [] }); // Clears schedule

      expect(res.status).toBe(200);
      expect(res.body.schedule).toEqual([]);
    });
  });

  describe('Unexposed Mutation Routes (Safety Boundary)', () => {
    it('confirms POST /exceptions and DELETE /exceptions/:id remain unexposed (404 Not Found)', async () => {
      const postRes = await request(app.getHttpServer())
        .post(`/doctors/${targetDoctorId}/availability/exceptions`)
        .send({ date: '2026-11-20', type: ExceptionType.UNAVAILABLE });
      expect(postRes.status).toBe(404);

      const deleteRes = await request(app.getHttpServer()).delete(
        `/doctors/${targetDoctorId}/availability/exceptions/any-id`,
      );
      expect(deleteRes.status).toBe(404);
    });
  });
});
