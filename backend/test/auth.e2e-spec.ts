import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GenerateKeyPairResult, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
      expect(res.body.message).toContain('Malformed authorization header format');
    });

    it('returns 401 when token is expired', async () => {
      const expiredToken = await createToken(patientUserId, '-10s');
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid or expired authentication token');
    });

    it('returns 401 when user profile is not found in database', async () => {
      mockPrismaService.userProfile.findUnique.mockResolvedValueOnce(null);
      const token = await createToken('00000000-0000-4000-8000-000000000000');

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('User profile not found in application database');
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
  });
});
