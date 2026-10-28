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
import { UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let testKeyPair: GenerateKeyPairResult;

  let mockPrismaService: {
    userProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  const mockSupabaseUrl = 'https://test-project.supabase.co';
  const patientUserId = '11111111-1111-4111-8111-111111111111';
  const doctorUserId = '22222222-2222-4222-8222-222222222222';
  const doctorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeAll(async () => {
    process.env.SUPABASE_URL = mockSupabaseUrl;
    testKeyPair = await generateKeyPair('RS256');

    mockPrismaService = {
      userProfile: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
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

    authService = moduleFixture.get<AuthService>(AuthService);
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

  describe('GET /auth/me', () => {
    it('returns 401 when Authorization header is omitted', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Authentication token is required');
    });

    it('returns 401 when Authorization header is malformed', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Basic invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain(
        'Malformed authorization header format',
      );
    });

    it('returns 401 when token is expired', async () => {
      const expiredToken = await createToken(patientUserId, '-10s');
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain(
        'Invalid or expired authentication token',
      );
    });

    it('returns 401 when user profile is not found in database', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce(null);
      const token = await createToken('00000000-0000-4000-8000-000000000000');

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain(
        'User profile not found in application database',
      );
    });

    it('returns 401 when user account is deactivated', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'inactive@example.com',
        fullName: 'Inactive Patient',
        phone: null,
        role: UserRole.PATIENT,
        isActive: false,
        doctorProfile: null,
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('User account is deactivated');
    });

    it('returns 200 with patient profile when token and database user are valid', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'John Patient',
        phone: '+1-555-0155',
        role: UserRole.PATIENT,
        isActive: true,
        doctorProfile: null,
      });

      const token = await createToken(patientUserId);
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: patientUserId,
        email: 'patient@example.com',
        fullName: 'John Patient',
        phone: '+1-555-0155',
        role: UserRole.PATIENT,
        isActive: true,
      });
    });

    it('returns 200 with doctor profile and doctorId when caller is an active doctor', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce({
        id: doctorUserId,
        email: 'doctor@hospital.org',
        fullName: 'Dr. John Watson',
        phone: '+1-555-0177',
        role: UserRole.DOCTOR,
        isActive: true,
        doctorProfile: {
          id: doctorId,
          isAcceptingBookings: true,
        },
      });

      const token = await createToken(doctorUserId);
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: doctorUserId,
        email: 'doctor@hospital.org',
        fullName: 'Dr. John Watson',
        phone: '+1-555-0177',
        role: UserRole.DOCTOR,
        isActive: true,
        doctorId,
      });
    });

    it('returns 401 Unauthorized (never 500) when token verification fails unexpectedly', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid.corrupted.token');

      expect(res.status).toBe(401);
      expect(res.body.statusCode).toBe(401);
      expect(res.body.message).toBe('Invalid or expired authentication token.');
    });
  });

  describe('Authenticated endpoints with invalid tokens return 401, not 500', () => {
    it('GET /appointments/mine returns 401 with invalid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/appointments/mine')
        .set('Authorization', 'Bearer invalid.corrupted.token');

      expect(res.status).toBe(401);
      expect(res.body.statusCode).toBe(401);
      expect(res.body.message).toBe('Invalid or expired authentication token.');
    });

    it('GET /appointments/today returns 401 with invalid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/appointments/today')
        .set('Authorization', 'Bearer invalid.corrupted.token');

      expect(res.status).toBe(401);
      expect(res.body.statusCode).toBe(401);
      expect(res.body.message).toBe('Invalid or expired authentication token.');
    });
  });

  describe('POST /auth/register', () => {
    it('creates a new patient profile and strictly enforces PATIENT role', async () => {
      const newUserId = '99999999-9999-4999-8999-999999999999';
      const token = await createToken(newUserId);

      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.userProfile.upsert.mockResolvedValueOnce({
        id: newUserId,
        email: 'user@example.com',
        fullName: 'Jane Doe',
        phone: '+1-555-9999',
        role: UserRole.PATIENT,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Jane Doe',
          phone: '+1-555-9999',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: newUserId,
        email: 'user@example.com',
        fullName: 'Jane Doe',
        phone: '+1-555-9999',
        role: UserRole.PATIENT,
        isActive: true,
      });

      // Verify Prisma upsert was called with PATIENT role
      expect(mockPrismaService.userProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            role: UserRole.PATIENT,
            fullName: 'Jane Doe',
          }),
        }),
      );
    });

    it('rejects registration without authentication token with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          fullName: 'Jane Doe',
        });

      expect(res.status).toBe(401);
    });

    it('idempotently handles repeated registration without duplicate creation or role modification', async () => {
      const existingUserId = '88888888-8888-4888-8888-888888888888';
      const token = await createToken(existingUserId);

      mockPrismaService.userProfile.upsert.mockResolvedValue({
        id: existingUserId,
        email: 'user@example.com',
        fullName: 'Jane Doe Updated',
        phone: '+1-555-8888',
        role: UserRole.PATIENT,
        isActive: true,
      });

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Jane Doe Updated',
          phone: '+1-555-8888',
        });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe(UserRole.PATIENT);
      expect(mockPrismaService.userProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existingUserId },
          create: expect.objectContaining({
            role: UserRole.PATIENT,
          }),
        }),
      );
    });

    it('rejects client-supplied role elevation attempt with 400 Bad Request', async () => {
      const token = await createToken('77777777-7777-4777-8777-777777777777');

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Malicious User',
          role: 'ADMIN',
        });

      expect(res.status).toBe(400);
    });
  });
});

