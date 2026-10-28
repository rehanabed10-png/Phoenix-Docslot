import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GenerateKeyPairResult, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AppointmentStatus, UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('ReviewsController (e2e)', () => {
  let app: INestApplication<App>;
  let testKeyPair: GenerateKeyPairResult;

  let mockPrismaService: {
    userProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    appointment: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    appointmentReview: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    doctorProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  const mockSupabaseUrl = 'https://test-project.supabase.co';
  const patientUserId = '11111111-1111-4111-8111-111111111111';
  const otherPatientUserId = '22222222-2222-4222-8222-222222222222';
  const doctorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const appointmentId = '33333333-3333-4333-8333-333333333333';

  beforeAll(async () => {
    process.env.SUPABASE_URL = mockSupabaseUrl;
    testKeyPair = await generateKeyPair('RS256');

    mockPrismaService = {
      userProfile: {
        findUnique: vi.fn(),
      },
      appointment: {
        findUnique: vi.fn(),
      },
      appointmentReview: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        aggregate: vi.fn(),
        groupBy: vi.fn(),
      },
      doctorProfile: {
        findUnique: vi.fn(),
      },
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

    const authService = moduleFixture.get<AuthService>(AuthService);
    authService.setJWKSForTesting(async () => testKeyPair.publicKey);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createToken = async (sub: string, exp = '1h'): Promise<string> => {
    return new SignJWT({ email: 'user@example.com' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(`${mockSupabaseUrl}/auth/v1`)
      .setSubject(sub)
      .setExpirationTime(exp)
      .sign(testKeyPair.privateKey);
  };

  describe('POST /reviews', () => {
    it('creates a verified review when caller is the patient who attended the completed appointment', async () => {
      const token = await createToken(patientUserId);

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
        doctorId: doctorId,
        status: AppointmentStatus.COMPLETED,
        review: null,
      });

      mockPrismaService.appointmentReview.create.mockResolvedValueOnce({
        id: 'rev-1',
        appointmentId,
        patientId: patientUserId,
        doctorId,
        rating: 5,
        comment: 'Excellent consultation, doctor was thorough and caring.',
        isDemo: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        patient: {
          fullName: 'Jane Patient',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          appointmentId,
          rating: 5,
          comment: 'Excellent consultation, doctor was thorough and caring.',
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: 'rev-1',
        appointmentId,
        patientId: patientUserId,
        patientName: 'Jane Patient',
        doctorId,
        rating: 5,
        comment: 'Excellent consultation, doctor was thorough and caring.',
        isDemo: false,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('rejects review if appointment is not COMPLETED (e.g. BOOKED)', async () => {
      const token = await createToken(patientUserId);

      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        role: UserRole.PATIENT,
        isActive: true,
      });

      mockPrismaService.appointment.findUnique.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: doctorId,
        status: AppointmentStatus.BOOKED,
        review: null,
      });

      const res = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          appointmentId,
          rating: 5,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Only completed appointments');
    });

    it('rejects review if submitted by another patient (not appointment owner)', async () => {
      const token = await createToken(otherPatientUserId);

      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: otherPatientUserId,
        role: UserRole.PATIENT,
        isActive: true,
      });

      mockPrismaService.appointment.findUnique.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId, // Different patient!
        doctorId: doctorId,
        status: AppointmentStatus.COMPLETED,
        review: null,
      });

      const res = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          appointmentId,
          rating: 5,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('not authorized');
    });

    it('rejects duplicate review for the same appointment', async () => {
      const token = await createToken(patientUserId);

      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        role: UserRole.PATIENT,
        isActive: true,
      });

      mockPrismaService.appointment.findUnique.mockResolvedValueOnce({
        id: appointmentId,
        patientId: patientUserId,
        doctorId: doctorId,
        status: AppointmentStatus.COMPLETED,
        review: { id: 'existing-rev' },
      });

      const res = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          appointmentId,
          rating: 4,
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already been submitted');
    });

    it('rejects unauthenticated review submission with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/reviews')
        .send({
          appointmentId,
          rating: 5,
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /doctors/:doctorId/reviews', () => {
    it('returns paginated reviews and computed aggregates publicly without auth', async () => {
      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce({
        id: doctorId,
      });

      mockPrismaService.appointmentReview.findMany.mockResolvedValueOnce([
        {
          id: 'rev-1',
          appointmentId,
          patientId: patientUserId,
          doctorId,
          rating: 5,
          comment: 'Great doctor!',
          isDemo: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          patient: { fullName: 'Jane Patient' },
        },
      ]);

      mockPrismaService.appointmentReview.count.mockResolvedValueOnce(1);
      mockPrismaService.appointmentReview.aggregate.mockResolvedValueOnce({
        _avg: { rating: 5.0 },
      });
      mockPrismaService.appointmentReview.groupBy.mockResolvedValueOnce([
        { rating: 5, _count: { _all: 1 } },
      ]);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${doctorId}/reviews`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: [
          expect.objectContaining({
            id: 'rev-1',
            rating: 5,
            comment: 'Great doctor!',
          }),
        ],
        averageRating: 5,
        totalReviews: 1,
        ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
        meta: expect.objectContaining({
          total: 1,
          page: 1,
        }),
      });
    });
  });
});
